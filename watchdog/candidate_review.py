#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
候选域名发现与人工审核工具（candidate review / discovery）。

职责：
  - 维护 watchdog/candidates.json（仅记录，绝不参与用户跳转链）。
  - 自动发现只负责「发现并记录」：把页内观察到的外域 host 记为 CANDIDATE，
    默认绝不执行任何网络核验，也绝不产生对这些外域 host 的网络请求。
  - 只有管理员显式执行 `ready` 将候选标记为 READY_FOR_CHECK 后，
    `verify` 才允许运行（复用 watchdog/candidate_check.py 的 SSRF / DNS Rebinding 防护）。
  - 核验报告写入 watchdog/candidate-reports/<host>.json。
  - TECHNICALLY_ELIGIBLE 仅表示「通过预定义技术检查」，绝不表示官方身份已证明。
    最终批准只有一条路径：人工审核 → 人工修改 sites.json → approved。

assistant_web_search 的语义：
  - 仅作为「人工调查过程中获得的证据来源」。
  - 搜索结果只能通过 `add --source assistant_search --evidence-url <url>` 创建或补充
    CANDIDATE 记录；绝不自动信任、绝不自动加入 approved、绝不因搜索结果触发跳转
    或触发 candidate verification。

安全边界（与 AGENTS.md 一致）：
  - candidate 不进入 source/、不进入 public/、不进入 health.json、不加入 allowedRedirectHosts。
  - watch.js 不读取 candidate；新域名不能自动升级；只有人工修改 sites.json 才能 approved。
  - 本工具永远不写 sites.json / health.json / watch.js / movies.json。

子命令：
  list                     列出所有候选（默认）
  add <host>               手动录入候选（--source manual|assistant_search|page_observation
                           --evidence-url <url> --note <note>）
  discover <url>           抓取管理员显式提供的 URL，把页面中的外域 host 记录为 CANDIDATE
                           （只请求该 URL，绝不请求发现的任何外域 host；--approved 额外忽略）
  ready <host>             把候选标记为 READY_FOR_CHECK（人工批准核验）
  verify <host>            对 READY_FOR_CHECK 候选执行技术核验（其余状态一律拒绝）
  reject <host> [note]     人工拒绝（REJECTED）
  drop <host> [note]       移除候选（DROPPED，保留审计痕迹）

路径可用环境变量覆盖（测试用）：
  WATCHDOG_CANDIDATES、WATCHDOG_CANDIDATE_REPORTS、WATCHDOG_SITES（只读）、
  WATCHDOG_DISCOVERY_STATE
"""
import argparse
import json
import os
import sys
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
sys.path.insert(0, os.path.join(BASE, 'watchdog'))
import watchdog_check as wd
import candidate_check as cc

# 候选状态机（绝不与 approved 混淆）
ST_CANDIDATE = 'CANDIDATE'
ST_READY = 'READY_FOR_CHECK'
ST_ELIGIBLE = 'TECHNICALLY_ELIGIBLE'
ST_REJECTED = 'REJECTED'
ST_DROPPED = 'DROPPED'

SOURCES = ('page_observation', 'assistant_search', 'manual')


def get_candidates_path():
    return os.environ.get('WATCHDOG_CANDIDATES',
                          os.path.join(BASE, 'watchdog', 'candidates.json'))


def get_reports_dir():
    return os.environ.get('WATCHDOG_CANDIDATE_REPORTS',
                          os.path.join(BASE, 'watchdog', 'candidate-reports'))


def get_sites_path():
    return os.environ.get('WATCHDOG_SITES', os.path.join(BASE, 'source', 'data', 'sites.json'))


def _write_json(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, path)


def load_candidates():
    path = get_candidates_path()
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = {'schemaVersion': 1, 'updatedAt': cc.now_iso(),
                'note': '候选域名注册表（仅记录，绝不参与用户跳转链）', 'candidates': []}
    data.setdefault('candidates', [])
    return data


def save_candidates(data):
    data['schemaVersion'] = 1
    data['updatedAt'] = cc.now_iso()
    data.setdefault('note', '候选域名注册表（仅记录，绝不参与用户跳转链）')
    path = get_candidates_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _write_json(path, data)


def find_candidate(data, host):
    for c in data['candidates']:
        if c.get('host') == host:
            return c
    return None


def get_status(host):
    data = load_candidates()
    c = find_candidate(data, host)
    return c['status'] if c else None


def approved_hosts_from_sites(sites_path=None):
    """只读 sites.json 的人工批准 host（hosts + allowedRedirectHosts）。绝不修改。"""
    path = sites_path or get_sites_path()
    approved = set()
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        for s in data.get('sites') or []:
            for k in ('hosts', 'allowedRedirectHosts'):
                for h in s.get(k) or []:
                    if isinstance(h, str) and h:
                        approved.add(h.lower().rstrip('.'))
    except Exception:
        pass
    return approved


# ---------- 子命令实现 ----------

def cmd_list(args):
    data = load_candidates()
    if not data['candidates']:
        print('（无候选）')
        return 0
    for c in sorted(data['candidates'], key=lambda x: x.get('host', '')):
        src = c.get('source', '?')
        ev = c.get('evidence') or {}
        note = (ev.get('note') or '').strip()
        print('%-8s %-28s source=%s %s' % (c.get('status'), c.get('host'), src,
                                           ('| ' + note) if note else ''))
    return 0


def cmd_add(args):
    host = args.host.strip().lower().rstrip('.')
    ok, reason = cc.validate_public_hostname(host)
    if not ok:
        print('拒绝：%s' % reason)
        return 1
    source = args.source or 'manual'
    if source not in SOURCES:
        print('source 必须为 %s' % ' / '.join(SOURCES))
        return 1
    data = load_candidates()
    existing = find_candidate(data, host)
    if existing:
        existing['source'] = source
        if args.evidence_url:
            existing.setdefault('evidence', {})['observedUrl'] = args.evidence_url
        if args.note:
            existing.setdefault('evidence', {})['note'] = args.note
        existing.setdefault('history', []).append({
            'at': cc.now_iso(), 'action': 'supplement', 'by': 'human',
            'note': '补充证据（source=%s）' % source})
        save_candidates(data)
        print('%s 已存在，已补充证据。' % host)
        return 0
    rec = {
        'host': host,
        'status': ST_CANDIDATE,
        'source': source,
        'discoveredAt': cc.now_iso(),
        'evidence': {},
    }
    if args.evidence_url:
        rec['evidence']['observedUrl'] = args.evidence_url
    if args.note:
        rec['evidence']['note'] = args.note
    rec['history'] = [{'at': cc.now_iso(), 'action': 'discover', 'by': 'human',
                       'note': '来源=%s' % source}]
    data['candidates'].append(rec)
    save_candidates(data)
    print('%s -> CANDIDATE（仅记录，未做任何网络核验）' % host)
    return 0


def cmd_discover(args, fetcher=None):
    """抓取管理员显式提供的 URL，记录页面中的外域 host 为 CANDIDATE。
    只请求该 URL 本身；对页面中发现的任何外域 host 绝不发起请求、绝不核验。"""
    url = args.url.strip()
    u = urllib.parse.urlparse(url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password:
        print('拒绝：URL 必须是纯 https 且不含 userinfo: %s' % url)
        return 1
    host = u.hostname.lower().rstrip('.')
    ok, reason = cc.validate_public_hostname(host)
    if not ok:
        print('拒绝：URL host 非法（%s）' % reason)
        return 1
    approved = set(approved_hosts_from_sites())
    if args.approved:
        for h in args.approved:
            approved.add(h.strip().lower().rstrip('.'))
    if host in approved:
        print('注意：%s 已是人工批准 host，不重复记录为候选。' % host)

    # 固定 IP 抓取（SSRF 防护：连公网 IP，SNI/Host = host）
    ok_dns, ips, dns_detail, dns_state = cc.resolve_and_pin(host)
    if not ok_dns:
        print('拒绝：来源页面 DNS 未通过（%s），未执行抓取。' % dns_detail)
        return 1
    path = (u.path or '/') + ('?' + u.query if u.query else '')
    fetch = fetcher or (lambda h, ip, p: cc.pinned_request(h, ip, p))
    status, headers, body = fetch(host, ips[0], path)
    if status is None or not (200 <= status < 300):
        print('来源页面请求失败（status=%s），未发现任何候选。' % status)
        return 0

    discovered = extract_candidates_from_page(body, url, approved)
    if host not in approved:
        discovered = [{'host': host, 'source': 'page_observation',
                       'contexts': [], 'category': 'source_page',
                       'observedUrl': url}] + discovered

    data = load_candidates()
    added = 0
    for d in discovered:
        h2 = d['host']
        existing = find_candidate(data, h2)
        if existing:
            existing['source'] = 'page_observation'
            existing.setdefault('evidence', {})['observedUrl'] = d.get('observedUrl') or url
            existing.setdefault('evidence', {})['category'] = d.get('category')
            existing.setdefault('evidence', {})['contexts'] = sorted(
                set(existing.get('evidence', {}).get('contexts', [])) | set(d.get('contexts', [])))
            existing.setdefault('history', []).append({
                'at': cc.now_iso(), 'action': 'discover', 'by': 'human',
                'note': '页面发现补充: %s' % d.get('observedUrl') or url})
        else:
            data['candidates'].append({
                'host': h2, 'status': ST_CANDIDATE, 'source': 'page_observation',
                'discoveredAt': cc.now_iso(),
                'evidence': {'observedUrl': d.get('observedUrl') or url,
                             'contexts': d.get('contexts', []),
                             'category': d.get('category')},
                'history': [{'at': cc.now_iso(), 'action': 'discover', 'by': 'human',
                             'note': '页面发现: %s' % (d.get('observedUrl') or url)}]})
            added += 1
    save_candidates(data)
    print('发现 %d 个新候选（共记录 %d 条）。全部仅记录为 CANDIDATE，未做任何网络核验。'
          % (added, len(discovered)))
    for d in discovered:
        print('  - %-28s %s contexts=%s' % (d['host'], d.get('category'),
                                            ','.join(d.get('contexts', []))))
    return 0


def extract_candidates_from_page(body, source_url, approved_hosts):
    """纯函数：从页面正文解析外域 host → 候选记录（不发起任何网络请求）。
    任何 host 都不自动核验 / 不自动请求，只生成 CANDIDATE 记录。"""
    approved = set(approved_hosts)
    scanner = wd.PageHostScanner(approved)
    try:
        scanner.feed(body.decode('utf-8', errors='replace'))
    except Exception:
        return []
    out = []
    seen = set()
    for h, rec in sorted(scanner.hosts.items()):
        if h.startswith('__scheme_'):
            continue  # 非 http(s) 协议引用只记录不可访问，不生成 host 候选
        h = h.lower().rstrip('.')
        if h in approved or h in seen:
            continue
        ok_h, reason = cc.validate_public_hostname(h)
        if not ok_h:
            continue
        seen.add(h)
        out.append({
            'host': h,
            'source': 'page_observation',
            'contexts': sorted(rec['contexts']),
            'category': wd.classify_host(h, approved, sorted(rec['contexts'])),
            'observedUrl': source_url,
        })
    return out


def cmd_ready(args):
    data = load_candidates()
    c = find_candidate(data, args.host)
    if not c:
        print('候选不存在: %s' % args.host)
        return 1
    if c['status'] == ST_READY:
        print('%s 已是 READY_FOR_CHECK' % args.host)
        return 0
    if c['status'] not in (ST_CANDIDATE, ST_ELIGIBLE):
        print('拒绝：状态 %s 不可标记为 READY_FOR_CHECK' % c['status'])
        return 1
    c['status'] = ST_READY
    c.setdefault('history', []).append({
        'at': cc.now_iso(), 'action': 'ready', 'by': 'human',
        'note': '人工批准进入技术核验'})
    save_candidates(data)
    print('%s -> READY_FOR_CHECK（人工批准核验）' % args.host)
    return 0


def cmd_verify(args, system_resolver=None, doh_resolver=None, tls_func=None, fetcher=None):
    """仅对 READY_FOR_CHECK 执行核验；其余状态一律拒绝（不调用 verify_candidate）。"""
    data = load_candidates()
    c = find_candidate(data, args.host)
    if not c:
        print('候选不存在: %s' % args.host)
        return 1
    if c['status'] != ST_READY:
        print('拒绝：只有 READY_FOR_CHECK 才能触发核验（当前 %s）。'
              '候选默认不做任何网络核验。' % c['status'])
        return 1

    rep = cc.verify_candidate(args.host,
                              system_resolver=system_resolver,
                              doh_resolver=doh_resolver,
                              tls_func=tls_func,
                              fetcher=fetcher)
    rep_dir = get_reports_dir()
    os.makedirs(rep_dir, exist_ok=True)
    rep_path = os.path.join(rep_dir, args.host + '.json')
    _write_json(rep_path, rep)

    if rep['verdict'] == 'ELIGIBLE':
        c['status'] = ST_ELIGIBLE
        note = '技术核验通过 → TECHNICALLY_ELIGIBLE（仅技术，非身份证明）'
    else:
        c['status'] = ST_READY
        bad = [k for k, v in rep['gates'].items()
               if isinstance(v, dict) and v.get('state') != cc.S_PASS]
        note = '技术核验未通过（gates=%s）→ 保持 READY_FOR_CHECK' % ','.join(bad)
    c.setdefault('history', []).append({'at': cc.now_iso(), 'action': 'verify',
                                        'by': 'human', 'note': note})
    c['lastReport'] = rep_path
    save_candidates(data)
    print('%s -> %s' % (args.host, c['status']))
    print('verdict=%s  报告: %s' % (rep['verdict'], rep_path))
    for k, v in rep['gates'].items():
        print('  %-16s state=%-8s %s' % (k, v.get('state'), v.get('detail', '')))
    return 0 if rep['verdict'] == 'ELIGIBLE' else 1


def cmd_reject(args):
    data = load_candidates()
    c = find_candidate(data, args.host)
    if not c:
        print('候选不存在: %s' % args.host)
        return 1
    if c['status'] == ST_REJECTED:
        print('%s 已是 REJECTED' % args.host)
        return 0
    c['status'] = ST_REJECTED
    c.setdefault('history', []).append({
        'at': cc.now_iso(), 'action': 'reject', 'by': 'human',
        'note': args.note or '人工拒绝'})
    save_candidates(data)
    print('%s -> REJECTED' % args.host)
    return 0


def cmd_drop(args):
    data = load_candidates()
    c = find_candidate(data, args.host)
    if not c:
        print('候选不存在: %s' % args.host)
        return 1
    c['status'] = ST_DROPPED
    c.setdefault('history', []).append({
        'at': cc.now_iso(), 'action': 'drop', 'by': 'human', 'note': args.note or '移除'})
    save_candidates(data)
    print('%s -> DROPPED' % args.host)
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description='候选域名发现与人工审核工具')
    sub = p.add_subparsers(dest='cmd')

    sub.add_parser('list', help='列出所有候选')

    pa = sub.add_parser('add', help='手动录入候选')
    pa.add_argument('host')
    pa.add_argument('--source', choices=SOURCES, default='manual')
    pa.add_argument('--evidence-url')
    pa.add_argument('--note')

    pd = sub.add_parser('discover', help='从管理员提供的页面发现并记录候选')
    pd.add_argument('url')
    pd.add_argument('--approved', nargs='*', default=[], help='额外忽略（已批准）的 host')

    pr = sub.add_parser('ready', help='标记 READY_FOR_CHECK')
    pr.add_argument('host')

    pv = sub.add_parser('verify', help='对 READY_FOR_CHECK 候选执行技术核验')
    pv.add_argument('host')

    pj = sub.add_parser('reject', help='人工拒绝')
    pj.add_argument('host')
    pj.add_argument('note', nargs='?')

    pd2 = sub.add_parser('drop', help='移除候选')
    pd2.add_argument('host')
    pd2.add_argument('note', nargs='?')

    args = p.parse_args(argv)
    if args.cmd in (None, 'list'):
        return cmd_list(args)
    return {
        'add': cmd_add, 'discover': cmd_discover, 'ready': cmd_ready,
        'verify': cmd_verify, 'reject': cmd_reject, 'drop': cmd_drop,
    }[args.cmd](args)


if __name__ == '__main__':
    sys.exit(main())
