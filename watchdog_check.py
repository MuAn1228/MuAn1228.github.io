#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
网飞猫外链安全看门狗（watchdog）—— 方案 A 的第三方站点健康检查。

读取 source/data/sites.json（人工审核白名单），对 status=healthy 与 status=pending_verification
的站点执行 dns / tls / http / redirectChain / navigationScan / fingerprint / riskScan 检查，
并生成 source/data/health.json（客户端 Fail-Closed 所依赖的安全决策数据）。
pending_verification 站点同样核验：迁移流程要求在 pending 阶段就对新域名做全套机器检查，
供 approve 门禁（check_health_approvable）判断「最新 watchdog 是否全 PASS 且绑定一致」。

决策逻辑（与 verificationMode 相关）：
  - automated（默认）模式：全部必要检查 PASS → healthy + AUTOMATED_HEALTHY；任一 FAIL /
    UNKNOWN → disabled + DISABLED。BLOCKED_BY_WAF 不是 PASS，automated 模式下同样 → disabled。
  - manual_user_environment 模式：机器基础安全门（DNS + TLS）PASS 且 HTTP 返回明确
    BLOCKED_BY_WAF 证据 → healthy + MANUAL_VERIFIED + automatedContentCheck=BLOCKED_BY_WAF
    （内容确认由人工限时 maintenancePermit 承接，healthy 不表示内容自动 PASS）；其余任何
    FAIL / UNKNOWN / 机器门未过 → disabled + DISABLED。BLOCKED_BY_WAF 严格定义见下。
  - verificationMode 缺失 / 非法 → disabled（Fail Closed），绝不静默默认。

======================================================================
三个概念的严格区分（代码与文档必须保持一致，不得混用）：
  A. Watchdog observation —— 本脚本在某一次检查时、在某个执行环境（通常是 GitHub
     Actions runner）中观察到的网络结果。
  B. Baseline approval   —— 人工根据 watchdog + 外部证据确认的站点基线（sites.json）。
  C. User navigation     —— 用户点击「继续访问」后，由用户自己的浏览器实际访问第三方
     网站的行为。

严禁把三者混为一谈，例如「watchdog 看到 HEALTHY == 用户访问一定安全」。
本脚本只负责 A（观察），并把观察结果写成 health.json；B 只由人工完成；C 由用户在
离站确认页自行判断。health.json 中的 HEALTHY 只表示「在某次检查时该站点满足本站
预定义的允许策略」，绝不是「第三方网站绝对安全」。
======================================================================

安全原则（严格遵守 AGENTS.md「网飞猫外链」要求）：
  - 只信任 sites.json 里人工审核的域名。本脚本永不自动发现 / 自动恢复新域名，
    也绝不自动把「www 与裸域」等兄弟 hostname 加入任何白名单。
  - 证据状态（内部）：每项检查记录 PASS / FAIL / UNKNOWN / BLOCKED_BY_WAF 状态。
    决策状态（对外）：health.json 的 status 只能是 healthy / disabled 二态，并同时记录
    healthState（AUTOMATED_HEALTHY / MANUAL_VERIFIED / DISABLED）与 automatedContentCheck
    （PASS / BLOCKED_BY_WAF / FAIL / UNKNOWN）两个诊断字段，三者组合必须合法：
        healthy + AUTOMATED_HEALTHY（automated 模式全部必要检查 PASS）
        healthy + MANUAL_VERIFIED（manual 模式机器基础门 PASS + 明确 WAF 阻断，内容由人工许可承接）
        disabled + DISABLED
    决策规则：automated 模式全部必要检查 PASS → healthy；任一 FAIL / UNKNOWN → disabled。
    UNKNOWN 绝不转换成 PASS（不为了提高可用率而猜测）。
    BLOCKED_BY_WAF 是独立证据态：仅当 DNS PASS + TLS PASS + 明确 WAF/anti-bot 阻断证据
    （HTTP 850 / 明确 anti-bot challenge / 明确 WAF 响应头）才成立；普通 403/404/500/
    timeout/connection reset 保持原有 UNKNOWN / FAIL 语义，绝不自动归类。适用于所有第三方
    站点，无任何站点特判。
  - manual_user_environment 模式：机器仍负责所有可自动证明的安全门（DNS/TLS/配置绑定），
    内容核验由人工在真实用户环境确认并以限时 maintenancePermit 承接。因此：
        healthy + MANUAL_VERIFIED + automatedContentCheck=BLOCKED_BY_WAF
    表示「机器基础安全门与当前 verificationMode 所要求的安全条件成立」，
    并【不】意味着内容级自动检查 PASS。客户端仅在持有与该配置绑定且未过期的有效
    maintenancePermit 时才可能放行（见 watch.js ALLOW 门链）。
  - health.json 无 fallback：客户端只见最终 status（healthy / disabled 二态）。
  - DNS 模型（适用于所有第三方站点，无任何站点特判）：
      PASS   —— 至少一个可信解析器（系统 / Cloudflare DoH）成功解析，且所有解析到的
                候选 IP 均为合法公网地址；不同解析器返回不同公网 IP 属于 CDN / GeoDNS /
                GSLB / Multi-CDN 多边缘的正常现象，只记录为 evidence，不构成失败。
      FAIL   —— 任一解析器给出的候选 IP 中存在被禁止地址（loopback / private /
                link-local / multicast / CGNAT / metadata / 保留等）→ 确认违规。
      UNKNOWN—— 所有解析器都无法解析 / 超时 / 无法取得任何可验证 IP。
    DNS Rebinding 防护：DNS 只在 DNS 阶段解析一次并固定公网 IP；TLS / HTTP 连接一律
    连接固定 IP（SNI=hostname、Host=hostname），绝不二次解析同一 hostname；重定向产生
    的新 hostname 才允许重新解析并再次固定。
  - fingerprint / risk marker 只是风险信号，不是“网站安全”的证明。
  - threatIntel 未配置 → 状态记录为 not_configured，绝不当作“更安全”的证据。
  - 本脚本不声称“绝对安全 / 保证安全 / 保证合法”。

执行环境要求（.github/workflows/watchdog.yml 与之配套）：
  - 在 GitHub Actions（ubuntu 固定镜像）中运行，不依赖用户的 Windows 本地环境、
    本地代理、本地浏览器、用户 cookie。
  - 每次运行都会在 health.json 中记录：执行环境（os/python/CI 运行 ID/egress IP）、
    观察时间、每项检查证据、redirect chain 明细、最终 hostname、TLS 验证明细。

注意：本脚本只写 health.json，永远不改 sites.json（人工白名单）。人工恢复流程：
  人工核验新域名 → 手动填入 sites.json（hosts/baseUrl/allowedRedirectHosts/基线）→ 置 status=healthy
  → 下一次 watchdog 运行若全部检查通过，health.json 才会变为 healthy。
"""
import html.parser
import hashlib
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# 可用环境变量覆盖路径，便于本地冒烟测试不写仓库文件：
#   WATCHDOG_SITES=path  WATCHDOG_HEALTH=path
SITES_PATH = os.environ.get('WATCHDOG_SITES', 'source/data/sites.json')
HEALTH_PATH = os.environ.get('WATCHDOG_HEALTH', 'source/data/health.json')
DISCOVERY_STATE_PATH = os.environ.get('WATCHDOG_DISCOVERY_STATE', 'watchdog/discovery-state.json')
TTL_HOURS = 12
DISCOVERY_FAIL_THRESHOLD = 3  # 连续失败达到该次数且曾健康 → 标记「疑似域名变更」（仅人工调查线索）
MAX_REDIRECTS = 5
REQUEST_TIMEOUT = 15
MAX_BODY = 2 * 1024 * 1024  # 2MB，仅用于风险扫描/指纹，够用且防止内存放大
USER_AGENT = 'MuAn-blog-watchdog/1.1 (security-check)'
DOH_URL = 'https://cloudflare-dns.com/dns-query'
EGRESS_IP_URL = 'https://api.ipify.org?format=json'

# 证据状态（内部）与决策状态（对外）
S_PASS = 'PASS'
S_FAIL = 'FAIL'
S_UNKNOWN = 'UNKNOWN'
# 独立证据态：DNS PASS + TLS PASS + 明确 WAF/anti-bot 阻断证据 → BLOCKED_BY_WAF。
# 它只描述「机器内容检查被明确阻断」，绝不等同于 PASS，也绝不被当作安全证明。
S_BLOCKED_BY_WAF = 'BLOCKED_BY_WAF'

# healthState 三态（诊断语义，与顶层 status 组合必须合法）：
#   healthy + AUTOMATED_HEALTHY   —— 机器全部必要检查 PASS
#   healthy + MANUAL_VERIFIED     —— 机器基础门（DNS/TLS）PASS + 明确 WAF 阻断，内容确认由人工许可承接
#   disabled + DISABLED           —— 任一 FAIL / UNKNOWN / 未启用
HS_AUTOMATED = 'AUTOMATED_HEALTHY'
HS_MANUAL = 'MANUAL_VERIFIED'
HS_DISABLED = 'DISABLED'

# automatedContentCheck 四态：内容组（http/redirectChain/fingerprint/riskScan）自动检查结果
ACC_PASS = 'PASS'
ACC_WAF = 'BLOCKED_BY_WAF'
ACC_FAIL = 'FAIL'
ACC_UNKNOWN = 'UNKNOWN'

# 允许的 verificationMode 枚举（缺失/非法 → DENY / health disabled）
VM_AUTOMATED = 'automated'
VM_MANUAL = 'manual_user_environment'
VALID_VERIFICATION_MODES = (VM_AUTOMATED, VM_MANUAL)

# ---- siteConfigHash（跨 Python/JavaScript 一致的配置哈希）----
# 安全字段固定为以下集合（任何新增/删除都会破坏与 source/js/watch.js 的一致性，
# 两边必须保持同一份清单，见 test/hash-crosscheck.js）：
#   id / status / baseUrl / hosts / allowedRedirectHosts / baseline / verificationMode
# verificationMode 影响客户端对内容的核验责任，必须参与哈希绑定。
# 规范化：只取上述字段 → 递归按键排序 → 紧凑 JSON（无空格、非 ASCII 原样）→ SHA-256 hex。
SECURITY_FIELDS = ('id', 'status', 'baseUrl', 'hosts', 'allowedRedirectHosts', 'baseline',
                   'verificationMode')


def hostname_of(url):
    """hostname 规范化（小写 + 去尾部点），JS 侧等价实现见 watch.js 的 hostnameOf()。"""
    try:
        host = urllib.parse.urlparse(url).hostname
    except Exception:
        return None
    return (host or '').lower().rstrip('.') or None


def _canonical(value):
    """递归按键排序（与 Python json.dumps(sort_keys=True) 语义一致，含数组内 dict）。"""
    if isinstance(value, dict):
        return {k: _canonical(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    return value


def compute_site_config_hash(site):
    """计算站点安全配置哈希（与 watch.js computeSiteConfigHash 结果必须一致）。"""
    if not isinstance(site, dict):
        return None
    canonical_obj = {k: site[k] for k in SECURITY_FIELDS if k in site}
    canonical_json = json.dumps(_canonical(canonical_obj), sort_keys=True,
                                ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _atomic_write_json(path, data):
    """原子写 JSON（先写临时文件再替换），避免半截文件污染。"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, path)


def collect_environment():
    """记录 watchdog 本次运行的执行环境（仅信息，不参与站点决策）。"""
    env = {
        'kind': 'github_actions' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'local',
        'os': sys.platform,
        'python': sys.version.split()[0],
        'bits': '64' if sys.maxsize > 2 ** 32 else '32',
        'dnsSource': 'system_resolver + cloudflare_doh',
    }
    ci = {}
    for k in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_REF',
              'GITHUB_WORKFLOW', 'GITHUB_RUNNER_NAME', 'RUNNER_OS', 'RUNNER_ARCH'):
        v = os.environ.get(k)
        if v:
            ci[k] = v
    if ci:
        env['ci'] = ci
    # egress IP：best-effort，仅用于说明「从哪个网络视角观察」，失败不影响站点决策
    try:
        req = urllib.request.Request(EGRESS_IP_URL, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=6) as resp:
            env['egressIp'] = json.loads(resp.read().decode('utf-8', 'replace')).get('ip')
    except Exception:
        env['egressIp'] = None
    return env


# 显式拒绝的特殊/保留 IPv4 网段（在 ipaddress 标记之外再显式列一次，避免不同 Python 版本差异）
_BLOCKED_V4_NETS = [
    '0.0.0.0/8',        # 本网络
    '100.64.0.0/10',    # CGNAT 共享地址
    '169.254.0.0/16',   # link-local（含 169.254.169.254 metadata endpoint）
    '192.0.0.0/24',     # IETF 协议分配
    '192.0.2.0/24',     # TEST-NET-1
    '198.18.0.0/15',    # benchmark
    '198.51.100.0/24',  # TEST-NET-2
    '203.0.113.0/24',   # TEST-NET-3
    '240.0.0.0/4',      # 保留
]


def is_blocked_ip(ip):
    """任何非公网 / 特殊 / 保留地址一律视为不可信 → True（拒绝）。

    覆盖 loopback / private / link-local（含 169.254.169.254 metadata endpoint）/
    multicast / CGNAT / 保留 / 未指定 / 文档与测试地址。IPv4-mapped IPv6 解出底层
    IPv4 再判断。解析失败同样视为不可信。"""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return True  # 无法解析 → 视为不可信
    if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped is not None:
        a = a.ipv4_mapped
    if (a.is_loopback or a.is_private or a.is_link_local or a.is_multicast
            or a.is_reserved or a.is_unspecified):
        return True
    if isinstance(a, ipaddress.IPv4Address):
        for net in _BLOCKED_V4_NETS:
            if a in ipaddress.ip_network(net):
                return True
    return False


def _split_ips(ips):
    """把解析结果分成 (公网 IP 列表, 被禁止 IP 列表)，各自去重排序。"""
    blocked = sorted(set(i for i in ips if is_blocked_ip(i)))
    public = sorted(set(i for i in ips if not is_blocked_ip(i)))
    return public, blocked


# ---------- DNS（双源解析 + IP 合法性判定；CDN/GeoDNS/多边缘兼容；IP Pinning） ----------

def resolve_system(host):
    """系统解析器。返回 (ok, ips, detail)。"""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        return False, [], '系统解析失败: %s' % e
    ips, seen = [], set()
    for info in infos:
        ip = info[4][0]
        if ip not in seen:
            seen.add(ip)
            ips.append(ip)
    if not ips:
        return False, [], '系统解析无结果'
    return True, ips, '系统解析: %s' % ','.join(sorted(ips))


def resolve_doh(host):
    """Cloudflare DoH（JSON API），作为独立于本机解析器的第二来源。返回 (ok, ips, detail)。"""
    url = '%s?name=%s&type=A' % (DOH_URL, urllib.parse.quote(host))
    try:
        req = urllib.request.Request(url, headers={
            'Accept': 'application/dns-json',
            'User-Agent': USER_AGENT,
        })
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            data = json.loads(resp.read().decode('utf-8', 'replace'))
    except Exception as e:
        return False, [], 'DoH 解析失败: %s' % e
    ips = [a.get('data') for a in (data.get('Answer') or [])
           if a.get('type') == 1 and a.get('data')]
    if not ips:
        return False, [], 'DoH 无 A 记录'
    return True, ips, 'DoH 解析: %s' % ','.join(sorted(ips))


def resolve_and_pin(host, system_resolver=None, doh_resolver=None):
    """双源 DNS + IP 合法性判定 + 固定公网 IP（适用于所有第三方站点，无任何站点特判）。

    返回 5 元组 (ok, ips, detail, state, evidence)：
      - ok=True 时 ips 为「至少一个可信解析器成功解析得到的公网 IP 列表」（已过滤所有
        非公网地址），供后续连接固定使用（TLS SNI=hostname、HTTP Host=hostname）；
      - evidence 为证据 dict（resolvers / intersection / allPublic / multiEdge / reason /
        system / doh / ips），供 check_dns 组装健康记录。

    状态规则：
      PASS   —— 至少一个可信解析器（系统 / Cloudflare DoH）成功解析，且其答案全为合法
                公网地址；不同解析器返回不同公网 IP 属于 CDN/GeoDNS 多边缘，只记录为
                evidence（resolver_answers_differ），不构成失败。
      FAIL   —— 任一解析器给出的候选 IP 中存在被禁止地址（private/loopback/link-local/
                multicast/CGNAT/metadata/保留等）→ 确认违规（如 DNS 污染指向内网）。
      UNKNOWN—— 所有解析器都无法解析 / 超时 / 无法取得任何可验证 IP。

    DNS Rebinding 防护：本函数只在 DNS 阶段解析一次并固定公网 IP；调用方此后连接一律
    使用返回的 IP，绝不二次解析同一 hostname（重定向产生的新 hostname 才允许重新解析）。"""
    sys_res = system_resolver or resolve_system
    doh_res = doh_resolver or resolve_doh
    sys_ok, sys_ips, sys_d = sys_res(host)
    doh_ok, doh_ips, doh_d = doh_res(host)

    sys_pub, sys_blk = _split_ips(sys_ips)
    doh_pub, doh_blk = _split_ips(doh_ips)

    def _evidence(reason, ok=False, ips=None):
        resolvers = {}
        if sys_ok:
            resolvers['system'] = {'addresses': sorted(set(sys_ips))}
        if doh_ok:
            resolvers['cloudflare'] = {'addresses': sorted(set(doh_ips))}
        return {
            'system': sys_d, 'doh': doh_d,
            'resolvers': resolvers,
            'intersection': sorted(set(sys_pub) & set(doh_pub)),
            'allPublic': ok,
            'multiEdge': bool(ok and set(sys_pub) != set(doh_pub)) if (sys_ok and doh_ok) else False,
            'reason': reason,
            'ips': list(ips or []),
        }

    # FAIL：任一解析器给出的答案包含被禁止地址 → 确认的违规（DNS 污染/投毒指向内网）
    if sys_ok and sys_blk:
        return (False, [], '系统解析含被禁止地址: %s（%s）' % (','.join(sys_blk), sys_d),
                S_FAIL, _evidence(['blocked_ip_in_answers']))
    if doh_ok and doh_blk:
        return (False, [], 'DoH 解析含被禁止地址: %s（%s）' % (','.join(doh_blk), doh_d),
                S_FAIL, _evidence(['blocked_ip_in_answers']))

    # UNKNOWN：所有解析器都无法解析 / 超时 / 无任何可验证 IP
    if not sys_ok and not doh_ok:
        return (False, [], '所有解析器均失败（system: %s / doh: %s）' % (sys_d, doh_d),
                S_UNKNOWN, _evidence(['all_resolvers_failed']))

    # PASS：至少一个可信解析器成功且答案全为公网（多边缘差异仅记录，不是失败）
    inter = sorted(set(sys_pub) & set(doh_pub))
    rest = [i for i in (sys_pub + doh_pub) if i not in inter]
    ordered = inter + list(dict.fromkeys(rest))  # 交集优先，其余去重保序
    reason = ['all_answers_public']
    if sys_ok and doh_ok and set(sys_pub) != set(doh_pub):
        reason.append('resolver_answers_differ')
    if inter:
        reason.append('resolvers_agree')
    return (True, ordered, '固定公网 IP: %s' % ','.join(ordered),
            S_PASS, _evidence(reason, ok=True, ips=ordered))


def check_dns(host, system_resolver=None, doh_resolver=None):
    """组装 DNS 检查的健康记录（保留 state/ok/detail/system/doh 兼容字段 + 新证据字段）。
    返回 dict：{state, ok, detail, system, doh, ips, resolvers, intersection, allPublic, multiEdge, reason}。"""
    ok, ips, detail, state, evidence = resolve_and_pin(host, system_resolver, doh_resolver)
    rec = {'state': state, 'ok': ok, 'detail': detail, 'ips': list(ips)}
    rec['system'] = evidence['system']
    rec['doh'] = evidence['doh']
    rec['resolvers'] = evidence['resolvers']
    rec['intersection'] = evidence['intersection']
    rec['allPublic'] = evidence['allPublic']
    rec['multiEdge'] = evidence['multiEdge']
    rec['reason'] = evidence['reason']
    return rec


# ---------- TLS（连接固定公网 IP，SNI=hostname） ----------

def _parse_asn1_time(s):
    # cert 里的 notBefore/notAfter 形如 "Aug 24 12:00:00 2026 GMT"
    return datetime.strptime(s, '%b %d %H:%M:%S %Y %Z')


def pinned_tls(host, ip, port=443):
    """TLS 握手 + 证书校验（连接固定公网 IP，SNI/证书校验 hostname=host）。
    返回 dict：{state, ok, detail, cert}。
    cert 含 subject/issuer/notBefore/notAfter/SANs，供人工复核基线（非安全证明）。
    任何证书校验失败（含 hostname 不匹配 / 已过期 / 未生效 / 无法验证）→ S_FAIL（DENY）；
    连接 / 握手无法完成（网络、WAF、IP 封锁等环境因素）→ S_UNKNOWN（决策层同样 DENY）。"""
    ctx = ssl.create_default_context()
    try:
        raw = socket.create_connection((ip, port), timeout=REQUEST_TIMEOUT)
    except Exception as e:
        return {'state': S_UNKNOWN, 'ok': False, 'detail': '连接失败: %s' % e, 'cert': None}
    try:
        ssock = ctx.wrap_socket(raw, server_hostname=host)  # SNI=host + 证书按 host 校验
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
        nb = _parse_asn1_time(cert['notBefore'])
        na = _parse_asn1_time(cert['notAfter'])
    except Exception as e:
        return {'state': S_FAIL, 'ok': False, 'detail': '证书时间解析失败: %s' % e, 'cert': None}
    now = datetime.utcnow()
    if now < nb:
        return {'state': S_FAIL, 'ok': False,
                'detail': '证书尚未生效（notBefore=%s）' % cert['notBefore'], 'cert': None}
    if now > na:
        return {'state': S_FAIL, 'ok': False,
                'detail': '证书已过期（notAfter=%s）' % cert['notAfter'], 'cert': None}
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


# ---------- WAF / anti-bot 阻断证据分类 ----------

# 明确的 WAF 响应头（server / 特有头部）。仅接受「明确」证据，禁止用模糊关键词猜测。
_WAF_SERVER_HINTS = ('waf', 'cloudflare', 'akamai', 'incapsula', 'imperva', 'sucuri')
_WAF_HEADER_KEYS = ('cf-chl', 'cf-mitigated', 'x-cdn-60', 'x-akamai-transformed',
                    'x-vercel-blocked', 'x-waf-action')
# anti-bot challenge 的强特征（正文小写后匹配；只用高度特有的标记，避免误判普通 4xx/5xx）
_WAF_BODY_MARKERS = ('cf_chl_opt', 'cf-chl-', 'just a moment', 'checking your browser',
                     'verify you are human', 'challenge-platform', 'incapsula resource',
                     'sucuri_cloudproxy')
_WAF_STATUS_CODES = (850,)


def classify_waf_evidence(status, headers, body):
    """判断是否存在明确 WAF / anti-bot 阻断证据（用于归为 BLOCKED_BY_WAF）。

    仅接受明确证据：
      - 特殊状态码（850）；
      - 明确 WAF 响应头（server 含 waf/cloudflare/akamai/incapsula/imperva/sucuri，
        或 cf-chl / cf-mitigated / x-akamai-transformed 等特有头）；
      - 正文含强 anti-bot challenge 特征。
    普通 403 / 404 / 500 / timeout / connection reset 一律返回 False（保持原有
    UNKNOWN / FAIL 语义，绝不自动归类为 BLOCKED_BY_WAF）。适用于所有第三方站点，无站点特判。"""
    if status is None:
        return False
    if status in _WAF_STATUS_CODES:
        return True
    headers = headers or {}
    server = (headers.get('server') or '').lower()
    if any(h in server for h in _WAF_SERVER_HINTS):
        return True
    if any(k in headers for k in _WAF_HEADER_KEYS):
        return True
    if body:
        text = body[:8192].decode('utf-8', errors='replace').lower()
        if any(m in text for m in _WAF_BODY_MARKERS):
            return True
    return False


# ---------- HTTP + redirect chain（固定公网 IP；重定向每跳重新解析并固定） ----------

def pinned_request(host, ip, path, port=443, timeout=REQUEST_TIMEOUT, max_body=MAX_BODY):
    """单跳 HTTPS GET：连接固定公网 IP，TLS SNI=host，Host 头=host（绝不二次解析 hostname）。
    返回 (status, headers, body)；连接 / TLS / 协议失败返回 (None, None, None)。"""
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


def check_http_and_redirects_pinned(base_url, approved_hosts, start_ip=None,
                                    system_resolver=None, doh_resolver=None, fetcher=None):
    """固定公网 IP 逐跳跟随重定向（DNS Rebinding 防护，适用于所有第三方站点，无任何特判）。

    起始 host 的 IP 由调用方传入（start_ip，来自先前唯一一次 resolve_and_pin 的固定结果）；
    若未传入则在本函数内先 resolve_and_pin 一次并固定。此后绝不对同一 hostname 二次解析 ——
    堵住「DNS 阶段查一个 IP、HTTP 连接又自行解析一次」的 DNS Rebinding 窗口。
    重定向产生的新 hostname 才允许重新 resolve_and_pin（再次校验公网 + 固定 IP）。

    返回 (state, ok, status, hops, hops_detail, body, detail, final_hostname)：
      - hops:          URL 字符串列表（客户端逐跳复验所依赖，保持兼容）
      - hops_detail:   审计明细 [{url, status, location, host, ip}]（含每跳固定 IP）
      - final_hostname: 最终跳到的 hostname（记录，供人工比对批准 host）
    状态规则（与既有模型一致）：能确认违反本站策略（非 https / userinfo / 未批准 host /
    缺 Location / 重定向超限 / 重定向 host DNS 未通过）→ FAIL；连接失败、4xx/5xx 服务器拒绝等
    无法确认的 → UNKNOWN；2xx 且逐跳通过 → PASS。FAIL/UNKNOWN 决策层一律 disabled。"""
    fetcher = fetcher or pinned_request
    sys_res = system_resolver or resolve_system
    doh_res = doh_resolver or resolve_doh

    u = urllib.parse.urlparse(base_url)
    cur_host = (u.hostname or '').lower().rstrip('.')
    cur_path = (u.path or '/') + ('?' + u.query if u.query else '')
    final_status = None
    final_host = cur_host
    body = None
    hops, hops_detail = [], []

    if start_ip is not None:
        cur_ip = start_ip  # 起始 host 的 IP 已由调用方固定，绝不在此处二次解析
    else:
        ok_dns, ips, dns_detail, _st, _ev = resolve_and_pin(cur_host, sys_res, doh_res)
        if not ok_dns:
            return S_FAIL, False, None, hops, hops_detail, None, \
                '起始 hostname DNS 未通过: %s' % dns_detail, cur_host
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
            return S_UNKNOWN, False, None, hops, hops_detail, body, \
                '请求失败，无法确认: %s' % url, final_host
        final_status = status
        if status in (301, 302, 303, 307, 308):
            if not loc:
                hd.update({'state': S_FAIL, 'detail': '重定向缺 Location'})
                return S_FAIL, False, status, hops, hops_detail, body, \
                    '重定向缺 Location', final_host
            nxt = urllib.parse.urljoin(url, loc)
            nu = urllib.parse.urlparse(nxt)
            if nu.scheme != 'https':
                hd.update({'state': S_FAIL, 'detail': '重定向非 https: %s' % nxt})
                return S_FAIL, False, status, hops, hops_detail, body, \
                    '重定向非 https', final_host
            if nu.username or nu.password:
                hd.update({'state': S_FAIL, 'detail': '重定向含 userinfo: %s' % nxt})
                return S_FAIL, False, status, hops, hops_detail, body, \
                    '重定向含 userinfo', final_host
            nhost = (nu.hostname or '').lower().rstrip('.')
            if nhost not in approved_hosts:
                hd.update({'state': S_FAIL, 'detail': '重定向到未批准 host: %s' % nxt})
                return S_FAIL, False, status, hops, hops_detail, body, \
                    '重定向到未批准 host', final_host
            ok_r, ips_r, detail_r, _st_r, _ev_r = resolve_and_pin(nhost, sys_res, doh_res)
            if not ok_r:
                hd.update({'state': S_FAIL, 'detail': '重定向 host DNS/IP 未通过: %s' % detail_r})
                return S_FAIL, False, status, hops, hops_detail, body, \
                    '重定向 host DNS/IP 未通过', final_host
            cur_host = nhost
            cur_ip = ips_r[0]
            cur_path = (nu.path or '/') + ('?' + nu.query if nu.query else '')
            continue
        if 200 <= status < 300:
            hd['state'] = S_PASS
            return S_PASS, True, status, hops, hops_detail, body, None, final_host
        # 非 2xx 非重定向：明确 WAF/anti-bot 阻断证据 → BLOCKED_BY_WAF（独立证据态）；
        # 普通 403/404/500/timeout/connection reset 保持 UNKNOWN（无法确认内容）。
        if classify_waf_evidence(status, headers, body):
            hd.update({'state': S_BLOCKED_BY_WAF, 'detail': 'WAF/anti-bot 阻断（status=%d）' % status})
            return S_BLOCKED_BY_WAF, False, status, hops, hops_detail, body, \
                'WAF/anti-bot 阻断自动化出口（status=%d，无法确认内容）' % status, final_host
        hd.update({'state': S_UNKNOWN, 'detail': 'HTTP 状态异常: %d' % status})
        return S_UNKNOWN, False, status, hops, hops_detail, body, \
            'HTTP 状态异常: %d（无法确认内容）' % status, final_host
    return S_FAIL, False, final_status, hops, hops_detail, body, \
        '重定向次数超限（>%d）' % MAX_REDIRECTS, final_host


# ---------- 页面导航结构扫描（meta refresh / JS 强制跳转 / 外域导航） ----------

# 明显的外链导航目标：t.me（Telegram）、常见 APP 下载 / 社区推广
PROMO_HOST_HINTS = ('t.me', 'telegram', 'wa.me')


def _host_of_url(url, default_host):
    u = urllib.parse.urlparse(url)
    return (u.hostname or '').lower().rstrip('.') or default_host


class PageHostScanner(html.parser.HTMLParser):
    """收集页面中出现的所有外域 host 及上下文（标签），供分类与审计（非自动信任）。"""

    def __init__(self, approved_hosts):
        super().__init__(convert_charrefs=True)
        self.approved = set(approved_hosts)
        self.hosts = {}  # host -> {'contexts': set, 'urls': list}

    def _note(self, url, context):
        if not url or url.startswith('#'):
            return
        u = urllib.parse.urlparse(url)
        if u.scheme and u.scheme not in ('http', 'https'):
            key = '__scheme_%s__' % u.scheme
        else:
            host = (u.hostname or '').lower().rstrip('.')
            if not host:
                return
            key = host
        rec = self.hosts.setdefault(key, {'contexts': set(), 'urls': []})
        rec['contexts'].add(context)
        if len(rec['urls']) < 5 and url not in rec['urls']:
            rec['urls'].append(url)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self._note(attrs.get('href'), 'a')
        elif tag in ('img', 'source', 'video', 'audio'):
            self._note(attrs.get('src'), tag)
            self._note(attrs.get('srcset'), tag)
        elif tag in ('iframe', 'frame', 'embed', 'object'):
            self._note(attrs.get('src'), tag)
            self._note(attrs.get('data'), tag)
        elif tag == 'script':
            self._note(attrs.get('src'), 'script')
        elif tag == 'link':
            self._note(attrs.get('href'), 'link')
        elif tag == 'form':
            self._note(attrs.get('action'), 'form')


def _extract_inline_scripts(body_text):
    """提取页面内联 <script>（无 src）内容块。"""
    blocks = []
    for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', body_text, re.I | re.S):
        blocks.append(m.group(1))
    return blocks


# location 赋值 / 调用 的多种写法（仅匹配明确赋值与 replace/assign 调用）
_JS_LOC_RE = re.compile(
    r'\b(?:window\.|document\.|top\.|self\.)?location(?:\.href)?\s*='
    r'|'
    r'\b(?:window\.)?location\.(?:replace|assign)\s*\(',
    re.I)


def _js_target_literal(expr):
    """尝试把 JS 跳转表达式解析为字面量 URL。
    返回 ('literal', url) / ('relative', url) / ('unknown', None)。"""
    e = expr.strip().strip(';').strip()
    if not e:
        return 'unknown', None
    # 去掉包裹的引号
    if len(e) >= 2 and e[0] in ('"', "'") and e[-1] == e[0]:
        return 'literal', e[1:-1]
    if len(e) >= 2 and e[0] == '`' and e[-1] == '`' and '${' not in e:
        return 'literal', e[1:-1]
    # 相对 URL（同源跳转，无法跨 host）
    if e.startswith('/') or e.startswith('./') or e.startswith('../'):
        return 'relative', e
    # 其余（变量 / 函数调用 / 拼接 / 模板插值）→ 无法可靠判断
    return 'unknown', None


def scan_page_navigation(body, approved_hosts):
    """扫描页面导航结构，返回证据 dict。任何无法可靠判断的强制跳转 → state=FAIL。
    返回 {metaRefresh, jsForcedRedirect, externalHosts, state, detail}"""
    approved = set(approved_hosts)
    evidence = {'metaRefresh': [], 'jsForcedRedirect': [], 'externalHosts': {}, 'state': S_PASS, 'detail': ''}
    body_text = body.decode('utf-8', errors='replace')

    # ---- meta refresh ----
    for m in re.finditer(r'<meta[^>]+http-equiv\s*=\s*["\']?refresh["\']?[^>]*>', body_text, re.I):
        tag = m.group(0)
        cm = re.search(r'content\s*=\s*["\']?([^"\' >]+)', tag, re.I)
        if not cm:
            evidence['metaRefresh'].append({'raw': tag[:80], 'state': S_UNKNOWN})
            continue
        content = cm.group(1)
        um = re.search(r'url\s*=\s*([^"\';\s]+)', content, re.I)
        if not um:
            evidence['metaRefresh'].append({'raw': content, 'state': S_UNKNOWN})
            continue
        url = um.group(1)
        u = urllib.parse.urlparse(url)
        if u.scheme and u.scheme not in ('http', 'https'):
            evidence['metaRefresh'].append({'url': url, 'state': S_FAIL, 'detail': '非 http(s) 协议'})
        elif u.hostname:
            host = u.hostname.lower().rstrip('.')
            if host in approved:
                evidence['metaRefresh'].append({'url': url, 'host': host, 'state': S_PASS})
            else:
                evidence['metaRefresh'].append({'url': url, 'host': host, 'state': S_FAIL,
                                                'detail': 'meta refresh 到未批准 host'})
        else:
            evidence['metaRefresh'].append({'url': url, 'state': S_PASS, 'detail': '相对跳转（同源）'})

    # ---- 内联 JS 强制跳转 ----
    for block in _extract_inline_scripts(body_text):
        for m in _JS_LOC_RE.finditer(block):
            after = block[m.end():m.end() + 120]
            rhs = None
            # 兼容 location.replace(x) / location.assign(x) 的括号参数
            if block[m.end() - 1] == '(':
                end = after.find(')')
                if end == -1:
                    rhs = after
                else:
                    rhs = after[:end]
            else:
                end = after.find(';')
                rhs = after if end == -1 else after[:end]
            kind, target = _js_target_literal(rhs)
            if kind == 'literal':
                u = urllib.parse.urlparse(target)
                if u.scheme and u.scheme not in ('http', 'https'):
                    evidence['jsForcedRedirect'].append(
                        {'target': target[:120], 'state': S_FAIL, 'detail': '非 http(s) 协议跳转'})
                elif u.hostname:
                    host = u.hostname.lower().rstrip('.')
                    if host in approved:
                        evidence['jsForcedRedirect'].append(
                            {'target': target[:120], 'host': host, 'state': S_PASS})
                    else:
                        evidence['jsForcedRedirect'].append(
                            {'target': target[:120], 'host': host, 'state': S_FAIL,
                             'detail': 'JS 强制跳转到未批准 host'})
                else:
                    evidence['jsForcedRedirect'].append(
                        {'target': target[:120], 'state': S_PASS, 'detail': '相对跳转（同源）'})
            elif kind == 'relative':
                evidence['jsForcedRedirect'].append(
                    {'target': rhs.strip()[:120], 'state': S_PASS, 'detail': '相对跳转（同源）'})
            else:
                # 变量 / 函数 / 拼接 → 无法可靠判断最终 host → UNKNOWN（按 DENY 处理）
                evidence['jsForcedRedirect'].append(
                    {'target': rhs.strip()[:120], 'state': S_UNKNOWN,
                     'detail': 'JS 跳转目标无法静态解析，无法确认 host'})

    # ---- 外域 host 分类（仅记录，绝不自动加入允许跳转列表）----
    scanner = PageHostScanner(approved)
    try:
        scanner.feed(body_text)
    except Exception as e:
        return {'metaRefresh': [], 'jsForcedRedirect': [],
                'externalHosts': {}, 'state': S_FAIL, 'detail': '页面解析失败: %s' % e}
    for host, rec in sorted(scanner.hosts.items()):
        contexts = sorted(rec['contexts'])
        cat = classify_host(host, approved, contexts)
        evidence['externalHosts'][host] = {
            'category': cat, 'contexts': contexts, 'samples': rec['urls'],
        }

    # ---- 汇总状态：任何 FAIL / UNKNOWN 强制跳转 → FAIL ----
    bad = [x for x in evidence['metaRefresh'] if x.get('state') != S_PASS] + \
          [x for x in evidence['jsForcedRedirect'] if x.get('state') != S_PASS]
    if bad:
        evidence['state'] = S_FAIL
        evidence['detail'] = '发现 %d 条无法放行的强制跳转（meta refresh / JS）' % len(bad)
    else:
        evidence['state'] = S_PASS
        evidence['detail'] = '未发现未批准 / 无法判断的强制跳转'
    return evidence


def classify_host(host, approved_hosts, contexts):
    """把页面中出现的外域 host 归入 A–E 类（仅审计分类，不改变白名单）。
      A. first_party      第一方页面 hostname（approved）
      B. static_cdn       必要静态资源 / CDN（img/link/script/source/video/audio）
      C. embedded         第三方嵌入资源（iframe/frame/embed/object）
      D. navigable        用户可点击的导航目标（a/form，且非明显推广）
      E. promo_community  广告 / 推广 / 社区链接（Telegram、APP 下载等）"""
    if host in approved_hosts:
        return 'A.first_party'
    ctx = set(contexts)
    if ctx & {'iframe', 'frame', 'embed', 'object'}:
        return 'C.embedded'
    if any(hint in host for hint in PROMO_HOST_HINTS):
        return 'E.promo_community'
    if host.startswith('dl.') or 'download' in host or 'app' in host.split('.')[0]:
        return 'E.promo_community'
    if ctx & {'a', 'form'}:
        return 'D.navigable'
    if ctx & {'img', 'link', 'source', 'video', 'audio', 'script'}:
        return 'B.static_cdn'
    return 'D.navigable'


# ---------- 风险扫描（高风险结构） ----------

class RiskScanner(html.parser.HTMLParser):
    """扫描明确的高风险结构；任何未批准的外域引用 → 记入 risks（Fail Closed）。"""

    def __init__(self, approved_hosts):
        super().__init__(convert_charrefs=True)
        self.approved = set(approved_hosts)
        self.risks = []

    def _check_url(self, url, where):
        if url.startswith('#'):
            return
        u = urllib.parse.urlparse(url)
        if u.scheme and u.scheme not in ('http', 'https'):
            self.risks.append('%s 引用非 http(s) 协议: %s' % (where, url))
            return
        host = (u.hostname or '').lower().rstrip('.')
        if not host:
            return  # 相对链接 / 同页锚点，无外域风险
        if host not in self.approved:
            self.risks.append('%s 引用未批准外域: %s' % (where, url))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            http_equiv = (attrs.get('http-equiv') or '').lower()
            content = attrs.get('content') or ''
            if http_equiv == 'refresh':
                m = re.search(r'url\s*=\s*(.+)$', content, re.I)
                if m:
                    self._check_url(m.group(1).strip().strip('"\''), 'meta refresh')
        elif tag == 'iframe':
            src = attrs.get('src')
            if src:
                self._check_url(src, 'iframe')
        elif tag == 'script':
            src = attrs.get('src')
            if src:
                self._check_url(src, 'script')
        elif tag == 'a':
            href = attrs.get('href')
            if href and ('download' in attrs or re.search(r'\.(exe|apk|msi|bat|cmd|scr|ps1)$', href, re.I)):
                self._check_url(href, '下载链接')
        elif tag == 'form':
            action = attrs.get('action')
            if action:
                self._check_url(action, '表单')


def check_risk_scan(body, approved_hosts):
    if not body:
        return True, '无正文（无可扫描内容）', []
    scanner = RiskScanner(approved_hosts)
    try:
        scanner.feed(body.decode('utf-8', errors='replace'))
    except Exception as e:
        return False, '风险扫描解析失败: %s' % e, []
    if scanner.risks:
        return False, '检测到高风险结构: ' + '; '.join(scanner.risks[:5]), scanner.risks
    return True, '未发现未批准外域引用', scanner.risks


def check_fingerprint(body, baseline):
    """基线标记一致 → 通过；未建立基线或标记缺失 → 失败（DENY）。基线只是风险信号，非安全证明。"""
    if not isinstance(baseline, dict) or not baseline:
        return False, '未建立人工审核基线标记（必须先建立基线）'
    if not body:
        return False, '无正文可校验基线'
    html_text = body.decode('utf-8', errors='replace')
    missing = []
    for key, val in baseline.items():
        if not isinstance(val, str) or not val:
            continue
        if val not in html_text:
            missing.append('%s=%r' % (key, val))
    if missing:
        return False, '基线标记缺失: ' + ', '.join(missing)
    return True, '基线标记一致（%d 项）' % len(baseline)


# ---------- 站点级装配 ----------

def disabled_template(reason, observed_at=None, binding=None, verification_mode=None):
    """未通过 / 未执行时的安全决策记录（对外状态永远 disabled）。
    binding: {configVersion, siteConfigHash, approvedHost}，与当前 sites.json 配置绑定，
    供客户端复验与人工审计（即使 disabled 也记录绑定，确保任何状态都可核对配置一致性）。"""
    binding = binding or {}
    return {
        'status': 'disabled',
        'healthState': HS_DISABLED,
        'automatedContentCheck': ACC_UNKNOWN,
        'verificationMode': verification_mode,
        'reason': reason,
        'lastCheck': now_iso(),
        'observedAt': observed_at or now_iso(),
        'configVersion': binding.get('configVersion'),
        'siteConfigHash': binding.get('siteConfigHash'),
        'approvedHost': binding.get('approvedHost'),
        'checks': {
            'dns': {'state': S_UNKNOWN, 'ok': False, 'detail': '未核验'},
            'tls': {'state': S_UNKNOWN, 'ok': False, 'detail': '未核验', 'cert': None},
            'http': {'state': S_UNKNOWN, 'ok': False, 'status': None, 'detail': '未核验'},
            'redirectChain': {'state': S_UNKNOWN, 'ok': False, 'hops': [],
                              'hopsDetail': [], 'finalHostname': None, 'detail': '未核验'},
            'navigationScan': {'state': S_UNKNOWN, 'ok': False,
                               'metaRefresh': [], 'jsForcedRedirect': [], 'externalHosts': {},
                               'detail': '未核验'},
            'fingerprint': {'state': S_UNKNOWN, 'ok': False, 'detail': '未核验'},
            'riskScan': {'state': S_UNKNOWN, 'ok': False, 'detail': '未核验'},
            'threatIntel': {'status': 'not_configured', 'detail': 'v1 未接入'}
        }
    }


def check_site(site, config_version):
    binding = {
        'configVersion': config_version,
        'siteConfigHash': compute_site_config_hash(site) if isinstance(site, dict) else None,
        'approvedHost': hostname_of(site.get('baseUrl')) if isinstance(site, dict) else None,
    }
    if not isinstance(site, dict):
        return disabled_template('sites.json 条目格式错误', binding=binding)
    sid = site.get('id')
    if not sid:
        return disabled_template('sites.json 条目缺少 id', binding=binding)
    if site.get('status') not in ('healthy', 'pending_verification'):
        return disabled_template(site.get('reason') or '人工白名单未启用（未核验 / 已停用）',
                                 binding=binding, verification_mode=site.get('verificationMode'))

    # verificationMode 校验（缺失 / 非法 → DENY / health disabled，Fail Closed）。
    # 只允许 automated / manual_user_environment，绝不静默默认。
    vm = site.get('verificationMode')
    if vm not in VALID_VERIFICATION_MODES:
        return disabled_template(
            'verificationMode 缺失或非法: %r（只允许 automated / manual_user_environment）' % vm,
            binding=binding, verification_mode=vm)

    base = site.get('baseUrl')
    hosts = [h.lower().rstrip('.') for h in (site.get('hosts') or []) if isinstance(h, str) and h]
    allowed = [h.lower().rstrip('.') for h in (site.get('allowedRedirectHosts') or []) if isinstance(h, str) and h]
    # 注意：hosts（第一方）与 allowedRedirectHosts（人工批准的跳转目标）是两套独立清单。
    # 允许跳转时二者皆可；但每个 hostname 都必须是 sites.json 里人工显式填写的，
    # 本脚本绝不自动派生（例如从 www 推断裸域，或把裸域加入 allowedRedirectHosts）。
    approved_hosts = set(hosts) | set(allowed)
    if not isinstance(base, str) or not base:
        return disabled_template('站点缺少 baseUrl')
    bu = urllib.parse.urlparse(base)
    if (bu.scheme != 'https' or not bu.hostname or bu.username or bu.password or
            bu.query or bu.fragment or bu.hostname.lower().rstrip('.') not in approved_hosts):
        return disabled_template('baseUrl 不在白名单 / 非 https / 含 userinfo、query、hash')
    base_host = bu.hostname.lower().rstrip('.')

    observed_at = now_iso()
    checks = {}

    # 1) DNS（双源交叉 + 固定公网 IP；CDN/GeoDNS 多边缘差异只记录为 evidence，不构成失败）
    #    确保 baseUrl 的 hostname 一定被检查并固定一个公网 IP 供 TLS/HTTP 连接（IP Pinning）。
    dns_rec = {'state': S_PASS, 'ok': True, 'detail': [], 'hosts': {}, 'pinnedIp': None}
    dns_hosts = list(dict.fromkeys(list(hosts) + [base_host]))
    pinned_ip = None
    for h in dns_hosts:
        rec = check_dns(h)
        checks_dns_h = {'state': rec['state'], 'ok': rec['ok'], 'detail': rec['detail'],
                        'system': rec['system'], 'doh': rec['doh'],
                        'resolvers': rec['resolvers'], 'intersection': rec['intersection'],
                        'allPublic': rec['allPublic'], 'multiEdge': rec['multiEdge'],
                        'reason': rec['reason'], 'ips': rec['ips']}
        dns_rec['hosts'][h] = checks_dns_h
        dns_rec['detail'].append('%s: %s' % (h, rec['detail']))
        if h == base_host and rec['ok'] and rec['ips']:
            pinned_ip = rec['ips'][0]  # 固定首个公网 IP（后续连接绝不二次解析同一 hostname）
        if rec['state'] != S_PASS:
            dns_rec['state'] = rec['state'] if dns_rec['state'] == S_PASS else dns_rec['state']
            # FAIL 优先于 UNKNOWN 于展示，但二者最终都 → disabled
            if rec['state'] == S_FAIL:
                dns_rec['state'] = S_FAIL
    dns_ok = dns_rec['state'] == S_PASS and pinned_ip is not None
    dns_rec['detail'] = '; '.join(dns_rec['detail'])
    dns_rec['ok'] = dns_ok
    dns_rec['pinnedIp'] = pinned_ip
    checks['dns'] = dns_rec

    # 2) TLS（连接固定公网 IP，SNI/证书校验 base_host）
    if dns_ok:
        tls = pinned_tls(base_host, pinned_ip)
        checks['tls'] = {'state': tls['state'], 'ok': tls['ok'], 'detail': tls['detail'], 'cert': tls['cert']}
        tls_ok = tls['ok']
    else:
        checks['tls'] = {'state': S_UNKNOWN, 'ok': False, 'detail': 'DNS 未通过，跳过 TLS（UNKNOWN）', 'cert': None}
        tls_ok = False

    # 3) HTTP + redirect chain + 最终 hostname（固定起始 host 的 IP；重定向每跳重新校验并固定）
    http_ok = redirect_ok = False
    http_state = S_UNKNOWN
    hops, hops_detail, body, detail, final_host = [], [], None, None, None
    if dns_ok and tls_ok:
        http_state, http_ok, status, hops, hops_detail, body, detail, final_host = \
            check_http_and_redirects_pinned(base, approved_hosts, start_ip=pinned_ip)
        checks['http'] = {'state': http_state, 'ok': http_ok,
                          'status': status, 'detail': detail or 'HTTP ok'}
        redirect_ok = http_ok and len(hops) >= 1 and detail is None
        checks['redirectChain'] = {
            'state': S_PASS if redirect_ok else http_state, 'ok': redirect_ok,
            'hops': hops, 'hopsDetail': hops_detail, 'finalHostname': final_host,
            'detail': detail or '重定向链逐跳校验通过，最终 hostname=%s' % final_host}
    else:
        checks['http'] = {'state': S_UNKNOWN, 'ok': False, 'status': None,
                          'detail': '前置检查未通过，跳过 HTTP（UNKNOWN）'}
        checks['redirectChain'] = {'state': S_UNKNOWN, 'ok': False, 'hops': [],
                                   'hopsDetail': [], 'finalHostname': None,
                                   'detail': '前置检查未通过，跳过重定向链（UNKNOWN）'}

    # 4) 页面级检查（navigationScan / fingerprint / riskScan），仅在拿到正文后执行
    if http_ok and body:
        nav = scan_page_navigation(body, approved_hosts)
        checks['navigationScan'] = {
            'state': nav['state'], 'ok': nav['state'] == S_PASS,
            'metaRefresh': nav['metaRefresh'], 'jsForcedRedirect': nav['jsForcedRedirect'],
            'externalHosts': nav['externalHosts'], 'detail': nav['detail']}

        f_ok, f_d = check_fingerprint(body, site.get('baseline'))
        checks['fingerprint'] = {'state': S_PASS if f_ok else S_FAIL, 'ok': f_ok, 'detail': f_d}

        r_ok, r_d, risks = check_risk_scan(body, approved_hosts)
        checks['riskScan'] = {'state': S_PASS if r_ok else S_FAIL, 'ok': r_ok,
                              'detail': r_d, 'risks': risks[:10]}
    else:
        for key in ('navigationScan', 'fingerprint', 'riskScan'):
            checks[key] = {'state': S_UNKNOWN, 'ok': False, 'detail': '未获取正文，跳过（UNKNOWN）'}
        if 'navigationScan' in checks:
            checks['navigationScan']['metaRefresh'] = []
            checks['navigationScan']['jsForcedRedirect'] = []
            checks['navigationScan']['externalHosts'] = {}
        if 'riskScan' in checks:
            checks['riskScan']['risks'] = []

    # 5) threatIntel：v1 未接入 → not_configured（不是安全证明，不参与 PASS 判定）
    checks['threatIntel'] = {'state': 'NOT_CONFIGURED', 'status': 'not_configured',
                             'detail': 'v1 未接入（人工审核 + 上述检查为准）'}

    # ---- 决策：healthState / automatedContentCheck / verificationMode 分支 ----
    # 机器基础安全门：DNS + TLS。任何模式都必须 PASS（manual 不关闭任何机器门）。
    machine_basic_ok = (checks['dns']['state'] == S_PASS and checks['tls']['state'] == S_PASS)
    http_state = checks['http']['state']
    # automatedContentCheck（内容组自动检查结果）：
    #   BLOCKED_BY_WAF —— http 返回明确 WAF/anti-bot 阻断证据（独立证据态）
    #   PASS           —— 全部必要检查 PASS
    #   FAIL           —— 任一内容检查 FAIL
    #   UNKNOWN        —— 其余无法确认
    content_blocked = http_state == S_BLOCKED_BY_WAF

    # manual 分支：machine basic gates PASS + 明确 WAF 阻断 → healthy + MANUAL_VERIFIED。
    # healthy 仅表示机器基础门与当前 verificationMode 所要求的安全条件成立，
    # 【不】意味着内容级自动检查 PASS —— 内容确认由人工限时 maintenancePermit 承接
    # （客户端 ALLOW 的第二分支；无有效 permit 时客户端仍 DENY）。
    if vm == VM_MANUAL and machine_basic_ok and content_blocked:
        rec = {'status': 'healthy',
               'healthState': HS_MANUAL,
               'automatedContentCheck': ACC_WAF,
               'verificationMode': vm,
               'reason': ('machine basic gates PASS（DNS/TLS）；内容检查被明确 WAF/anti-bot 阻断，'
                          '内容确认由人工限时 maintenancePermit 承接（MANUAL_VERIFIED，非内容自动 PASS）'),
               'lastCheck': now_iso(), 'observedAt': observed_at, 'checks': checks}
        rec.update(binding)  # 绑定字段：configVersion / siteConfigHash / approvedHost
        return rec

    # 其余：automated 模式 / manual 但内容可机器确认 / 任一 FAIL / UNKNOWN / 机器门未过
    gated = {k: v for k, v in checks.items()
             if isinstance(v, dict) and 'ok' in v}  # 排除 threatIntel（无 ok）
    all_pass = bool(gated) and all(v['state'] == S_PASS for v in gated.values())
    if all_pass:
        rec = {'status': 'healthy',
               'healthState': HS_AUTOMATED,
               'automatedContentCheck': ACC_PASS,
               'verificationMode': vm,
               'reason': None, 'lastCheck': now_iso(),
               'observedAt': observed_at, 'checks': checks}
        rec.update(binding)  # 绑定字段：configVersion / siteConfigHash / approvedHost
        return rec

    # disabled：记录 ACC 诊断（FAIL 优先于 BLOCKED_BY_WAF / UNKNOWN 展示，最终一律 disabled）
    acc = ACC_UNKNOWN
    if any(v.get('state') == S_FAIL for v in gated.values()):
        acc = ACC_FAIL
    elif content_blocked:
        acc = ACC_WAF
    bad = [k for k, v in gated.items() if v['state'] != S_PASS]
    first_detail = gated[bad[0]].get('detail', '') if bad else ''
    rec = {'status': 'disabled',
           'healthState': HS_DISABLED,
           'automatedContentCheck': acc,
           'verificationMode': vm,
           'reason': '健康检查未通过: %s（%s）' % (', '.join(bad), first_detail),
           'lastCheck': now_iso(), 'observedAt': observed_at, 'checks': checks}
    rec.update(binding)  # 绑定字段：即使 disabled 也记录，供客户端复验与人工审计
    return rec


def update_discovery_state(result):
    """记录各站点连续失败/疑似域名变更的观测状态（watchdog/discovery-state.json）。

    仅做观测，绝不触发对任何候选域名的网络访问，也绝不改变 health.json 决策。
    疑似域名变更只是给人工的线索，候选域名发现/核验完全由人工驱动。"""
    try:
        prev = {}
        if os.path.exists(DISCOVERY_STATE_PATH):
            with open(DISCOVERY_STATE_PATH, encoding='utf-8') as f:
                prev = (json.load(f).get('sites') or {})
        sites = {}
        for sid, rec in (result.get('sites') or {}).items():
            p = prev.get(sid, {})
            was_healthy_ever = bool(p.get('wasHealthyEver', False)) or rec.get('status') == 'healthy'
            if rec.get('status') == 'healthy':
                failures = 0
                suspected = False
            else:
                failures = int(p.get('consecutiveFailures', 0)) + 1
                suspected = was_healthy_ever and failures >= DISCOVERY_FAIL_THRESHOLD
            sites[sid] = {
                'status': rec.get('status'),
                'consecutiveFailures': failures,
                'suspectedDomainChange': suspected,
                'wasHealthyEver': was_healthy_ever,
                'lastSeen': now_iso(),
            }
        out = {
            'schemaVersion': 1,
            'updatedAt': now_iso(),
            'note': ('watchdog 对各站点连续失败 / 疑似域名变更的观测记录（仅供人工调查参考，'
                     '绝不自动访问任何候选域名）。'),
            'sites': sites,
        }
        _atomic_write_json(DISCOVERY_STATE_PATH, out)
    except Exception as e:
        print('WARN: 更新 discovery-state 失败（不影响站点决策）: %s' % e)


def _fail_closed_health():
    """sites.json 不可用 / schema 不符 / configVersion 无效时生成空 health（客户端见 no_health_record → DENY）。"""
    return {
        'schemaVersion': 2,
        'configVersion': None,
        'generatedAt': now_iso(),
        'ttlHours': TTL_HOURS,
        'environment': collect_environment(),
        'note': 'watchdog 在某次检查时的观察结果，不代表第三方网站绝对安全。',
        'sites': {}
    }


def main():
    try:
        with open(SITES_PATH, encoding='utf-8') as f:
            sites_data = json.load(f)
    except Exception as e:
        # sites.json 损坏 → 无法信任任何站点 → 生成空 sites 的 health.json（客户端见 no_health_record → DENY）
        _atomic_write_json(HEALTH_PATH, _fail_closed_health())
        print('FATAL: sites.json 读取失败（%s），health.json 已置为空（Fail Closed）' % e)
        sys.exit(0)

    if not isinstance(sites_data, dict) or sites_data.get('schemaVersion') != 2 or \
            not isinstance(sites_data.get('sites'), list):
        _atomic_write_json(HEALTH_PATH, _fail_closed_health())
        print('FATAL: sites.json schema 不符合 v2 要求，health.json 已置为空（Fail Closed）')
        sys.exit(0)

    config_version = sites_data.get('configVersion')
    if not isinstance(config_version, int) or isinstance(config_version, bool) or config_version <= 0:
        _atomic_write_json(HEALTH_PATH, _fail_closed_health())
        print('FATAL: sites.json configVersion 无效（%r），health.json 已置为空（Fail Closed）' % config_version)
        sys.exit(0)

    result = {'schemaVersion': 2, 'configVersion': config_version,
              'generatedAt': now_iso(), 'ttlHours': TTL_HOURS,
              'environment': collect_environment(),
              'note': ('health.json 是 watchdog 在某次检查时的观察结果（Watchdog observation）；'
                       'HEALTHY 仅表示该站点当时满足本站预定义的允许策略，不代表第三方网站绝对安全；'
                       '用户实际访问（User navigation）由离站确认页自行判断。'
                       'configVersion/siteConfigHash/approvedHost 用于与当前 sites.json 配置绑定，'
                       '任何不一致客户端一律 DENY。'),
              'sites': {}}
    all_healthy = True
    for site in sites_data.get('sites', []):
        try:
            rec = check_site(site, config_version)
        except Exception as e:
            sid = site.get('id') if isinstance(site, dict) else '?'
            rec = disabled_template('watchdog 内部异常: %s' % e, binding={
                'configVersion': config_version,
                'siteConfigHash': compute_site_config_hash(site) if isinstance(site, dict) else None,
                'approvedHost': hostname_of(site.get('baseUrl')) if isinstance(site, dict) else None,
            })
            print('WARN: 站点 %s 检查异常（%s），已置 disabled' % (sid, e))
        if rec.get('status') != 'healthy':
            all_healthy = False
        result['sites'][site.get('id', '?')] = rec

    _atomic_write_json(HEALTH_PATH, result)

    print('health.json updated; generatedAt=%s; configVersion=%s; env=%s; all_healthy=%s'
          % (result['generatedAt'], result['configVersion'],
             result['environment'].get('kind'), all_healthy))
    for sid, rec in result['sites'].items():
        print('  [%s] %s' % (rec.get('status'), sid))

    # 观测记录（仅线索，不影响上述决策）
    update_discovery_state(result)


if __name__ == '__main__':
    main()
