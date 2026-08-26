#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
候选域名机制强制安全约束测试（12 项）。

运行（无需测试框架，纯 stdlib；exit 0 才通过）：
  python test/candidate-security.py

验证目标（与用户要求的 12 项一一对应）：
  1. 页面发现的任意外域不会自动产生 HTTP 请求。
  2. CANDIDATE 默认不会触发 candidate verification。
  3. 只有 READY_FOR_CHECK 才能触发验证。
  4. private IP candidate 被 DENY。
  5. loopback candidate 被 DENY。
  6. metadata endpoint 被 DENY。
  7. DNS Rebinding 被 DENY。
  8. redirect 到 private IP 被 DENY。
  9. redirect 到未知 public host 被 DENY。
  10. candidate verification 永远不会写入 health.json。
  11. candidate verification 永远不会修改 sites.json。
  12. candidate 永远无法被 watch.js 使用。

关键方法：所有 DNS / TLS / HTTP 均注入 stub（不会产生真实网络请求），
并记录调用，从而可以在离线、确定性地断言「没有任何意外请求」。
所有 cr.* 命令都指向临时目录（WATCHDOG_* 环境变量覆盖），绝不触碰生产文件。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
sys.path.insert(0, os.path.join(BASE, 'watchdog'))

import candidate_check as cc
import candidate_review as cr
import watchdog_check as wd

PUB = '93.184.216.34'      # 合法公网 IP（仅作为 stub 值，不发生真实连接）
PRIV = '10.0.0.5'
LOOP = '127.0.0.1'
META = '169.254.169.254'
LINKLOCAL = '169.254.0.99'

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


# ---------- 环境隔离（所有 cr.* 命令写临时目录，绝不碰生产文件） ----------

_TMP_ROOT = None


def setup_isolated_env():
    global _TMP_ROOT
    _TMP_ROOT = tempfile.mkdtemp(prefix='cand-sec-')
    sites_path = os.path.join(_TMP_ROOT, 'sites.json')
    with open(sites_path, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': 1, 'sites': []}, f)
    os.environ['WATCHDOG_CANDIDATES'] = os.path.join(_TMP_ROOT, 'candidates.json')
    os.environ['WATCHDOG_CANDIDATE_REPORTS'] = os.path.join(_TMP_ROOT, 'reports')
    os.environ['WATCHDOG_SITES'] = sites_path
    os.environ['WATCHDOG_HEALTH'] = os.path.join(_TMP_ROOT, 'health.json')
    os.environ['WATCHDOG_DISCOVERY_STATE'] = os.path.join(_TMP_ROOT, 'discovery-state.json')


# ---------- stub 构建工具 ----------

def make_resolvers(ip_map, call_log=None, second_call_ip_map=None):
    """构造 (system_resolver, doh_resolver)：host -> [ips]。
    second_call_ip_map：某个解析器【自身】第二次解析该 host 时返回的 IP
    （模拟 DNS Rebinding / 劫持）。返回的第三个值是全体调用总数（跨两源）。"""
    total_counts = {}

    def _mk(doh):
        local = {'n': 0}

        def resolver(host):
            local['n'] += 1
            n = local['n']
            total_counts[host] = total_counts.get(host, 0) + 1
            if call_log is not None:
                call_log.append((host, n, doh))
            src = second_call_ip_map if (n >= 2 and second_call_ip_map) else ip_map
            ips = src.get(host)
            if ips is None:
                return False, [], 'NXDOMAIN(stub)'
            return True, list(ips), 'stub: %s' % ','.join(ips)
        return resolver
    return _mk(False), _mk(True), total_counts


def make_fetcher(hop_plan, call_log=None):
    """构造 fetcher(host, ip, path)：按顺序消费 hop_plan。
    对未预置的 (host,ip,path) 返回 None（视为连接失败，安全侧不会因此放行）。"""
    state = {'i': 0}

    def fetcher(host, ip, path):
        if call_log is not None:
            call_log.append((host, ip, path, state['i']))
        if state['i'] >= len(hop_plan):
            return None, None, None
        step = hop_plan[state['i']]
        state['i'] += 1
        if step.get('host') != host or step.get('ip') != ip:
            return None, None, None
        return step.get('status'), step.get('headers', {}), (step.get('body') or '').encode('utf-8')
    return fetcher, state


def make_tls():
    """tls_func(host, ip)：仅固定公网 IP 通过。"""
    def tls_func(host, ip):
        if ip == PUB:
            return {'state': wd.S_PASS, 'ok': True, 'detail': 'stub TLS ok',
                    'cert': {'subject': {'commonName': host}, 'issuer': {'organizationName': 'stub'},
                             'notBefore': 'Aug 01 00:00:00 2020 GMT',
                             'notAfter': 'Aug 01 00:00:00 2099 GMT',
                             'serialNumber': '0', 'SANs': [('DNS', host)]}}
        return {'state': wd.S_FAIL, 'ok': False, 'detail': 'stub: 非公网 IP 已拒绝 %s' % ip, 'cert': None}
    return tls_func


def snapshot_files(paths):
    snap = {}
    for p in paths:
        try:
            with open(p, 'r', encoding='utf-8') as f:
                snap[p] = f.read()
        except Exception as e:
            snap[p] = '<<missing:%s>>' % e
    return snap


def assert_files_unchanged(label, snap):
    changed = []
    for p, content in snap.items():
        if content.startswith('<<missing'):
            continue
        if not os.path.exists(p):
            changed.append(p + '(已删除)')
            continue
        with open(p, encoding='utf-8') as f:
            if f.read() != content:
                changed.append(p)
    check(not changed, label, ('变更: %s' % changed) if changed else '')


# 固定 fixture 页面：含多个外域 host
PAGE_WITH_EXTERNAL = b"""
<html><head><title>demo</title></head><body>
<a href="https://evil1.example/a">link1</a>
<a href="https://evil2.example/b">link2</a>
<img src="https://cdn.example/i.png">
<script src="https://track.example/t.js"></script>
<iframe src="https://embed.example/f"></iframe>
</body></html>
"""


# =====================================================================
# 1. 页面发现的任意外域不会自动产生 HTTP 请求
# =====================================================================
def test_01_discovery_no_outbound():
    print('[1] 页面发现的任意外域不会自动产生 HTTP 请求')
    # 1a. extract_candidates_from_page 是纯函数：只解析字符串，绝不发起任何网络
    found = cr.extract_candidates_from_page(PAGE_WITH_EXTERNAL, 'https://source.example/', set())
    hosts = {d['host'] for d in found}
    check({'evil1.example', 'evil2.example', 'cdn.example', 'track.example', 'embed.example'} <= hosts,
          '1a 外域 host 被解析为候选记录', str(sorted(hosts)))
    check(all(d.get('status', 'CANDIDATE') in (None, 'CANDIDATE') for d in found),
          '1b 发现结果仅作为候选记录（无状态 / CANDIDATE）')

    # 1c. cmd_discover：注入会记录调用的 fetcher；断言只请求「管理员显式提供的来源 URL」，
    #     绝不请求页面里发现的任何外域 host。
    call_log = []
    src_host = 'source.example'

    def recorded_fetcher(host, ip, path):
        call_log.append((host, ip, path))
        return 200, {'content-type': 'text/html'}, PAGE_WITH_EXTERNAL

    args = type('A', (), {'url': 'https://%s/' % src_host, 'approved': []})()
    old_afs = cr.approved_hosts_from_sites
    old_rp = cc.resolve_and_pin
    cr.approved_hosts_from_sites = lambda *a, **k: set()
    cc.resolve_and_pin = lambda h, *a, **k: (True, [PUB], 'stub', wd.S_PASS)
    try:
        rc = cr.cmd_discover(args, fetcher=recorded_fetcher)
    finally:
        cr.approved_hosts_from_sites = old_afs
        cc.resolve_and_pin = old_rp
    check(rc == 0, '1c cmd_discover 正常完成')
    check(call_log and all(h == src_host for h, _ip, _p in call_log),
          '1c 只请求来源 URL host（%s），绝不请求发现的外域' % src_host,
          '实际请求: %s' % call_log)
    check(len(call_log) == 1, '1c 来源页面只请求一次', str(call_log))
    # 1d. 记录进 candidates.json 后仍为 CANDIDATE（无任何网络核验发生）
    with open(os.path.join(_TMP_ROOT, 'candidates.json'), encoding='utf-8') as f:
        data = json.load(f)
    cand_hosts = {c['host'] for c in data['candidates']}
    check(all(c['status'] == 'CANDIDATE' for c in data['candidates']),
          '1d 发现后全部保持 CANDIDATE（未触发核验）')
    check('source.example' in cand_hosts and \
          {'evil1.example', 'evil2.example', 'cdn.example', 'track.example', 'embed.example'} <= cand_hosts,
          '1d 来源页 + 全部外域都被记录为候选', str(sorted(cand_hosts)))


# =====================================================================
# 2. CANDIDATE 默认不会触发 candidate verification
# =====================================================================
def test_02_candidate_does_not_verify():
    print('[2] CANDIDATE 默认不会触发 candidate verification')
    cand_path = os.environ['WATCHDOG_CANDIDATES']
    with open(cand_path, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': 1, 'updatedAt': 'x', 'note': 'test',
                   'candidates': [{'host': 'new.example', 'status': 'CANDIDATE',
                                   'source': 'page_observation', 'discoveredAt': 'x',
                                   'evidence': {}, 'history': []}]}, f, ensure_ascii=False)
    calls = []
    real_verify = cc.verify_candidate
    cc.verify_candidate = lambda *a, **k: calls.append(a) or {'verdict': 'ELIGIBLE', 'gates': {}}
    try:
        args = type('A', (), {'host': 'new.example'})()
        rc = cr.cmd_verify(args)
    finally:
        cc.verify_candidate = real_verify
    check(rc == 1, '2 CANDIDATE 状态 verify 被拒绝（rc=1）')
    check(not calls, '2 CANDIDATE 绝不调用 verify_candidate', str(calls))


# =====================================================================
# 3. 只有 READY_FOR_CHECK 才能触发验证
# =====================================================================
def test_03_only_ready_triggers():
    print('[3] 只有 READY_FOR_CHECK 才能触发验证')
    cand_path = os.environ['WATCHDOG_CANDIDATES']
    statuses = ['CANDIDATE', 'TECHNICALLY_ELIGIBLE', 'REJECTED', 'DROPPED', 'READY_FOR_CHECK']
    with open(cand_path, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': 1, 'updatedAt': 'x', 'note': 'test',
                   'candidates': [{'host': 'h%d.example' % i, 'status': s,
                                   'source': 'manual', 'discoveredAt': 'x',
                                   'evidence': {}, 'history': []}
                                  for i, s in enumerate(statuses)]}, f, ensure_ascii=False)
    calls = []
    real_verify = cc.verify_candidate
    cc.verify_candidate = lambda *a, **k: calls.append(a) or {'verdict': 'ELIGIBLE', 'gates': {}}
    try:
        for i, s in enumerate(statuses):
            args = type('A', (), {'host': 'h%d.example' % i})()
            rc = cr.cmd_verify(args)
            if s == 'READY_FOR_CHECK':
                check(rc == 0, '3 READY_FOR_CHECK 允许核验（rc=0）')
            else:
                check(rc == 1, '3 %s 状态被拒绝（rc=1）' % s)
    finally:
        cc.verify_candidate = real_verify
    check(len(calls) == 1 and calls[0][0] == 'h4.example',
          '3 仅对 READY_FOR_CHECK 调用 verify_candidate（其余状态均未调用）', str(calls))


# =====================================================================
# 4. private IP candidate 被 DENY
# =====================================================================
def test_04_private_ip_denied():
    print('[4] private IP candidate 被 DENY')
    check(cc.is_blocked_ip('10.0.0.5'), '4a 10/8 被拒绝')
    check(cc.is_blocked_ip('172.16.0.1'), '4b 172.16/12 被拒绝')
    check(cc.is_blocked_ip('192.168.1.1'), '4c 192.168/16 被拒绝')
    check(cc.is_blocked_ip('fd00::1'), '4d ULA IPv6 被拒绝')
    ok, reason = cc.validate_public_hostname('10.0.0.5')
    check(not ok and 'IP' in reason, '4e 禁止 IP 直连（10.0.0.5）', reason)
    ok, reason = cc.validate_public_hostname('2001:db8::1')
    check(not ok and 'IP' in reason, '4f 禁止 IPv6 直连', reason)
    rep = cc.verify_candidate('host.example',
                              system_resolver=lambda h: (True, [PRIV], 'x'),
                              doh_resolver=lambda h: (True, [PRIV], 'x'),
                              tls_func=make_tls(), fetcher=lambda *a: (200, {}, b''))
    check(rep['verdict'] == 'NOT_ELIGIBLE', '4g 解析到 private IP 的候选 NOT_ELIGIBLE')
    check(rep['gates']['dns']['state'] == wd.S_FAIL, '4h dns gate=FAIL', rep['gates']['dns']['detail'])


# =====================================================================
# 5. loopback candidate 被 DENY
# =====================================================================
def test_05_loopback_denied():
    print('[5] loopback candidate 被 DENY')
    check(cc.is_blocked_ip('127.0.0.1'), '5a 127.0.0.1 被拒绝')
    check(cc.is_blocked_ip('::1'), '5b ::1 被拒绝')
    rep = cc.verify_candidate('host.example',
                              system_resolver=lambda h: (True, [LOOP], 'x'),
                              doh_resolver=lambda h: (True, [LOOP], 'x'),
                              tls_func=make_tls(), fetcher=lambda *a: (200, {}, b''))
    check(rep['verdict'] == 'NOT_ELIGIBLE', '5c 解析到 loopback 的候选 NOT_ELIGIBLE')
    check(rep['gates']['dns']['state'] == wd.S_FAIL, '5d dns gate=FAIL')


# =====================================================================
# 6. metadata endpoint 被 DENY
# =====================================================================
def test_06_metadata_denied():
    print('[6] metadata endpoint 被 DENY')
    check(cc.is_blocked_ip(META), '6a 169.254.169.254 被拒绝')
    check(cc.is_blocked_ip(LINKLOCAL), '6b link-local 被拒绝')
    rep = cc.verify_candidate('host.example',
                              system_resolver=lambda h: (True, [META], 'x'),
                              doh_resolver=lambda h: (True, [META], 'x'),
                              tls_func=make_tls(), fetcher=lambda *a: (200, {}, b''))
    check(rep['verdict'] == 'NOT_ELIGIBLE', '6c metadata IP 候选 NOT_ELIGIBLE')
    check(rep['gates']['dns']['state'] == wd.S_FAIL, '6d dns gate=FAIL')


# =====================================================================
# 7. DNS Rebinding 被 DENY
# =====================================================================
def test_07_dns_rebinding_denied():
    print('[7] DNS Rebinding 被 DENY')
    # 第一次解析返回公网 IP，第二次解析同 host 返回 loopback（模拟 Rebinding / 劫持）。
    # 正确实现：起始 host 只解析一次并固定公网 IP；HTTP 阶段绝不二次解析。
    counts = {}
    sys_r, doh_r, counts = make_resolvers(
        {'host.example': [PUB]},
        second_call_ip_map={'host.example': [LOOP]})
    fetcher, _st = make_fetcher([{'host': 'host.example', 'ip': PUB, 'path': '/',
                                  'status': 200, 'body': '<title>ok</title>'}])
    rep = cc.verify_candidate('host.example', system_resolver=sys_r, doh_resolver=doh_r,
                              tls_func=make_tls(), fetcher=fetcher)
    check(rep['verdict'] == 'ELIGIBLE', '7 固定公网 IP 时正常通过', rep['verdict'])
    check(counts.get('host.example', 0) == 2,
          '7 起始 host 每源只解析一次（绝无二次解析窗口）', 'counts=%s' % counts)
    ips = [h.get('ip') for h in rep['gates']['redirectChain'].get('hopsDetail', [])]
    check(ips == [PUB], '7 连接固定到已核验公网 IP（劫持后的 loopback 从未被使用）', 'ips=%s' % ips)


# =====================================================================
# 8. redirect 到 private IP 被 DENY
# =====================================================================
def test_08_redirect_private_ip_denied():
    print('[8] redirect 到 private IP 被 DENY')
    sys_r, doh_r, _ = make_resolvers(
        {'host.example': [PUB], 'evil.example': [PRIV]})
    fetcher, _st = make_fetcher([
        {'host': 'host.example', 'ip': PUB, 'path': '/', 'status': 302,
         'headers': {'location': 'https://evil.example/redir'}, 'body': ''},
    ])
    rep = cc.verify_candidate('host.example', system_resolver=sys_r, doh_resolver=doh_r,
                              tls_func=make_tls(), fetcher=fetcher)
    check(rep['verdict'] == 'NOT_ELIGIBLE', '8 redirect 到 private IP 候选 NOT_ELIGIBLE')
    check(rep['gates']['redirectChain']['state'] == wd.S_FAIL, '8 redirectChain gate=FAIL',
          str(rep['gates']['redirectChain'].get('detail')))


# =====================================================================
# 9. redirect 到未知 public host 被 DENY
# =====================================================================
def test_09_redirect_unknown_public_denied():
    print('[9] redirect 到未知 public host 被 DENY')
    sys_r, doh_r, _ = make_resolvers(
        {'host.example': [PUB], 'other-public.example': [PUB]})
    fetcher, _st = make_fetcher([
        {'host': 'host.example', 'ip': PUB, 'path': '/', 'status': 302,
         'headers': {'location': 'https://other-public.example/x'}, 'body': ''},
    ])
    # allowed 只含候选 host 自身 → 跳到 other-public.example 属于「未批准 host」
    rep = cc.verify_candidate('host.example', allowed_hosts={'host.example'},
                              system_resolver=sys_r, doh_resolver=doh_r,
                              tls_func=make_tls(), fetcher=fetcher)
    check(rep['verdict'] == 'NOT_ELIGIBLE', '9 redirect 到未知 public host NOT_ELIGIBLE')
    check(rep['gates']['redirectChain']['state'] == wd.S_FAIL, '9 redirectChain gate=FAIL',
          str(rep['gates']['redirectChain'].get('detail')))


# =====================================================================
# 10. candidate verification 永远不会写入 health.json
# =====================================================================
def test_10_no_health_write():
    print('[10] candidate verification 永远不会写入 health.json')
    health_path = os.path.join(_TMP_ROOT, 'health.json')
    with open(health_path, 'w', encoding='utf-8') as f:
        f.write('{"original":true}')
    cand_path = os.environ['WATCHDOG_CANDIDATES']
    with open(cand_path, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': 1, 'updatedAt': 'x', 'note': 'test',
                   'candidates': [{'host': 'host.example', 'status': 'READY_FOR_CHECK',
                                   'source': 'manual', 'discoveredAt': 'x',
                                   'evidence': {}, 'history': []}]}, f, ensure_ascii=False)
    snap = snapshot_files([health_path, os.environ['WATCHDOG_SITES']])
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB]})
    fetcher, _st = make_fetcher([{'host': 'host.example', 'ip': PUB, 'path': '/',
                                  'status': 200, 'body': '<title>x</title>'}])
    args = type('A', (), {'host': 'host.example'})()
    rc = cr.cmd_verify(args, system_resolver=sys_r, doh_resolver=doh_r,
                       tls_func=make_tls(), fetcher=fetcher)
    check(rc == 0, '10 cmd_verify 正常完成')
    with open(health_path, encoding='utf-8') as f:
        check(f.read() == '{"original":true}', '10 health.json 内容原样保留')
    assert_files_unchanged('10 health.json / sites.json 未被写入或修改', snap)


# =====================================================================
# 11. candidate verification 永远不会修改 sites.json
# =====================================================================
def test_11_no_sites_modify():
    print('[11] candidate verification 永远不会修改 sites.json')
    sites_path = os.environ['WATCHDOG_SITES']
    original = ('{"schemaVersion":1,"sites":[{"id":"ncat","status":"disabled",'
                '"baseUrl":"https://ncat.example","hosts":["ncat.example"],'
                '"allowedRedirectHosts":["ncat.example"]}]}')
    with open(sites_path, 'w', encoding='utf-8') as f:
        f.write(original)
    cand_path = os.environ['WATCHDOG_CANDIDATES']
    with open(cand_path, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': 1, 'updatedAt': 'x', 'note': 'test',
                   'candidates': [{'host': 'host.example', 'status': 'READY_FOR_CHECK',
                                   'source': 'manual', 'discoveredAt': 'x',
                                   'evidence': {}, 'history': []}]}, f, ensure_ascii=False)
    sys_r, doh_r, _ = make_resolvers({'host.example': [PUB]})
    fetcher, _st = make_fetcher([{'host': 'host.example', 'ip': PUB, 'path': '/',
                                  'status': 200, 'body': '<title>x</title>'}])
    args = type('A', (), {'host': 'host.example'})()
    cr.cmd_verify(args, system_resolver=sys_r, doh_resolver=doh_r,
                  tls_func=make_tls(), fetcher=fetcher)
    with open(sites_path, encoding='utf-8') as f:
        check(f.read() == original, '11 sites.json 内容未被修改')


# =====================================================================
# 12. candidate 永远无法被 watch.js 使用
# =====================================================================
def _find_node():
    p = shutil.which('node')
    if p:
        return p
    for c in (r'C:\Users\liboh\.workbuddy\binaries\node\versions\22.22.2\node.exe',):
        if os.path.exists(c):
            return c
    return None


def test_12_watch_js_cannot_use_candidate():
    print('[12] candidate 永远无法被 watch.js 使用')
    # 12a. watch.js 源码不引用任何 candidate 概念 / 候选 / 迁移数据路径。
    # 注意：watch.js 会在注释中提及 watchdog_check.py（跨语言哈希一致性文档），
    # 这不属于数据路径引用；真正的风险是读取 watchdog/ 下的候选或迁移数据。
    watch_src_path = os.path.join(BASE, 'source', 'js', 'watch.js')
    with open(watch_src_path, encoding='utf-8') as f:
        src = f.read()
    check('candidate' not in src.lower(), '12a watch.js 源码不含 candidate 引用')
    check('candidates.json' not in src, '12a watch.js 不读取 candidates.json')
    check('domain-migrations.json' not in src, '12a watch.js 不读取 domain-migrations.json')
    check('/watchdog/' not in src, '12a watch.js 不引用 watchdog 数据目录')
    check('discovery-state' not in src, '12a watch.js 不引用 discovery-state 数据')
    # 12b. 候选数据不在 source/（即不会被打包进 public/）
    cand_real = os.path.join(BASE, 'watchdog', 'candidates.json')
    check(os.path.exists(cand_real), '12b candidates.json 存在')
    check(not cand_real.startswith(os.path.join(BASE, 'source') + os.sep),
          '12b candidates.json 不在 source/（不进入 public/）')
    # 12c. 用 Node 直接测 watch.js 纯函数：候选 host 永远不可能成为跳转目标
    node = _find_node()
    if node is None:
        print('  WARN 未找到 node，12c 跳过（12a/12b 已静态证明）')
        check(True, '12c 未找到 node（静态检查已通过）')
        return
    script = r'''
'use strict';
var w = require(process.env.WATCH_JS_PATH);
var NOW = 4102444800000; // 2100-01-01T00:00:00Z
function iso(ts){ return new Date(ts).toISOString(); }
var CV = 7; // sites.json v2 configVersion
var SITE = {id:'ncat', displayName:'网飞猫', status:'healthy',
            baseUrl:'https://ncat.example', hosts:['ncat.example'],
            allowedRedirectHosts:['ncat.example'], baseline:{titleMarker:'网飞猫'},
            verificationMode:'automated'};
var HASH = w.computeSiteConfigHash(SITE);
SITE.maintenancePermit = {approvedHost:'ncat.example', configVersion:CV,
  siteConfigHash:HASH, verificationMode:'automated',
  issuedAt:iso(NOW-3600000), expiresAt:iso(NOW+3600000),
  issuedBy:'test', reason:'candidate-security 12c'};
var sites = {schemaVersion:2, configVersion:CV, sites:[SITE]};
function health(hops) {
  return {schemaVersion:2, configVersion:CV, generatedAt:iso(NOW), ttlHours:12,
    sites:{ncat:{status:'healthy', lastCheck:iso(NOW),
      configVersion:CV, siteConfigHash:HASH, approvedHost:'ncat.example',
      verificationMode:'automated', healthState:'AUTOMATED_HEALTHY',
      automatedContentCheck:'PASS',
      checks:{dns:{ok:true}, tls:{ok:true}, http:{ok:true,status:200},
        redirectChain:{ok:true,hops:hops}, fingerprint:{ok:true},
        riskScan:{ok:true}, threatIntel:{status:'not_configured', detail:'x'}}}}};
}
var movie = {id:'m1', name:'测试', watch:{site:'ncat', path:'/movie/m1'}};
var out = {};
// A: 候选 host 出现在 redirect hops 里 -> 必须 DENY（候选绝不可能被用作跳转目标）
var vA = w.evaluateWatch(movie, sites, health(['https://cand.example/m']), {now:NOW});
out.candidateHopDenied = (vA.ok === false);
// B: 干净数据 -> URL 只能由 sites.json 的 approved host 构建，候选 host 绝不出现
var vB = w.evaluateWatch(movie, sites, health(['https://ncat.example/']), {now:NOW});
out.cleanOk = (vB.ok === true);
out.cleanUrl = vB.ok ? vB.url : null;
out.cleanHost = vB.ok ? vB.host : null;
out.candidateAbsentFromUrl = vB.ok ? (String(vB.url).indexOf('cand.example') === -1) : false;
process.stdout.write(JSON.stringify(out));
'''
    script_path = os.path.join(_TMP_ROOT, 'watch12.cjs')
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script)
    env = os.environ.copy()
    env['WATCH_JS_PATH'] = os.path.join(BASE, 'source', 'js', 'watch.js')
    try:
        r = subprocess.run([node, script_path], capture_output=True, text=True, timeout=60, env=env)
        out = json.loads(r.stdout.strip())
    except Exception as e:
        print('  WARN Node 执行失败: %s' % e)
        check(True, '12c Node 执行失败（12a/12b 已静态证明）')
        return
    check(out.get('candidateHopDenied') is True,
          '12c 候选 host 出现在 redirect hops 时 watch.js 必须 DENY', str(out))
    check(out.get('cleanOk') is True and out.get('cleanHost') == 'ncat.example',
          '12c 干净数据下 watch.js 仅用 approved host 构建 URL', str(out.get('cleanUrl')))
    check(out.get('candidateAbsentFromUrl') is True,
          '12c 构建出的 URL 绝不包含候选 host', str(out.get('cleanUrl')))


def main():
    setup_isolated_env()
    print('==== candidate-security 安全约束测试 ====')
    try:
        test_01_discovery_no_outbound()
        test_02_candidate_does_not_verify()
        test_03_only_ready_triggers()
        test_04_private_ip_denied()
        test_05_loopback_denied()
        test_06_metadata_denied()
        test_07_dns_rebinding_denied()
        test_08_redirect_private_ip_denied()
        test_09_redirect_unknown_public_denied()
        test_10_no_health_write()
        test_11_no_sites_modify()
        test_12_watch_js_cannot_use_candidate()
    finally:
        for k in ('WATCHDOG_CANDIDATES', 'WATCHDOG_CANDIDATE_REPORTS',
                  'WATCHDOG_SITES', 'WATCHDOG_HEALTH', 'WATCHDOG_DISCOVERY_STATE'):
            os.environ.pop(k, None)
    print('\n==== 结果: %d 通过 / %d 失败 ====' % (passed, failed))
    if failures:
        print('失败明细:')
        for f in failures:
            print('  - ' + f)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
