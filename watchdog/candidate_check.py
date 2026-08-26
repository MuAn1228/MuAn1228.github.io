#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
候选域名技术核验引擎（candidate verification）—— 纯函数库。

用途：对「已被管理员显式标记为 READY_FOR_CHECK」的候选 hostname 执行预定义技术检查。
本模块只返回核验报告 dict，绝不写 candidates.json / sites.json / health.json /
watch.js / movies.json。状态流转（TECHNICALLY_ELIGIBLE 等）由 candidate_review.py 负责。

======================================================================
SSRF / DNS Rebinding 防护（复用正式 watchdog 的检查实现 + 更严格的连接固定）：
  1. hostname 必须是合法公网 hostname，禁止 IP 直连（v4/v6，含 mapped）。
  2. DNS 解析一次（系统 + Cloudflare DoH 双源交叉；判定逻辑委托 wd.resolve_and_pin，
     单一事实来源，适用于所有第三方站点，无任何特判）→ 只接受公网 IP：
        - 不同 resolver 返回不同公网 IP → CDN / GeoDNS / GSLB / Multi-CDN 多边缘
          正常现象，只记录为 evidence，不构成 UNKNOWN；
        - 任一 resolver 答案含被禁止地址（loopback / private / link-local / multicast /
          CGNAT / metadata / 保留 / 未指定 / 文档与测试地址）→ FAIL；
        - 全部 resolver 失败 / 超时 / 无法取得可验证 IP → UNKNOWN。
  3. 连接固定到「已核验的公网 IP」：socket 连 IP，TLS SNI = 候选 hostname，
     HTTP Host 头 = 候选 hostname。绝不出现「第一次检查一个 IP、第二次连接
     又自行解析一次」的 DNS Rebinding 窗口。
  4. redirect chain 每一跳都重新执行：
       hostname 校验 → DNS/IP 校验 → HTTPS 校验 → allowlist / candidate policy
     （默认 allowlist 只含候选 host 自身；跳到其他 host 一律 FAIL）。
  5. 任何 FAIL / UNKNOWN → 该候选不通过技术核验（verdict = NOT_ELIGIBLE）。
======================================================================

TECHNICALLY_ELIGIBLE 的语义（务必与 AGENTS.md 保持一致）：
  - 仅表示「当前候选 hostname 通过预定义技术检查」。
  - 绝不表示「已证明是网飞猫官方域名」。
  - 最终身份批准只有一条路径：人工审核 → 人工修改 sites.json → approved。
  因此本引擎对「身份/基线指纹」只做证据收集（title/description/marker 命中），
  不作为 ELIGIBLE 的 gate —— 身份证明不属于技术核验范畴。
"""
import ipaddress
import json
import os
import re
import socket
import ssl
import sys
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import watchdog_check as wd  # 复用：双源 DNS 原语 / 页面扫描 / 风险扫描 / 环境记录

S_PASS = wd.S_PASS
S_FAIL = wd.S_FAIL
S_UNKNOWN = wd.S_UNKNOWN

MAX_REDIRECTS = 5
REQUEST_TIMEOUT = 15
MAX_BODY = 2 * 1024 * 1024
USER_AGENT = 'MuAn-blog-candidate-check/1.0 (security-check)'

def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# is_blocked_ip / resolve_and_pin 委托正式 watchdog 的同名实现（单一事实来源），
# 保证候选核验与正式 watchdog 的 DNS/IP 判断完全一致，包括 CDN/GeoDNS 多边缘兼容
# 与 IP Pinning。任何站点都无特判。
is_blocked_ip = wd.is_blocked_ip


def validate_public_hostname(host):
    """合法公网 hostname 校验（禁止 IP 直连 / userinfo / 非法标签）。
    返回 (ok, reason)；ok=True 时 reason 为规范化 host。"""
    if not isinstance(host, str) or not host:
        return False, 'host 为空'
    h = host.strip().lower().rstrip('.')
    if not h:
        return False, 'host 为空'
    # 禁止 IP 直连（含 IPv4 / IPv6 / mapped）
    try:
        ipaddress.ip_address(h)
        return False, '禁止 IP 直连: %s' % h
    except ValueError:
        pass
    # 禁止 scheme / userinfo / port / path
    if '@' in h or ':' in h or '/' in h or '\\' in h:
        return False, 'host 含非法字符（scheme/userinfo/port/path）: %s' % h
    if h.startswith('.') or '..' in h:
        return False, 'host 标签非法: %s' % h
    if len(h) > 253:
        return False, 'host 过长'
    labels = h.split('.')
    if len(labels) < 2:
        return False, '缺少有效顶级域（单标签 host 不可信）: %s' % h
    for lab in labels:
        if not 1 <= len(lab) <= 63:
            return False, '标签长度非法: %r' % lab
        if not re.match(r'^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$', lab):
            return False, '标签字符非法: %r' % lab
    return True, h


def resolve_and_pin(host, system_resolver=None, doh_resolver=None):
    """双源 DNS 交叉 + 固定公网 IP。
    返回 (ok, ips, detail, state)：
      - ok=True 时 ips 为固定公网 IP 列表（已过滤所有非公网地址）；
      - state 为 S_PASS / S_FAIL / S_UNKNOWN（UNKNOWN=无法确认，同样不通过）。
    判定逻辑委托正式 watchdog 的 wd.resolve_and_pin（单一事实来源），保证候选核验与
    正式 watchdog 的 DNS 模型完全一致：CDN/GeoDNS 多边缘（不同 resolver 返回不同公网 IP）
    属正常现象，只记 evidence 不判 UNKNOWN；任一 resolver 含被禁止地址（private/loopback/
    metadata/CGNAT 等）→ FAIL；全部 resolver 失败 → UNKNOWN。任何站点无特判。
    关键：只解析一次并固定 IP；后续连接一律使用本函数返回的 IP，绝不二次解析。"""
    ok, ips, detail, state, _evidence = wd.resolve_and_pin(host, system_resolver, doh_resolver)
    return ok, ips, detail, state


def pinned_request(host, ip, path, port=443, timeout=REQUEST_TIMEOUT, max_body=MAX_BODY):
    """单跳 HTTPS GET：连固定公网 IP，TLS SNI=host，Host 头=host。
    返回 (status, headers, body)；连接/协议失败返回 (None, None, None)。"""
    path = path or '/'
    if not path.startswith('/'):
        path = '/' + path
    ctx = ssl.create_default_context()
    try:
        raw = socket.create_connection((ip, port), timeout=timeout)
    except Exception:
        return None, None, None
    try:
        ssock = ctx.wrap_socket(raw, server_hostname=host)  # SNI=host + 证书按 host 校验
    except Exception:
        try:
            raw.close()
        except Exception:
            pass
        return None, None, None
    try:
        req = ('GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: %s\r\n'
               'Accept: text/html,*/*\r\nConnection: close\r\n\r\n'
               % (path, host, USER_AGENT))
        ssock.sendall(req.encode('utf-8'))
        buf = b''
        while True:
            chunk = ssock.recv(65536)
            if not chunk:
                break
            buf += chunk
            if len(buf) > max_body + 65536:
                break
    except Exception:
        return None, None, None
    finally:
        try:
            ssock.close()
        except Exception:
            pass
    head, sep, body = buf.partition(b'\r\n\r\n')
    if not sep:
        return None, None, None
    status_line = head.split(b'\r\n', 1)[0].decode('latin-1', 'replace')
    m = re.match(r'HTTP/\d(?:\.\d)?\s+(\d{3})', status_line)
    if not m:
        return None, None, None
    headers = {}
    for line in head.split(b'\r\n')[1:]:
        if b':' in line:
            k, v = line.split(b':', 1)
            headers[k.decode('latin-1', 'replace').strip().lower()] = v.decode(
                'latin-1', 'replace').strip()
    return int(m.group(1)), headers, body[:max_body]


def pinned_tls(host, ip, port=443):
    """TLS 握手 + 证书校验（连固定公网 IP，SNI=host）。返回 dict（含 cert 证据）。"""
    ctx = ssl.create_default_context()
    try:
        raw = socket.create_connection((ip, port), timeout=REQUEST_TIMEOUT)
    except Exception as e:
        return {'state': S_UNKNOWN, 'ok': False, 'detail': '连接失败: %s' % e, 'cert': None}
    try:
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        cert = ssock.getpeercert()
    except ssl.SSLCertVerificationError as e:
        try:
            raw.close()
        except Exception:
            pass
        return {'state': S_FAIL, 'ok': False, 'detail': '证书校验失败: %s' % e, 'cert': None}
    except Exception as e:
        try:
            raw.close()
        except Exception:
            pass
        return {'state': S_UNKNOWN, 'ok': False, 'detail': 'TLS 无法完成: %s' % e, 'cert': None}
    try:
        ssock.close()
    except Exception:
        pass
    if not cert:
        return {'state': S_FAIL, 'ok': False, 'detail': '未获取到服务器证书', 'cert': None}
    try:
        nb = wd._parse_asn1_time(cert['notBefore'])
        na = wd._parse_asn1_time(cert['notAfter'])
    except Exception as e:
        return {'state': S_FAIL, 'ok': False, 'detail': '证书时间解析失败: %s' % e, 'cert': None}
    now = datetime.utcnow()
    if now < nb:
        return {'state': S_FAIL, 'ok': False, 'detail': '证书尚未生效（notBefore=%s）' % cert['notBefore'], 'cert': None}
    if now > na:
        return {'state': S_FAIL, 'ok': False, 'detail': '证书已过期（notAfter=%s）' % cert['notAfter'], 'cert': None}
    cert_info = {
        'subject': dict(x[0] for x in cert.get('subject', ())),
        'issuer': dict(x[0] for x in cert.get('issuer', ())),
        'notBefore': cert['notBefore'],
        'notAfter': cert['notAfter'],
        'serialNumber': cert.get('serialNumber'),
        'SANs': cert.get('subjectAltName'),
    }
    return {'state': S_PASS, 'ok': True,
            'detail': 'TLS ok; 固定公网 IP=%s, SNI=%s（notAfter=%s）' % (ip, host, cert['notAfter']),
            'cert': cert_info}


def extract_page_evidence(body):
    """页面身份/稳定标记证据（仅供人工核验参考，不是安全证明，不作为 gate）。"""
    if not body:
        return {'title': None, 'description': None, 'markerHits': {}}
    text = body.decode('utf-8', errors='replace')
    ev = {}
    m = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
    ev['title'] = m.group(1).strip()[:200] if m else None
    m2 = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']',
                   text, re.I | re.S)
    ev['description'] = m2.group(1).strip()[:300] if m2 else None
    ev['markerHits'] = {}
    for kw in ('网飞猫', 'ncat', 'NCAT', 'ncat21'):
        ev['markerHits'][kw] = len(re.findall(re.escape(kw), text, re.I))
    return ev


def _follow_pinned_http(base_url, allowed_hosts, system_resolver, doh_resolver, fetcher,
                        start_ip=None):
    """固定 IP 逐跳跟随重定向。每跳重新执行 hostname / DNS+IP / HTTPS / allowlist 校验。
    起始 host 的 IP 由调用方传入（start_ip，来自先前唯一一次 DNS 解析并固定），
    绝不在此处对起始 host 二次解析——避免「检查一个 IP、连接又解析一次」的 DNS Rebinding 窗口。
    重定向产生的新 hostname 才需要重新解析（并再次固定）。
    返回 (http_state, status, hops, hops_detail, body, detail, final_host)。"""
    u = urllib.parse.urlparse(base_url)
    cur_host = (u.hostname or '').lower().rstrip('.')
    cur_path = (u.path or '/') + ('?' + u.query if u.query else '')
    final_status = None
    final_host = cur_host
    body = None
    hops, hops_detail = [], []

    if start_ip is not None:
        cur_ip = start_ip
    else:
        ok_dns, ips, dns_detail, dns_state = resolve_and_pin(cur_host, system_resolver, doh_resolver)
        if not ok_dns:
            return S_FAIL, None, hops, hops_detail, None, '起始 hostname DNS 未通过: %s' % dns_detail, final_host
        cur_ip = ips[0]

    for _ in range(MAX_REDIRECTS + 1):
        url = 'https://%s%s' % (cur_host, cur_path)
        status, headers, body = fetcher(cur_host, cur_ip, cur_path)
        loc = (headers or {}).get('location')
        hops.append(url)
        hd = {'url': url, 'status': status, 'location': loc, 'host': cur_host, 'ip': cur_ip}
        hops_detail.append(hd)
        if status is None:
            hd['state'] = S_UNKNOWN
            return S_UNKNOWN, None, hops, hops_detail, body, '请求失败，无法确认: %s' % url, final_host
        final_status = status
        if status in (301, 302, 303, 307, 308):
            if not loc:
                hd.update({'state': S_FAIL, 'detail': '重定向缺 Location'})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向缺 Location', final_host
            nxt = urllib.parse.urljoin(url, loc)
            nu = urllib.parse.urlparse(nxt)
            if nu.scheme != 'https':
                hd.update({'state': S_FAIL, 'detail': '重定向非 https: %s' % nxt})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向非 https', final_host
            if nu.username or nu.password:
                hd.update({'state': S_FAIL, 'detail': '重定向含 userinfo: %s' % nxt})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向含 userinfo', final_host
            nhost = (nu.hostname or '').lower().rstrip('.')
            ok_h, reason = validate_public_hostname(nhost)
            if not ok_h:
                hd.update({'state': S_FAIL, 'detail': '重定向 host 非法（%s）: %s' % (reason, nxt)})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向 host 非法', final_host
            if nhost not in allowed_hosts:
                hd.update({'state': S_FAIL, 'detail': '重定向到未批准 host: %s' % nxt})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向到未批准 host', final_host
            ok_r, ips_r, detail_r, state_r = resolve_and_pin(nhost, system_resolver, doh_resolver)
            if not ok_r:
                hd.update({'state': S_FAIL, 'detail': '重定向 host DNS/IP 未通过: %s' % detail_r})
                return S_FAIL, final_status, hops, hops_detail, body, '重定向 host DNS/IP 未通过', final_host
            cur_host = nhost
            cur_ip = ips_r[0]
            cur_path = (nu.path or '/') + ('?' + nu.query if nu.query else '')
            continue
        if 200 <= status < 300:
            hd['state'] = S_PASS
            return S_PASS, final_status, hops, hops_detail, body, None, final_host
        hd.update({'state': S_UNKNOWN, 'detail': 'HTTP 状态异常: %d' % status})
        return S_UNKNOWN, final_status, hops, hops_detail, body, 'HTTP 状态异常: %d（无法确认内容）' % status, final_host
    return S_FAIL, final_status, hops, hops_detail, body, '重定向次数超限（>%d）' % MAX_REDIRECTS, final_host


def verify_candidate(host, allowed_hosts=None, system_resolver=None, doh_resolver=None,
                     tls_func=None, fetcher=None):
    """对候选 hostname 执行完整技术核验（纯函数，无任何文件写入）。

    参数均可注入（测试 / 隔离网络使用）：
      - system_resolver / doh_resolver：DNS 双源函数，默认 watchdog_check.resolve_system / resolve_doh
      - tls_func(host, ip)：TLS 握手，默认 pinned_tls
      - fetcher(host, ip, path)：单跳 GET，默认 pinned_request

    返回报告 dict：
      - verdict: 'ELIGIBLE'（全部技术 gate PASS）/ 'NOT_ELIGIBLE'
      - gates:   hostname / dns / tls / http / redirectChain / navigationScan / riskScan
      - evidence: title / description / markerHits / externalHosts（身份线索，非 gate）
    """
    allowed = set(allowed_hosts) if allowed_hosts else set()
    if not allowed:
        ok_h, reason = validate_public_hostname(host)
        if not ok_h:
            allowed = set()
        else:
            allowed = {host}
    tls_func = tls_func or pinned_tls
    fetcher = fetcher or pinned_request

    report = {
        'schemaVersion': 1,
        'candidate': host,
        'verifiedAt': now_iso(),
        'verdict': 'NOT_ELIGIBLE',
        'environment': wd.collect_environment(),
        'gates': {},
        'evidence': {},
        'note': ('TECHNICALLY_ELIGIBLE 仅表示当前候选 hostname 通过预定义技术检查；'
                 '绝不表示已证明是官方域名。最终身份批准只能由人工审核后修改 sites.json。'),
    }

    # 1) hostname
    ok_h, reason = validate_public_hostname(host)
    report['gates']['hostname'] = {'state': S_PASS if ok_h else S_FAIL, 'ok': ok_h,
                                   'detail': reason if not ok_h else 'hostname 合法'}
    if not ok_h:
        return report

    # 2) DNS（双源交叉 + 固定公网 IP）
    ok_dns, ips, dns_detail, dns_state = resolve_and_pin(host, system_resolver, doh_resolver)
    report['gates']['dns'] = {'state': dns_state, 'ok': ok_dns, 'ips': ips, 'detail': dns_detail}
    if not ok_dns:
        return report
    pinned_ip = ips[0]

    # 3) TLS（固定 IP，SNI=host）
    tls = tls_func(host, pinned_ip)
    report['gates']['tls'] = tls
    if tls['state'] != S_PASS:
        return report

    # 4) HTTP + redirect chain（每跳重新校验 + 固定 IP）
    # start_ip=pinned_ip：起始 host 的 IP 复用上面唯一一次 DNS 解析结果并固定，
    # 绝不在 HTTP 阶段对该 host 二次解析 —— 堵住「检查一个 IP、连接又解析一次」的 DNS Rebinding 窗口。
    base_url = 'https://%s/' % host
    http_state, status, hops, hops_detail, body, http_detail, final_host = \
        _follow_pinned_http(base_url, allowed, system_resolver, doh_resolver, fetcher,
                            start_ip=pinned_ip)
    http_ok = http_state == S_PASS
    redirect_ok = http_ok and len(hops) >= 1 and http_detail is None
    report['gates']['http'] = {'state': http_state, 'ok': http_ok, 'status': status,
                               'detail': http_detail or 'HTTP ok'}
    report['gates']['redirectChain'] = {
        'state': S_PASS if redirect_ok else http_state, 'ok': redirect_ok,
        'hops': hops, 'hopsDetail': hops_detail, 'finalHostname': final_host,
        'detail': http_detail or '重定向链逐跳校验通过，最终 hostname=%s' % final_host}
    if not http_ok:
        return report

    # 5) 页面导航结构（gate 强制跳转；外域分类仅证据）
    if body:
        nav = wd.scan_page_navigation(body, allowed)
        report['gates']['navigationScan'] = {
            'state': nav['state'], 'ok': nav['state'] == S_PASS,
            'metaRefresh': nav['metaRefresh'], 'jsForcedRedirect': nav['jsForcedRedirect'],
            'detail': nav['detail']}
        report['evidence']['externalHosts'] = nav['externalHosts']

        # 6) 风险扫描（gate：非 http(s) 引用 / 下载链接 / 外域脚本 / iframe / 表单等）
        r_ok, r_d, risks = wd.check_risk_scan(body, allowed)
        report['gates']['riskScan'] = {'state': S_PASS if r_ok else S_FAIL, 'ok': r_ok,
                                       'detail': r_d, 'risks': risks[:10]}

        # 7) 身份/稳定标记证据（不 gate —— 身份不属于技术核验范畴）
        report['evidence'].update(extract_page_evidence(body))
    else:
        for key in ('navigationScan', 'riskScan'):
            report['gates'][key] = {'state': S_UNKNOWN, 'ok': False, 'detail': '未获取正文（UNKNOWN）'}
        if 'navigationScan' in report['gates']:
            report['gates']['navigationScan']['metaRefresh'] = []
            report['gates']['navigationScan']['jsForcedRedirect'] = []
        if 'riskScan' in report['gates']:
            report['gates']['riskScan']['risks'] = []

    # ---- verdict：全部 gate PASS → ELIGIBLE ----
    gated = {k: v for k, v in report['gates'].items() if isinstance(v, dict) and 'ok' in v}
    all_pass = bool(gated) and all(v['state'] == S_PASS for v in gated.values())
    report['verdict'] = 'ELIGIBLE' if all_pass else 'NOT_ELIGIBLE'
    return report


if __name__ == '__main__':
    # 命令行用法：python watchdog/candidate_check.py <host>
    if len(sys.argv) < 2:
        print('usage: python watchdog/candidate_check.py <host>')
        sys.exit(1)
    rep = verify_candidate(sys.argv[1].strip().lower())
    print(json.dumps(rep, ensure_ascii=False, indent=2))
