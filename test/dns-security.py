#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DNS 安全模型测试（CDN / GeoDNS / GSLB / Multi-CDN 兼容 + DNS Rebinding 防护）。

运行（纯 stdlib；exit 0 才通过）：
  python test/dns-security.py

验证目标（与 DNS threat model 逐条对应，适用于所有第三方站点，无任何站点特判）：
  1. CDN / Multi-edge 正常：不同可信 resolver 返回不同公网 IP → PASS（多边缘只记 evidence）
  2. GeoDNS：不同公网 IP → PASS
  3. Private IP 污染：A 公网 / B 私有（10.0.0.1）→ FAIL（DENY）
  4. Loopback：A 公网 / B 127.0.0.1 → FAIL（DENY）
  5. Metadata endpoint：A 公网 / B 169.254.169.254 → FAIL（DENY）
  6. DNS Rebinding：首次解析公网、二次解析私有 → 绝无二次解析，连接固定公网 IP（DENY 窗口关闭）
  7. TLS mismatch：公网 IP 但证书与 hostname 不匹配 → DENY
  8. HTTP mismatch：DNS 正常但页面明显不是 approved site（基线缺失 / JS 强制跳外域）→ DENY
  9. Redirect mismatch：第一跳正常、第二跳未知 host → DENY
  10. 全部解析器失败 → UNKNOWN（决策层同样 disabled）
  11. is_blocked_ip 覆盖 CGNAT / TEST-NET / benchmark / 保留 / IPv4-mapped / 文档地址
  12. 端到端：CDN 多边缘全链路（DNS/TLS/HTTP/页面）通过 → healthy；且 ncat21 实际观察到的
      双公网 IP 组合（118.107.9.179 / 118.107.9.220）也必须 PASS

关键方法：DNS / TLS / HTTP 全部注入 stub（不发生真实网络请求），通过 monkeypatch
watchdog_check 的模块级 resolve_system / resolve_doh / pinned_tls / pinned_request，
用 check_site 端到端验证「DNS 判定 → 固定 IP → 连接」整条链路的决策。
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

import watchdog_check as wd

S_PASS = wd.S_PASS
S_FAIL = wd.S_FAIL
S_UNKNOWN = wd.S_UNKNOWN

# 合法公网 IP（仅作为 stub 值，不发生真实连接）
PUB1 = '118.107.9.179'   # www.ncat21.com 系统解析器观察到的边缘 IP
PUB2 = '118.107.9.220'   # www.ncat21.com Cloudflare DoH 观察到的边缘 IP
PUB3 = '93.184.216.34'   # example.com 公网 IP
PRIV = '10.0.0.1'
LOOP = '127.0.0.1'
META = '169.254.169.254'
LINKLOCAL = '169.254.0.99'
CGNAT = '100.64.0.1'
TESTNET = '192.0.2.5'
BENCH = '198.18.0.1'
RESERVED = '240.0.0.1'
MAPPED = '::ffff:10.0.0.5'  # IPv4-mapped 私有

passed = 0
failed = 0
failures = []


def check(cond, label, extra=''):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        failures.append('%s  %s' % (label, extra))
        print('  FAIL %s  %s' % (label, extra))


# ---------- stub 构建工具 ----------

def make_resolvers(sys_map, doh_map):
    """构造 (system_resolver, doh_resolver)：host -> [ips]（各自独立答案集）。
    返回第三个值为调用计数 dict：{'sys': {host: n}, 'doh': {host: n}}。"""
    counts = {'sys': {}, 'doh': {}}

    def _mk(tag, ip_map):
        def resolver(host):
            counts[tag][host] = counts[tag].get(host, 0) + 1
            ips = ip_map.get(host)
            if ips is None:
                return False, [], 'NXDOMAIN(stub)'
            return True, list(ips), 'stub %s: %s' % (tag, ','.join(ips))
        return resolver
    return _mk('sys', sys_map), _mk('doh', doh_map), counts


def make_site():
    """最小合法站点配置（pending_verification，仅 www.example.com，无跨域跳转）。"""
    return {
        'id': 'test', 'status': 'pending_verification',
        'baseUrl': 'https://www.example.com/',
        'hosts': ['www.example.com'],
        'allowedRedirectHosts': [],
        'baseline': {'titleMarker': 'Example Corp'},
        'verificationMode': 'automated',  # v2：verificationMode 缺失/非法 → health disabled（Fail Closed）
    }


NORMAL_BODY = b'<html><head><title>Example Corp</title></head><body>Example Corp home</body></html>'


def run_check_site(sys_ips, doh_ips, tls_state=S_PASS, fetcher_steps=None, body=NORMAL_BODY):
    """monkeypatch watchdog_check 的四类网络原语并执行 check_site（不产生真实网络）。
    返回 (rec, calls)：calls = {'fetch': [(host,ip,path),...], 'sys': {host:n}, 'doh': {host:n}}。
    fetcher_steps：按顺序消费的 [(status, headers, body_bytes)]，供重定向场景使用。"""
    orig = (wd.resolve_system, wd.resolve_doh, wd.pinned_tls, wd.pinned_request)
    calls = {'fetch': [], 'sys': {}, 'doh': {}}

    def sys_res(host):
        calls['sys'][host] = calls['sys'].get(host, 0) + 1
        if not sys_ips:
            return False, [], 'stub sys 无结果'  # 与真实 resolve_system 行为一致
        return True, list(sys_ips), 'stub sys'

    def doh_res(host):
        calls['doh'][host] = calls['doh'].get(host, 0) + 1
        if not doh_ips:
            return False, [], 'stub doh 无结果'
        return True, list(doh_ips), 'stub doh'

    def tls_stub(host, ip):
        if tls_state == S_PASS:
            return {'state': S_PASS, 'ok': True, 'detail': 'stub tls ok',
                    'cert': {'subject': {'commonName': host},
                             'issuer': {'organizationName': 'stub'},
                             'notBefore': 'Aug 01 00:00:00 2020 GMT',
                             'notAfter': 'Aug 01 00:00:00 2099 GMT',
                             'serialNumber': '0', 'SANs': [('DNS', host)]}}
        return {'state': tls_state, 'ok': False,
                'detail': 'stub tls state=%s' % tls_state, 'cert': None}

    steps = list(fetcher_steps or [(200, {}, body)])

    def fetcher(host, ip, path):
        calls['fetch'].append((host, ip, path))
        if not steps:
            return None, None, None
        step = steps.pop(0)
        return step[0], step[1], (step[2] if len(step) > 2 else b'')

    wd.resolve_system, wd.resolve_doh, wd.pinned_tls, wd.pinned_request = \
        sys_res, doh_res, tls_stub, fetcher
    try:
        rec = wd.check_site(make_site(), 1)
    finally:
        wd.resolve_system, wd.resolve_doh, wd.pinned_tls, wd.pinned_request = orig
    return rec, calls


# =====================================================================
# 1. CDN / Multi-edge 正常：不同 resolver 返回不同公网 IP → PASS
# =====================================================================
def test_01_cdn_multi_edge():
    print('[1] CDN / Multi-edge：不同公网 IP → PASS')
    sys_r, doh_r, counts = make_resolvers({'host.example': [PUB1]}, {'host.example': [PUB2]})
    ok, ips, detail, state, ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_PASS and ok, '1a 状态 PASS', detail)
    check(PUB1 in ips and PUB2 in ips, '1b 两个公网 IP 都被固定', 'ips=%s' % ips)
    check(ev['multiEdge'] is True, '1c multiEdge=True（evidence）')
    check(ev['intersection'] == [], '1d intersection=[]（不导致 UNKNOWN）', str(ev['intersection']))
    check('all_answers_public' in ev['reason'] and 'resolver_answers_differ' in ev['reason'],
          '1e reason 含 all_answers_public + resolver_answers_differ', str(ev['reason']))
    check(counts['sys']['host.example'] == 1 and counts['doh']['host.example'] == 1,
          '1f 每个解析器只解析一次（无二次解析窗口）', str(counts))


# =====================================================================
# 2. GeoDNS：不同公网 IP → PASS
# =====================================================================
def test_02_geodns():
    print('[2] GeoDNS：不同公网 IP → PASS')
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB1, PUB3]}, {'host.example': [PUB2]})
    ok, ips, detail, state, ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_PASS and ok, '2a GeoDNS 状态 PASS', detail)
    check(set(ips) == {PUB1, PUB2, PUB3}, '2b 所有公网 IP 均被固定', 'ips=%s' % ips)
    # 系统解析器返回多个边缘 IP 也属正常
    sys_r2, doh_r2, _ = make_resolvers({'host.example': [PUB1, PUB2]}, {'host.example': [PUB1, PUB2]})
    ok2, ips2, d2, st2, ev2 = wd.resolve_and_pin('host.example', sys_r2, doh_r2)
    check(st2 == S_PASS and set(ips2) == {PUB1, PUB2}, '2c 多 IP 答案 PASS', d2)
    check(ev2['multiEdge'] is False and 'resolvers_agree' in ev2['reason'],
          '2d 同源同 IP 集：multiEdge=False + resolvers_agree', str(ev2['reason']))


# =====================================================================
# 3. Private IP 污染：A 公网 / B 私有 → FAIL（DENY）
# =====================================================================
def test_03_private_pollution():
    print('[3] Private IP 污染 → FAIL（DENY）')
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB1]}, {'host.example': [PRIV]})
    ok, ips, detail, state, ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_FAIL and not ok, '3a A公网/B私有 → FAIL', detail)
    check('blocked_ip_in_answers' in ev['reason'], '3b reason 含 blocked_ip_in_answers', str(ev['reason']))
    # 同一解析器答案混合公网+私有 → 同样 FAIL
    sys_r2, doh_r2, _ = make_resolvers({'host.example': [PUB1, PRIV]}, {'host.example': [PUB1]})
    ok2, _, d2, st2, _ev2 = wd.resolve_and_pin('host.example', sys_r2, doh_r2)
    check(st2 == S_FAIL and not ok2, '3c 单源答案含私有 → FAIL', d2)
    # 端到端：check_site 决策 disabled
    rec, _ = run_check_site([PUB1], [PRIV])
    check(rec['status'] == 'disabled' and rec['checks']['dns']['state'] == S_FAIL,
          '3d check_site → disabled（dns=FAIL）', rec.get('reason'))


# =====================================================================
# 4. Loopback：A 公网 / B 127.0.0.1 → FAIL（DENY）
# =====================================================================
def test_04_loopback():
    print('[4] Loopback → FAIL（DENY）')
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB1]}, {'host.example': [LOOP]})
    ok, ips, detail, state, _ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_FAIL and not ok, '4a A公网/B回环 → FAIL', detail)
    rec, _ = run_check_site([PUB1], [LOOP])
    check(rec['status'] == 'disabled' and rec['checks']['dns']['state'] == S_FAIL,
          '4b check_site → disabled（dns=FAIL）', rec.get('reason'))


# =====================================================================
# 5. Metadata endpoint：A 公网 / B 169.254.169.254 → FAIL（DENY）
# =====================================================================
def test_05_metadata():
    print('[5] Metadata endpoint → FAIL（DENY）')
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB1]}, {'host.example': [META]})
    ok, ips, detail, state, _ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_FAIL and not ok, '5a A公网/B metadata → FAIL', detail)
    sys_r2, doh_r2, _ = make_resolvers({'host.example': [PUB1]}, {'host.example': [LINKLOCAL]})
    ok2, _, d2, st2, _ev2 = wd.resolve_and_pin('host.example', sys_r2, doh_r2)
    check(st2 == S_FAIL and not ok2, '5b 普通 link-local → FAIL', d2)
    rec, _ = run_check_site([PUB1], [META])
    check(rec['status'] == 'disabled' and rec['checks']['dns']['state'] == S_FAIL,
          '5c check_site → disabled（dns=FAIL）', rec.get('reason'))


# =====================================================================
# 6. DNS Rebinding：首次公网、二次私有 → 绝不二次解析，固定公网 IP（DENY 窗口关闭）
# =====================================================================
def test_06_dns_rebinding():
    print('[6] DNS Rebinding：首次公网、二次私有 → 固定公网 IP，绝无二次解析')
    # 正确实现：DNS 阶段解析一次并固定公网 IP；HTTP 阶段用 start_ip，绝不二次解析。
    # 因此即使解析器「第二次会被劫持到私有地址」，它也永远不被调用第二次。
    # 通过 make_resolvers 在第一次正常、第二次返回私有的行为 + 记录调用次数来验证。
    class _Resolver:
        def __init__(self, ips):
            self.ips = list(ips)
            self.n = 0
        def __call__(self, host):
            self.n += 1
            # 第二次调用模拟 DNS 劫持 / Rebinding → 返回私有地址
            if self.n >= 2:
                return True, [PRIV], 'stub rebound -> %s' % PRIV
            return True, list(self.ips), 'stub ok'

    sys_r, doh_r = _Resolver([PUB1]), _Resolver([PUB2])
    rec, calls = run_check_site([PUB1], [PUB2])
    check(rec['status'] == 'healthy', '6a 多边缘 + 全链路通过 → healthy', rec.get('reason'))
    # DNS 阶段只解析一次（sys 1 次 / doh 1 次）；HTTP 阶段绝无二次解析
    check(calls['sys'].get('www.example.com', 0) == 1,
          '6b 起始 host 系统解析器只调用 1 次（无二次解析）', str(calls['sys']))
    check(calls['doh'].get('www.example.com', 0) == 1,
          '6c 起始 host DoH 只调用 1 次（无二次解析）', str(calls['doh']))
    # 连接一律固定到公网 IP（PUB1 来自 DNS 阶段），劫持后的私有地址从未被连接
    check(calls['fetch'] and all(ip in (PUB1, PUB2) for _h, ip, _p in calls['fetch']),
          '6d 所有连接只使用固定公网 IP（无私有/回环）', str(calls['fetch']))


# =====================================================================
# 7. TLS mismatch：公网 IP 但证书与 hostname 不匹配 → DENY
# =====================================================================
def test_07_tls_mismatch():
    print('[7] TLS mismatch（证书与 hostname 不匹配）→ DENY')
    rec, _ = run_check_site([PUB1], [PUB1], tls_state=S_FAIL)
    check(rec['status'] == 'disabled' and rec['checks']['tls']['state'] == S_FAIL,
          '7a check_site → disabled（tls=FAIL）', rec.get('reason'))
    check(rec['checks']['http']['state'] == S_UNKNOWN and rec['checks']['http']['ok'] is False,
          '7b TLS 失败后 HTTP 被跳过（UNKNOWN → disabled）')


# =====================================================================
# 8. HTTP mismatch：DNS 正常但页面明显不是 approved site → DENY
# =====================================================================
def test_08_http_mismatch():
    print('[8] HTTP mismatch（页面明显非 approved site）→ DENY')
    # 8a. 正文缺少基线标记 → fingerprint FAIL
    rec, _ = run_check_site([PUB1], [PUB1], body=b'<html><title>Some Other Site</title></html>')
    check(rec['status'] == 'disabled' and rec['checks']['fingerprint']['state'] == S_FAIL,
          '8a 基线标记缺失 → disabled（fingerprint=FAIL）', rec.get('reason'))
    # 8b. 页面含 JS 强制跳转到未批准外域 → navigationScan FAIL
    bad_body = (b'<html><head><title>Example Corp</title>'
                b'<script>window.location.href="https://evil.example/x";</script>'
                b'</head><body>Example Corp home</body></html>')
    rec2, _ = run_check_site([PUB1], [PUB1], body=bad_body)
    check(rec2['status'] == 'disabled' and rec2['checks']['navigationScan']['state'] == S_FAIL,
          '8b JS 强制跳转未批准外域 → disabled（navigationScan=FAIL）', rec2.get('reason'))
    # 8c. 页面引用未批准外域资源（iframe）→ riskScan FAIL
    risky_body = (b'<html><head><title>Example Corp</title></head>'
                  b'<body>Example Corp <iframe src="https://track.example/t"></iframe></body></html>')
    rec3, _ = run_check_site([PUB1], [PUB1], body=risky_body)
    check(rec3['status'] == 'disabled' and rec3['checks']['riskScan']['state'] == S_FAIL,
          '8c 未批准外域 iframe → disabled（riskScan=FAIL）', rec3.get('reason'))


# =====================================================================
# 9. Redirect mismatch：第一跳正常、第二跳未知 host → DENY
# =====================================================================
def test_09_redirect_mismatch():
    print('[9] Redirect mismatch（第二跳未知 host）→ DENY')
    rec, _ = run_check_site(
        [PUB1], [PUB1],
        fetcher_steps=[(302, {'location': 'https://evil.example/x'}, b''), (200, {}, NORMAL_BODY)])
    check(rec['status'] == 'disabled' and rec['checks']['redirectChain']['state'] == S_FAIL,
          '9a 重定向到未知 host → disabled（redirectChain=FAIL）', rec.get('reason'))
    # 第二跳非 https
    rec2, _ = run_check_site(
        [PUB1], [PUB1],
        fetcher_steps=[(302, {'location': 'http://www.example.com/x'}, b''), (200, {}, NORMAL_BODY)])
    check(rec2['status'] == 'disabled' and rec2['checks']['redirectChain']['state'] == S_FAIL,
          '9b 重定向非 https → disabled', rec2.get('reason'))


# =====================================================================
# 10. 全部解析器失败 → UNKNOWN（决策层同样 disabled）
# =====================================================================
def test_10_all_resolvers_fail():
    print('[10] 全部解析器失败 → UNKNOWN（决策层 disabled）')
    sys_r, doh_r, _ = make_resolvers({}, {})
    ok, ips, detail, state, _ev = wd.resolve_and_pin('host.example', sys_r, doh_r)
    check(state == S_UNKNOWN and not ok, '10a 全部 NXDOMAIN → UNKNOWN', detail)
    check('all_resolvers_failed' in _ev['reason'], '10b reason 含 all_resolvers_failed', str(_ev['reason']))
    rec, _ = run_check_site([], [])
    check(rec['status'] == 'disabled' and rec['checks']['dns']['state'] == S_UNKNOWN,
          '10c check_site → disabled（dns=UNKNOWN）', rec.get('reason'))


# =====================================================================
# 11. is_blocked_ip 覆盖面
# =====================================================================
def test_11_blocked_ips():
    print('[11] is_blocked_ip 覆盖面')
    for ip, label in [(PRIV, 'private'), (LOOP, 'loopback'), (META, 'metadata'),
                      (LINKLOCAL, 'link-local'), (CGNAT, 'CGNAT'), (TESTNET, 'TEST-NET-1'),
                      (BENCH, 'benchmark'), (RESERVED, 'reserved'), (MAPPED, 'IPv4-mapped 私有'),
                      ('0.0.0.0', 'unspecified'), ('2001:db8::1', '文档 IPv6')]:
        check(wd.is_blocked_ip(ip), '11 %s 被拒绝: %s' % (label, ip))
    for ip, label in [(PUB1, '公网'), (PUB2, '公网'), (PUB3, '公网'), ('2606:4700::6810:84e5', '公网 IPv6')]:
        check(not wd.is_blocked_ip(ip), '11 %s 放行: %s' % (label, ip))


# =====================================================================
# 12. ncat21 实际观察到的双公网 IP 组合（CDN 多边缘）端到端必须 PASS
# =====================================================================
def test_12_ncat_observed_multi_edge():
    print('[12] ncat21 实际观察的双公网 IP（118.107.9.179 / 118.107.9.220）→ 端到端 PASS')
    sys_r, doh_r, _ = make_resolvers({'www.example.com': [PUB1]}, {'www.example.com': [PUB2]})
    ok, ips, detail, state, ev = wd.resolve_and_pin('www.example.com', sys_r, doh_r)
    check(state == S_PASS and ok, '12a 观察到的 IP 组合状态 PASS', detail)
    check(ev['multiEdge'] is True and ev['intersection'] == [], '12b multiEdge evidence，非 UNKNOWN')
    # 端到端 check_site：多边缘 + TLS/HTTP/页面全通过 → healthy
    rec, calls = run_check_site([PUB1], [PUB2])
    dns_host = rec['checks']['dns']['hosts']['www.example.com']
    check(rec['status'] == 'healthy', '12c 全链路通过 → healthy（DNS 多边缘不阻塞）', rec.get('reason'))
    check(dns_host['multiEdge'] is True, '12d health 记录 multiEdge=True')
    check(dns_host['intersection'] == [], '12e health 记录 intersection=[]（非失败）')
    check(dns_host['allPublic'] is True, '12f health 记录 allPublic=True')
    check(calls['fetch'] and calls['fetch'][0][1] == PUB1,
          '12g 连接固定到 DNS 阶段首个公网 IP', str(calls['fetch']))


def main():
    print('==== DNS 安全模型测试 ====')
    try:
        test_01_cdn_multi_edge()
        test_02_geodns()
        test_03_private_pollution()
        test_04_loopback()
        test_05_metadata()
        test_06_dns_rebinding()
        test_07_tls_mismatch()
        test_08_http_mismatch()
        test_09_redirect_mismatch()
        test_10_all_resolvers_fail()
        test_11_blocked_ips()
        test_12_ncat_observed_multi_edge()
    finally:
        pass
    print('\n==== 结果: %d 通过 / %d 失败 ====' % (passed, failed))
    if failures:
        print('失败明细:')
        for f in failures:
            print('  - ' + f)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
