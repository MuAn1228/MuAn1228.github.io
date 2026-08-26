#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
域名迁移 CLI —— Phase 2「Provider-Agnostic + Safe Domain Migration」的唯一操作入口。

设计目标：未来更换第三方站点域名 = 修改唯一站点配置入口（sites.json）+ 一次受控的状态迁移。
绝不修改电影数据、不修改 watch.js、不修改 watchdog 业务逻辑、不修改候选机制。

状态机（仅人工驱动，禁止任何自动升级路径）：
    disabled / healthy --begin--> pending_verification --approve(人工 + watchdog 全 PASS)--> healthy
    pending_verification --revert(人工)--> disabled（恢复旧域名，绝不自动重新启用）

事务一致性（sites / health / permit / manifest）：
  - begin / approve 都会 configVersion +1（任何影响安全决策的站点修改必须递增）。
  - configVersion 变更 → 旧 health 通过「版本绑定」自动失效
    （watch.js 见 config_version_mismatch → DENY），实现「标记旧 health 无效」。
  - begin / approve 都会清空 maintenancePermit（permit 绑定旧 configVersion + 旧 hash，必然失效）。
  - 本工具绝不写 health.json（health.json 由 watchdog_check.py 生成）；它只读 health.json，
    供 approve 判定「最新 watchdog 是否全 PASS 且绑定一致」。
  - migration manifest（watchdog/domain-migrations.json）只作为审计记录，
    绝不进入 source/、public/，watch.js 不读取，不参与任何跳转决策。

命令：
  check   --site ID                    只读查看站点配置 / 绑定 / 迁移记录（不写任何文件）
  begin   --site ID --base URL         旧配置 → pending_verification，configVersion+1，清 permit，
          [--host H ...]               记录 manifest（不写 health.json，旧 health 因版本绑定自动失效）
          [--allowed-host H ...]
  approve --site ID --approved-by NAME pending_verification + health 全 PASS + 绑定一致 → healthy，
          [--reason R]                 configVersion+1，重绑定，清 permit；绝不自动签发 permit
  revert  --site ID [--reason R]       撤销 pending 迁移：恢复旧域名，状态置 disabled（绝不自动重启用）
  renew   --site ID --issued-by NAME   人工签发 maintenance permit（仅 healthy 站点；不递增 configVersion）
          --ttl-hours N [--reason R]   manual_user_environment 站点强制：
          [--verification-method M]     --ttl-hours ∈ [12h,24h] + --verification-method/--verification-notes
          [--verification-notes N]       + 全部 7 项 --attestation；且 health 必须已按 manual 模式
          [--attestation KEY ...]       建立 MANUAL_VERIFIED 健康状态，否则拒绝签发（Fail Closed）

示例（new-domain.example 仅为示意，禁止写入生产；电影数据完全不用改）：
  python tools/domain-migrate.py begin --site ncat --base https://new-domain.example --host new-domain.example
  # → 进入 pending_verification；watchdog 对该新域名核验并建立新 health
  # → 人工审查通过后：
  python tools/domain-migrate.py approve --site ncat --approved-by MuAn
  # → 配置进入 healthy；watchdog 在最终 configVersion 再次确认后：
  python tools/domain-migrate.py renew --site ncat --issued-by MuAn --ttl-hours 24 --reason "人工复核通过"
  # → 用户恢复观看
"""
import argparse
import copy
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

# 可用环境变量覆盖路径，便于自动化测试不写仓库文件：
#   DOMAIN_MIGRATE_SITES / DOMAIN_MIGRATE_HEALTH / DOMAIN_MIGRATE_MANIFEST
SITES_PATH = os.environ.get('DOMAIN_MIGRATE_SITES', 'source/data/sites.json')
HEALTH_PATH = os.environ.get('DOMAIN_MIGRATE_HEALTH', 'source/data/health.json')
MANIFEST_PATH = os.environ.get('DOMAIN_MIGRATE_MANIFEST', 'watchdog/domain-migrations.json')

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# 复用 watchdog 的跨语言一致哈希 / hostname / 原子写（保证与 watch.js 完全一致）
from watchdog_check import compute_site_config_hash, hostname_of, now_iso, _atomic_write_json  # noqa: E402

MANIFEST_NOTE = ('域名迁移审计记录（Domain Migration Manifest）。只作为人工审计与追溯，'
                 '绝不进入 source/、public/，watch.js 不读取，不参与任何跳转安全决策。')

# verificationMode 枚举（与 watchdog_check.py / watch.js 保持同一份清单）
VM_AUTOMATED = 'automated'
VM_MANUAL = 'manual_user_environment'
VALID_VERIFICATION_MODES = (VM_AUTOMATED, VM_MANUAL)

# manual 模式 Maintenance Permit 强制要求：7 项人工 attestation（全部必须为 true）
MANUAL_ATTESTATIONS = (
    'content_verified',         # 目标页面确为电影观看/站点内容页，非空壳/纯跳转页
    'no_phishing_mimic',        # 无仿冒正规品牌、无钓鱼/欺诈特征
    'no_forced_download',       # 不诱导下载可执行文件（exe/apk/msi 等）
    'no_open_redirect',         # 无开放重定向（不跳转到用户可控的第三方 URL）
    'no_unapproved_navigation', # 无跳转到未批准外域 host 的强制导航（meta/JS）
    'https_throughout',         # 全程 HTTPS，无明文/混合内容降级
    'matches_baseline',         # 页面与人工审核基线标记一致
)
# manual 模式 permit 有效期约束：12–24 小时（不允许永久 permit / 不允许自动续签）
MIN_PERMIT_TTL_HOURS = 12
MAX_PERMIT_TTL_HOURS = 24


def _exit_error(msg):
    print('ERROR: %s' % msg, file=sys.stderr)
    sys.exit(1)


def now_utc():
    return datetime.now(timezone.utc)


def iso(ts):
    return ts.strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_iso(ts):
    """解析 ISO 8601（UTC）。无效返回 None。"""
    if not isinstance(ts, str) or not ts.strip():
        return None
    try:
        t = ts.strip()
        if t.endswith('Z'):
            t = t[:-1] + '+00:00'
        return datetime.fromisoformat(t)
    except Exception:
        return None


def load_json(path, default=None):
    if not os.path.exists(path):
        return copy.deepcopy(default)
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        _exit_error('无法读取 %s: %s' % (path, e))


def load_sites():
    data = load_json(SITES_PATH)
    if not isinstance(data, dict) or data.get('schemaVersion') != 2 or \
            not isinstance(data.get('sites'), list):
        _exit_error('sites.json 必须为 schemaVersion=2 且包含 sites 数组')
    cv = data.get('configVersion')
    if not isinstance(cv, int) or isinstance(cv, bool) or cv <= 0:
        _exit_error('sites.json configVersion 无效: %r' % cv)
    return data


def save_sites(data):
    _atomic_write_json(SITES_PATH, data)


def load_manifest():
    data = load_json(MANIFEST_PATH)
    if data is None:
        return {'schemaVersion': 1, 'updatedAt': now_iso(), 'note': MANIFEST_NOTE, 'migrations': []}
    if not isinstance(data, dict) or not isinstance(data.get('migrations'), list):
        _exit_error('domain-migrations.json 结构无效（缺少 migrations 数组）')
    if data.get('schemaVersion') != 1:
        _exit_error('domain-migrations.json schemaVersion 不支持: %r' % data.get('schemaVersion'))
    return data


def save_manifest(m):
    m['updatedAt'] = now_iso()
    _atomic_write_json(MANIFEST_PATH, m)


def find_site(sites, site_id):
    for s in sites['sites']:
        if isinstance(s, dict) and s.get('id') == site_id:
            return s
    return None


def norm_host(host):
    """hostname 规范化：小写、去尾部点、仅允许合法域名字符。非法返回 None。"""
    if not isinstance(host, str):
        return None
    h = host.strip().lower().rstrip('.')
    if not h or '://' in h or '/' in h or '@' in h or ' ' in h or h == '.':
        return None
    if not re.match(r'^[a-z0-9]([a-z0-9\-.]*[a-z0-9])?$', h):
        return None
    return h


def normalize_base(base):
    """校验并规范化 baseUrl：仅 https、无 userinfo/query/hash/路径，host 合法。"""
    if not isinstance(base, str) or not base:
        _exit_error('--base 必须为合法的 https URL')
    u = urllib.parse.urlparse(base)
    if u.scheme != 'https':
        _exit_error('baseUrl 必须为 https: %s' % base)
    if u.username or u.password:
        _exit_error('baseUrl 不允许含 userinfo: %s' % base)
    if u.query or u.fragment:
        _exit_error('baseUrl 不允许含 query / hash: %s' % base)
    if u.path not in ('', '/'):
        _exit_error('baseUrl 不允许含路径（只允许站点根）: %s' % base)
    host = norm_host(u.hostname)
    if not host:
        _exit_error('baseUrl 缺少合法 hostname: %s' % base)
    return 'https://%s' % host, host


def normalize_host_list(hosts, fallback_host=None):
    out, seen = [], set()
    src = hosts if hosts else ([fallback_host] if fallback_host else [])
    for h in src:
        n = norm_host(h)
        if not n:
            _exit_error('非法 hostname: %r' % h)
        if n not in seen:
            seen.add(n)
            out.append(n)
    if not out:
        _exit_error('至少需要一个合法 hostname')
    return out


def permit_status(site, config_version):
    """返回 (status, permit)。status ∈ missing / valid / config_version_mismatch /
    host_mismatch / hash_mismatch / mode_mismatch / invalid_expiry / expired。"""
    p = site.get('maintenancePermit')
    if not isinstance(p, dict):
        return 'missing', None
    if p.get('configVersion') != config_version:
        return 'config_version_mismatch', p
    if p.get('approvedHost') != hostname_of(site.get('baseUrl')):
        return 'host_mismatch', p
    if p.get('siteConfigHash') != compute_site_config_hash(site):
        return 'hash_mismatch', p
    # permit 必须绑定与站点一致的 verificationMode（防跨模式复用旧 permit）
    if p.get('verificationMode') != site.get('verificationMode'):
        return 'mode_mismatch', p
    exp = parse_iso(p.get('expiresAt'))
    if exp is None:
        return 'invalid_expiry', p
    if now_utc() >= exp:
        return 'expired', p
    return 'valid', p


def load_health():
    return load_json(HEALTH_PATH)


def check_health_approvable(site, config_version, health_data):
    """approve / renew 的前置门禁：最新 watchdog 必须健康且绑定一致（只读判定）。
    返回 (ok, 原因)。任何不确定 → (False, 原因)。
    额外校验 healthState 与 verificationMode 的一致性：
      - automated  → health.healthState == AUTOMATED_HEALTHY 且 automatedContentCheck == PASS
      - manual     → health.healthState == MANUAL_VERIFIED  且 automatedContentCheck == BLOCKED_BY_WAF
    任何错配（含健康记录缺 verificationMode / healthState）→ 不可 approvable（Fail Closed）。"""
    if not isinstance(health_data, dict):
        return False, 'health.json 不存在或不可读'
    if health_data.get('schemaVersion') != 2:
        return False, 'health.json schemaVersion 不支持（%r）' % health_data.get('schemaVersion')
    if health_data.get('configVersion') != config_version:
        return False, ('health.configVersion(%s) != sites.configVersion(%s)：'
                       'watchdog 尚未在当前配置版本建立健康状态'
                       % (health_data.get('configVersion'), config_version))
    rec = health_data.get('sites', {}).get(site.get('id'))
    if not isinstance(rec, dict):
        return False, 'health 中无该站点记录'
    if rec.get('status') != 'healthy':
        return False, 'health 状态为 %s（approve 需要 healthy）' % rec.get('status')
    if rec.get('siteConfigHash') != compute_site_config_hash(site):
        return False, 'health.siteConfigHash 与当前配置不一致'
    if rec.get('approvedHost') != hostname_of(site.get('baseUrl')):
        return False, 'health.approvedHost 与当前配置不一致'
    vm = site.get('verificationMode')
    if vm not in VALID_VERIFICATION_MODES:
        return False, '站点 verificationMode 缺失或非法: %r' % vm
    if rec.get('verificationMode') != vm:
        return False, 'health.verificationMode(%r) 与站点 verificationMode(%r) 不一致' % (
            rec.get('verificationMode'), vm)
    hs = rec.get('healthState')
    acc = rec.get('automatedContentCheck')
    if vm == VM_AUTOMATED:
        if hs != 'AUTOMATED_HEALTHY' or acc != 'PASS':
            return False, ('automated 模式需要 healthState=AUTOMATED_HEALTHY + automatedContentCheck=PASS，'
                           '当前 healthState=%r automatedContentCheck=%r' % (hs, acc))
    else:  # manual_user_environment
        if hs != 'MANUAL_VERIFIED' or acc != 'BLOCKED_BY_WAF':
            return False, ('manual 模式需要 healthState=MANUAL_VERIFIED + automatedContentCheck=BLOCKED_BY_WAF，'
                           '当前 healthState=%r automatedContentCheck=%r' % (hs, acc))
    gen = parse_iso(health_data.get('generatedAt'))
    ttl = health_data.get('ttlHours')
    if gen is None or not isinstance(ttl, (int, float)) or isinstance(ttl, bool) or not ttl > 0:
        return False, 'health.generatedAt / ttlHours 无效'
    if now_utc() > gen + timedelta(hours=ttl):
        return False, 'health 已过期（generatedAt=%s, ttl=%sh）' % (health_data.get('generatedAt'), ttl)
    return True, None


def latest_pending_migration(manifest, site_id):
    pend = [r for r in manifest.get('migrations', [])
            if r.get('site') == site_id and r.get('status') == 'pending']
    if not pend:
        return None
    return pend[-1]


def _latest_migration(manifest, site_id):
    return [r for r in manifest.get('migrations', []) if r.get('site') == site_id]


# ---------------------------------------------------------------------------
# check（只读）
# ---------------------------------------------------------------------------

def cmd_check(args):
    sites = load_sites()
    manifest = load_manifest()
    health = load_health()
    cv = sites['configVersion']

    targets = [find_site(sites, args.site)] if args.site else sites['sites']
    for site in targets:
        if not isinstance(site, dict):
            continue
        sid = site.get('id', '?')
        print('=== site: %s ===' % sid)
        print('  displayName    : %s' % site.get('displayName'))
        print('  status         : %s' % site.get('status'))
        print('  baseUrl        : %s' % site.get('baseUrl'))
        print('  hosts          : %s' % ', '.join(site.get('hosts') or []))
        print('  allowedRedirectHosts: %s' % ', '.join(site.get('allowedRedirectHosts') or []))
        print('  configVersion  : %d' % cv)
        print('  siteConfigHash : %s' % compute_site_config_hash(site))
        print('  approvedHost   : %s' % hostname_of(site.get('baseUrl')))
        print('  verificationMode: %s' % site.get('verificationMode'))

        pst, p = permit_status(site, cv)
        if pst == 'valid':
            print('  permit         : VALID（issuedBy=%s, expiresAt=%s）'
                  % (p.get('issuedBy'), p.get('expiresAt')))
        elif pst == 'missing':
            print('  permit         : MISSING')
        else:
            print('  permit         : INVALID（%s）' % pst)

        if isinstance(health, dict):
            hrec = health.get('sites', {}).get(sid)
            if hrec:
                ok = (health.get('configVersion') == cv and hrec.get('status') == 'healthy' and
                      hrec.get('siteConfigHash') == compute_site_config_hash(site) and
                      hrec.get('approvedHost') == hostname_of(site.get('baseUrl')))
                print('  health         : %s（configVersion=%s, bound=%s）'
                      % (hrec.get('status'), health.get('configVersion'), ok))
            else:
                print('  health         : 无记录')
        else:
            print('  health         : 不可读')

        migs = _latest_migration(manifest, sid)
        if migs:
            last = migs[-1]
            print('  最近迁移        : status=%s from=%s(%s) to=%s，startedAt=%s'
                  % (last.get('status'), last.get('fromHost'), last.get('fromConfigVersion'),
                     last.get('toHost'), last.get('startedAt')))
        else:
            print('  最近迁移        : 无')
        print()


# ---------------------------------------------------------------------------
# begin
# ---------------------------------------------------------------------------

def cmd_begin(args):
    sites = load_sites()
    manifest = load_manifest()
    site = find_site(sites, args.site)
    if not site:
        _exit_error('站点不存在: %s' % args.site)

    if site.get('status') == 'pending_verification':
        _exit_error('站点 %s 已有进行中的迁移（pending_verification），请先 approve 或 revert' % args.site)
    if latest_pending_migration(manifest, args.site):
        _exit_error('manifest 中存在进行中的迁移记录，请先 approve 或 revert')

    old_cv = sites['configVersion']
    old_status = site.get('status')

    new_base, new_host = normalize_base(args.base)
    new_hosts = normalize_host_list(args.host, fallback_host=new_host)
    if new_host not in new_hosts:
        _exit_error('baseUrl 的 hostname（%s）必须在 --host 列表内' % new_host)
    new_allowed = normalize_host_list(args.allowed_host, fallback_host=None) \
        if args.allowed_host else list(new_hosts)

    old_host = hostname_of(site.get('baseUrl'))
    if old_host == new_host:
        print('WARN: 新旧 hostname 相同（%s），begin 无实际域名变化' % new_host)

    # 完整旧配置快照（revert 时精确恢复）
    from_snapshot = copy.deepcopy(site)

    # 应用迁移（仅改 sites.json；health.json 由 watchdog 重建，旧 health 因版本绑定自动失效）
    site['status'] = 'pending_verification'
    site['baseUrl'] = new_base
    site['hosts'] = new_hosts
    site['allowedRedirectHosts'] = new_allowed
    site['maintenancePermit'] = None
    if args.display_name:
        site['displayName'] = args.display_name
    site['reason'] = (args.reason or
                      ('域名迁移进行中（pending_verification）：%s → %s。'
                       '旧配置快照与审计记录见 watchdog/domain-migrations.json。'
                       '迁移完成后需人工 approve 并重新签发 maintenancePermit。'
                       % (old_host, new_host)))

    sites['configVersion'] = old_cv + 1

    manifest['migrations'].append({
        'site': args.site,
        'fromSnapshot': from_snapshot,
        'fromHost': old_host,
        'toHost': new_host,
        'fromConfigVersion': old_cv,
        'toConfigVersion': None,
        'status': 'pending',
        'startedAt': now_iso(),
        'approvedAt': None,
        'approvedBy': None,
        'verificationResult': None,
        'revertedAt': None,
    })

    save_sites(sites)
    save_manifest(manifest)

    print('begin OK: %s %s → %s' % (args.site, old_status, 'pending_verification'))
    print('  configVersion: %d → %d' % (old_cv, sites['configVersion']))
    print('  baseUrl      : %s' % new_base)
    print('  hosts        : %s' % ', '.join(new_hosts))
    print('  allowedRedirectHosts: %s' % ', '.join(new_allowed))
    print('  maintenancePermit   : 已清空')
    print('  migration manifest  : 已记录（watchdog/domain-migrations.json）')
    print()
    print('下一步（人工）：')
    print('  1. 等待 watchdog 对新域名完成核验并建立健康状态（health.configVersion 必须等于 %d）'
          % sites['configVersion'])
    print('  2. 人工审查 watchdog 输出')
    print('  3. 通过后执行: python tools/domain-migrate.py approve --site %s --approved-by <你的名字>'
          % args.site)
    print('  4. approve 后等待 watchdog 在最终 configVersion 再次确认，再执行 renew 签发 permit')


# ---------------------------------------------------------------------------
# approve
# ---------------------------------------------------------------------------

def cmd_approve(args):
    sites = load_sites()
    manifest = load_manifest()
    site = find_site(sites, args.site)
    if not site:
        _exit_error('站点不存在: %s' % args.site)
    if site.get('status') != 'pending_verification':
        _exit_error('approve 仅允许在 pending_verification 状态执行（当前 %s）' % site.get('status'))
    if not args.approved_by.strip():
        _exit_error('--approved-by 必须提供人工署名')

    old_cv = sites['configVersion']

    # 前置门禁：最新 watchdog 健康 + 绑定一致（只读）
    health_data = load_health()
    ok, why = check_health_approvable(site, old_cv, health_data)
    if not ok:
        _exit_error('approve 被拒绝：%s（绝不批准；请等待 watchdog 在当前 configVersion=%d 建立健康状态）'
                    % (why, old_cv))

    rec = latest_pending_migration(manifest, args.site)
    if not rec:
        _exit_error('manifest 中无进行中的迁移记录（begin 必须先执行）')

    from_host = rec.get('fromHost')
    to_host = rec.get('toHost')

    # 应用批准（仅改 sites.json；health 因 configVersion 变更自动失效，需 watchdog 在最终版本再次确认）
    site['status'] = 'healthy'
    site['maintenancePermit'] = None  # 绝不自动签发 permit
    site['reason'] = (args.reason or
                      ('域名迁移人工批准（%s → %s，approvedBy=%s，fromConfigVersion=%d）。'
                       '已进入 healthy；需重新签发 maintenancePermit 并等待 watchdog '
                       '在 configVersion=%d 再次确认后方可放行。'
                       % (from_host, to_host, args.approved_by, old_cv, old_cv + 1)))

    sites['configVersion'] = old_cv + 1

    # 更新 manifest 记录
    rec['status'] = 'approved'
    rec['toConfigVersion'] = sites['configVersion']
    rec['approvedAt'] = now_iso()
    rec['approvedBy'] = args.approved_by
    rec['verificationResult'] = {
        'healthGeneratedAt': health_data.get('generatedAt'),
        'healthObservedAt': health_data.get('sites', {}).get(args.site, {}).get('observedAt'),
        'healthStatus': 'healthy',
        'configVersion': old_cv,
        'siteConfigHash': health_data.get('sites', {}).get(args.site, {}).get('siteConfigHash'),
        'approvedHost': health_data.get('sites', {}).get(args.site, {}).get('approvedHost'),
        'checksAllPass': True,
    }

    save_sites(sites)
    save_manifest(manifest)

    print('approve OK: %s → healthy' % args.site)
    print('  configVersion: %d → %d' % (old_cv, sites['configVersion']))
    print('  approvedBy   : %s' % args.approved_by)
    print('  maintenancePermit: 未签发（approve 绝不自动签发 permit）')
    print()
    print('注意：health.json 仍为 configVersion=%d，客户端将因版本不匹配而 DENY，'
          '直到 watchdog 在 configVersion=%d 再次确认并生成健康状态。' % (old_cv, sites['configVersion']))
    print('之后执行: python tools/domain-migrate.py renew --site %s --issued-by <你的名字> --ttl-hours 24'
          % args.site)


# ---------------------------------------------------------------------------
# revert
# ---------------------------------------------------------------------------

def cmd_revert(args):
    sites = load_sites()
    manifest = load_manifest()
    site = find_site(sites, args.site)
    if not site:
        _exit_error('站点不存在: %s' % args.site)
    rec = latest_pending_migration(manifest, args.site)
    if not rec:
        _exit_error('没有可撤销的进行中迁移（仅 status=pending 可 revert；已 approved 的记录请走新的 begin）')

    snap = rec.get('fromSnapshot')
    if not isinstance(snap, dict):
        _exit_error('manifest 中的 fromSnapshot 缺失，无法安全恢复；请人工处理')

    old_cv = sites['configVersion']

    # 恢复旧域名配置（不恢复 permit，绝不自动重新启用）
    for k in ('displayName', 'baseUrl', 'hosts', 'allowedRedirectHosts', 'reason'):
        if k in snap:
            site[k] = copy.deepcopy(snap[k])
    site['status'] = 'disabled'
    site['maintenancePermit'] = None
    site['reason'] = (args.reason or
                      ('域名迁移已撤销（revert）：恢复旧域名 %s。状态置 disabled，'
                       '绝不自动重新启用；如需恢复服务请人工置 healthy + renew permit + watchdog 确认。'
                       % rec.get('fromHost')))

    sites['configVersion'] = old_cv + 1

    rec['status'] = 'reverted'
    rec['revertedAt'] = now_iso()
    rec['revertedConfigVersion'] = sites['configVersion']
    rec['revertReason'] = args.reason or ''

    save_sites(sites)
    save_manifest(manifest)

    print('revert OK: %s → disabled（恢复旧域名 %s）' % (args.site, rec.get('fromHost')))
    print('  configVersion: %d → %d' % (old_cv, sites['configVersion']))
    print('  baseUrl      : %s' % site.get('baseUrl'))
    print('  maintenancePermit: 未恢复（必须重新人工签发）')
    print('  migration manifest: 已标记 reverted')


# ---------------------------------------------------------------------------
# renew（人工签发 maintenance permit）
# ---------------------------------------------------------------------------

def cmd_renew(args):
    sites = load_sites()
    site = find_site(sites, args.site)
    if not site:
        _exit_error('站点不存在: %s' % args.site)
    if site.get('status') != 'healthy':
        _exit_error('renew 仅允许在 healthy 状态签发 permit（当前 %s）' % site.get('status'))
    if not args.issued_by.strip():
        _exit_error('--issued-by 必须提供人工署名')

    vm = site.get('verificationMode')
    if vm not in VALID_VERIFICATION_MODES:
        _exit_error('站点 verificationMode 缺失或非法: %r（只允许 automated / manual_user_environment）' % vm)

    ttl_hours = args.ttl_hours
    if args.ttl_days:
        ttl_hours = args.ttl_days * 24
    if not isinstance(ttl_hours, int) or isinstance(ttl_hours, bool) or ttl_hours <= 0:
        _exit_error('--ttl-hours / --ttl-days 必须为正整数')
    if vm == VM_MANUAL:
        # manual 模式强制：TTL ∈ [12h, 24h]（不允许永久 permit / 不允许自动续签）
        if ttl_hours < MIN_PERMIT_TTL_HOURS or ttl_hours > MAX_PERMIT_TTL_HOURS:
            _exit_error('manual 模式 TTL 必须在 [%d, %d] 小时范围内（当前 %d）'
                        % (MIN_PERMIT_TTL_HOURS, MAX_PERMIT_TTL_HOURS, ttl_hours))
        if not args.verification_method.strip():
            _exit_error('manual 模式必须提供 --verification-method（人工核验方法）')
        if not args.verification_notes.strip():
            _exit_error('manual 模式必须提供 --verification-notes（人工核验说明）')
        missing_att = [k for k in MANUAL_ATTESTATIONS if k not in set(args.attestation or [])]
        if missing_att:
            _exit_error('manual 模式必须提供全部 %d 项 attestation，缺失: %s'
                        % (len(MANUAL_ATTESTATIONS), ', '.join(missing_att)))

    cv = sites['configVersion']
    host = hostname_of(site.get('baseUrl'))
    if not host:
        _exit_error('站点 baseUrl 缺少合法 hostname')
    h = compute_site_config_hash(site)
    if not h:
        _exit_error('无法计算 siteConfigHash')

    # 门禁：health 必须在当前 configVersion 健康且与 verificationMode/healthState 一致。
    # manual 模式硬失败（绝不签发）；automated 模式保持警告（历史行为，签发后客户端仍按绑定校验）。
    health_data = load_health()
    ok, why = check_health_approvable(site, cv, health_data)
    if not ok:
        if vm == VM_MANUAL:
            _exit_error('manual 模式 renew 被拒绝：%s（绝不签发 permit）' % why)
        print('WARN: watchdog 尚未在当前 configVersion=%d 建立健康状态（%s）' % (cv, why))
        print('      客户端在 watchdog 确认前仍会 DENY，permit 此时签发不会放行。')

    issued = now_utc()
    expires = issued + timedelta(hours=ttl_hours)
    permit = {
        'approvedHost': host,
        'configVersion': cv,
        'siteConfigHash': h,
        'verificationMode': vm,
        'issuedAt': iso(issued),
        'expiresAt': iso(expires),
        'issuedBy': args.issued_by,
        'reason': args.reason or '',
    }
    if vm == VM_MANUAL:
        permit['verificationMethod'] = args.verification_method.strip()
        permit['verificationNotes'] = args.verification_notes.strip()
        permit['attestations'] = {k: True for k in MANUAL_ATTESTATIONS}
    site['maintenancePermit'] = permit

    save_sites(sites)

    print('renew OK: %s maintenancePermit 已签发' % args.site)
    print('  approvedHost   : %s' % host)
    print('  configVersion  : %d' % cv)
    print('  siteConfigHash : %s' % h)
    print('  verificationMode: %s' % vm)
    print('  issuedAt       : %s' % iso(issued))
    print('  expiresAt      : %s' % iso(expires))
    print('  issuedBy       : %s' % args.issued_by)
    if vm == VM_MANUAL:
        print('  verificationMethod: %s' % args.verification_method.strip())
        print('  attestations   : 全部 %d 项 = true' % len(MANUAL_ATTESTATIONS))
    print('  （renew 不递增 configVersion）')


# ---------------------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(
        prog='domain-migrate.py',
        description='第三方站点域名迁移唯一操作入口（sites.json 为唯一域名配置源）。')
    sub = p.add_subparsers(dest='command', required=True)

    pc = sub.add_parser('check', help='只读查看站点配置 / 绑定 / 迁移记录')
    pc.add_argument('--site', metavar='ID')
    pc.set_defaults(func=cmd_check)

    pb = sub.add_parser('begin', help='进入域名迁移（pending_verification）')
    pb.add_argument('--site', required=True)
    pb.add_argument('--base', required=True, metavar='URL')
    pb.add_argument('--host', action='append', metavar='HOST')
    pb.add_argument('--allowed-host', action='append', metavar='HOST')
    pb.add_argument('--display-name', metavar='NAME')
    pb.add_argument('--reason')
    pb.set_defaults(func=cmd_begin)

    pa = sub.add_parser('approve', help='人工批准迁移（healthy）')
    pa.add_argument('--site', required=True)
    pa.add_argument('--approved-by', required=True, metavar='NAME')
    pa.add_argument('--reason')
    pa.set_defaults(func=cmd_approve)

    pr = sub.add_parser('revert', help='撤销进行中迁移（恢复旧域名，置 disabled）')
    pr.add_argument('--site', required=True)
    pr.add_argument('--reason')
    pr.set_defaults(func=cmd_revert)

    pn = sub.add_parser('renew', help='人工签发 maintenance permit')
    pn.add_argument('--site', required=True)
    pn.add_argument('--issued-by', required=True, metavar='NAME')
    pn.add_argument('--ttl-hours', type=int, default=24)
    pn.add_argument('--ttl-days', type=int)
    pn.add_argument('--verification-method', metavar='METHOD',
                    help='manual 模式必填：人工核验方法（真实用户环境如何确认内容）')
    pn.add_argument('--verification-notes', metavar='NOTES',
                    help='manual 模式必填：人工核验说明')
    pn.add_argument('--attestation', action='append', metavar='KEY',
                    help='manual 模式必填（可重复）：人工确认项，全部 7 项必须齐全')
    pn.add_argument('--reason')
    pn.set_defaults(func=cmd_renew)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
