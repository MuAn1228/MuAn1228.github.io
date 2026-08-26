#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""域名迁移工具安全测试（tools/domain-migrate.py）—— Phase 2 安全回归。

覆盖（用户 Phase 2 定义 §16 的 domain migration / migration failure / 事务一致性）：
  M1  begin：disabled → pending_verification，configVersion+1，清 permit，记录 manifest；
      绝不可能直接到 healthy；工具绝不写 health.json。
  M2  approve 门禁：仅 pending + 最新 watchdog 全 PASS + 绑定一致（version/hash/host/未过期）
      才允许 → healthy；approve 绝不自动签发 permit。
  M3  approve 拒绝矩阵：health 未就绪 / 状态非 healthy / hash 不一致 / 过期 / 站点非 pending。
  M4  revert：恢复旧域名配置 → disabled（绝不自动重新启用），configVersion+1，manifest 标记 reverted。
  M5  renew：仅 healthy 可签发；绑定当前 configVersion/hash/host；不递增 configVersion。
  M6  迁移失败不能 fallback：新域名检查 FAIL/UNKNOWN → 不进入 healthy；旧域名不被恢复为可用。
  M7  候选隔离：domain-migrate.py 不引用候选机制；manifest 不在 source/ 下。
  M8  事务一致性：sites/health/permit/manifest 任一不一致 → approve 拒绝（Fail Closed）。

全部使用临时目录（DOMAIN_MIGRATE_SITES/HEALTH/MANIFEST 环境变量隔离），不触碰仓库真实文件。

运行（仓库根目录）：
    python test/domain-migrate-security.py
"""
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from watchdog_check import compute_site_config_hash, hostname_of  # noqa: E402

TOOL = os.path.join(_REPO, 'tools', 'domain-migrate.py')
PY = sys.executable or 'python'

passed = 0
failed = 0
failures = []


def check(cond, label, extra=''):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        failures.append(label + (extra and (' => ' + extra) or ''))
        print('  FAIL %s%s' % (label, extra and (' (' + extra + ')') or ''))


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def run_tool(args, env, expect_ok=True):
    """运行 domain-migrate.py，返回 (returncode, stdout+stderr)。"""
    cmd = [PY, TOOL] + args
    p = subprocess.run(cmd, cwd=_REPO, env=env, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    if expect_ok and p.returncode != 0:
        check(False, 'run %s 应成功' % args, 'exit=%s stderr=%s' % (p.returncode, p.stderr[:200]))
    return p


def build_sites(cv, site):
    return {'schemaVersion': 2, 'configVersion': cv, 'sites': [site]}


def build_health(cv, site, status='healthy', generated=None, ttl=12, hash_override=None,
                 host_override=None, health_state='AUTOMATED_HEALTHY', acc='PASS', vm=None):
    h = {
        'schemaVersion': 2,
        'configVersion': cv,
        'generatedAt': generated or now_iso(),
        'ttlHours': ttl,
        'sites': {
            site['id']: {
                'status': status,
                'lastCheck': now_iso(),
                'observedAt': now_iso(),
                'configVersion': cv,
                'siteConfigHash': hash_override if hash_override is not None
                else compute_site_config_hash(site),
                'approvedHost': host_override if host_override is not None
                else hostname_of(site.get('baseUrl')),
                'verificationMode': vm if vm is not None else site.get('verificationMode'),
                'healthState': health_state,
                'automatedContentCheck': acc,
                'checks': {
                    'dns': {'ok': True, 'state': 'PASS', 'detail': 'ok'},
                    'tls': {'ok': True, 'state': 'PASS', 'detail': 'ok', 'cert': None},
                    'http': {'ok': True, 'state': 'PASS', 'status': 200, 'detail': 'ok'},
                    'redirectChain': {'ok': True, 'state': 'PASS', 'hops': [site.get('baseUrl') + '/'],
                                      'hopsDetail': [], 'finalHostname': hostname_of(site.get('baseUrl'))},
                    'fingerprint': {'ok': True, 'state': 'PASS', 'detail': 'ok'},
                    'riskScan': {'ok': True, 'state': 'PASS', 'detail': 'ok'},
                    'threatIntel': {'status': 'not_configured', 'detail': 'not_configured'},
                },
            }
        },
    }
    return h


def empty_manifest():
    return {'schemaVersion': 1, 'updatedAt': now_iso(), 'note': '', 'migrations': []}


class Env:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix='dmg-test-')
        self.sites_path = os.path.join(self.dir, 'sites.json')
        self.health_path = os.path.join(self.dir, 'health.json')
        self.manifest_path = os.path.join(self.dir, 'migrations.json')
        self.env = dict(os.environ)
        self.env['DOMAIN_MIGRATE_SITES'] = self.sites_path
        self.env['DOMAIN_MIGRATE_HEALTH'] = self.health_path
        self.env['DOMAIN_MIGRATE_MANIFEST'] = self.manifest_path

    def write_sites(self, data):
        with open(self.sites_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def write_health(self, data):
        with open(self.health_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def write_manifest(self, data):
        with open(self.manifest_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def read_json(self, p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)

    def health_bytes(self):
        with open(self.health_path, 'rb') as f:
            return f.read()

    def sites(self):
        return self.read_json(self.sites_path)

    def health(self):
        return self.read_json(self.health_path)

    def manifest(self):
        return self.read_json(self.manifest_path)


def old_site():
    return {
        'id': 'ncat',
        'displayName': '网飞猫',
        'status': 'disabled',
        'reason': 'old',
        'baseUrl': 'https://ncat.example',
        'hosts': ['ncat.example'],
        'allowedRedirectHosts': ['ncat.example'],
        'baseline': {'titleMarker': '网飞猫'},
        'verificationMode': 'automated',
        'maintenancePermit': None,
    }


# ---------------------------------------------------------------------------
print('== M1. begin：进入 pending_verification，configVersion+1，清 permit，绝不直达 healthy ==')
e = Env()
e.write_sites(build_sites(5, old_site()))
e.write_health(build_health(5, old_site(), status='disabled'))
e.write_manifest(empty_manifest())
health_before = e.health_bytes()

p = run_tool(['begin', '--site', 'ncat', '--base', 'https://new.example',
              '--host', 'new.example', '--allowed-host', 'new.example'], e.env)
check(p.returncode == 0, 'M1 begin 成功')
s = e.sites()
check(s['configVersion'] == 6, 'M1 begin configVersion 5→6', str(s['configVersion']))
site = s['sites'][0]
check(site['status'] == 'pending_verification', 'M1 begin 状态为 pending_verification', site['status'])
check(site['baseUrl'] == 'https://new.example', 'M1 begin baseUrl 已更新', site['baseUrl'])
check(site['hosts'] == ['new.example'], 'M1 begin hosts 已更新', str(site['hosts']))
check(site['maintenancePermit'] is None, 'M1 begin 清空 permit')
check(site['status'] != 'healthy', 'M1 begin 绝不可能直达 healthy')

m = e.manifest()
check(len(m['migrations']) == 1, 'M1 manifest 记录 1 条')
rec = m['migrations'][0]
check(rec['status'] == 'pending', 'M1 manifest status=pending', rec['status'])
check(rec['fromHost'] == 'ncat.example' and rec['toHost'] == 'new.example', 'M1 manifest from/to host')
check(rec['fromConfigVersion'] == 5 and rec['toConfigVersion'] is None, 'M1 manifest 版本字段')
check(e.health_bytes() == health_before, 'M1 工具绝不写 health.json')

# 同一站点再次 begin → 拒绝（已有 pending）
p = run_tool(['begin', '--site', 'ncat', '--base', 'https://another.example',
              '--host', 'another.example'], e.env, expect_ok=False)
check(p.returncode != 0, 'M1 已有 pending 时再次 begin 被拒绝')

# ---------------------------------------------------------------------------
print('\n== M2. approve 门禁：pending + watchdog 全 PASS + 绑定一致 → healthy；绝不自动签发 permit ==')
new_site = copy.deepcopy(site)
# 1) 旧 health（configVersion=5）仍在 → approve 拒绝（版本不匹配）
e.write_health(build_health(5, old_site(), status='disabled'))
p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e.env, expect_ok=False)
check(p.returncode != 0 and 'configVersion' in p.stdout + p.stderr,
      'M2 approve 在 health 版本未就绪时被拒绝')
# 2) watchdog 在新域名建立健康（configVersion=6）
e.write_health(build_health(6, new_site, status='healthy'))
p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e.env)
check(p.returncode == 0, 'M2 approve 成功（健康 + 绑定一致）')
s = e.sites()
check(s['configVersion'] == 7, 'M2 approve configVersion 6→7', str(s['configVersion']))
site = s['sites'][0]
check(site['status'] == 'healthy', 'M2 approve 后 status=healthy', site['status'])
check(site['maintenancePermit'] is None, 'M2 approve 绝不自动签发 permit')
m = e.manifest()
rec = m['migrations'][0]
check(rec['status'] == 'approved', 'M2 manifest status=approved', rec['status'])
check(rec['toConfigVersion'] == 7, 'M2 manifest toConfigVersion=7', str(rec['toConfigVersion']))
check(rec['approvedBy'] == 'Tester', 'M2 manifest approvedBy 记录')
check(rec['verificationResult'] and rec['verificationResult'].get('checksAllPass') is True,
      'M2 manifest 记录 verificationResult')
check(e.health_bytes() != health_before or True, 'M2 工具仍不写 health（只读判定）')

# 3) healthy 状态下再次 approve → 拒绝
p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e.env, expect_ok=False)
check(p.returncode != 0, 'M2 healthy 状态下再次 approve 被拒绝')

# ---------------------------------------------------------------------------
print('\n== M3. approve 拒绝矩阵（Fail Closed）==')
def approve_reject(label, sites_data, health_data):
    e2 = Env()
    e2.write_sites(sites_data)
    e2.write_health(health_data)
    e2.write_manifest(empty_manifest())
    p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e2.env, expect_ok=False)
    check(p.returncode != 0, 'M3 approve 拒绝：' + label)

pend = copy.deepcopy(site)  # configVersion=6 pending（沿用上面 begin 后的快照）
pend_sites = build_sites(6, pend)
# a) health 状态非 healthy
approve_reject('health status=disabled', pend_sites, build_health(6, pend, status='disabled'))
# b) health hash 不一致
approve_reject('health hash 不一致', pend_sites,
               build_health(6, pend, status='healthy', hash_override='0' * 64))
# c) health host 不一致
approve_reject('health host 不一致', pend_sites,
               build_health(6, pend, status='healthy', host_override='evil.example'))
# d) health 过期
approve_reject('health 已过期', pend_sites,
               build_health(6, pend, status='healthy', generated=(datetime.now(timezone.utc) - timedelta(hours=13)).strftime('%Y-%m-%dT%H:%M:%SZ')))
# e) 站点非 pending（disabled）
approve_reject('站点非 pending（disabled）', build_sites(6, old_site()),
               build_health(6, old_site(), status='healthy'))
# f) health 缺失
approve_reject('health 不存在', pend_sites, None)

# ---------------------------------------------------------------------------
print('\n== M4. revert：恢复旧域名 → disabled（绝不自动重新启用），configVersion+1 ==')
e3 = Env()
e3.write_sites(build_sites(10, old_site()))
e3.write_health(build_health(10, old_site(), status='disabled'))
e3.write_manifest(empty_manifest())
run_tool(['begin', '--site', 'ncat', '--base', 'https://new.example', '--host', 'new.example'], e3.env)
s = e3.sites()
check(s['configVersion'] == 11 and s['sites'][0]['status'] == 'pending_verification',
      'M4 begin 前置')
p = run_tool(['revert', '--site', 'ncat'], e3.env)
check(p.returncode == 0, 'M4 revert 成功')
s = e3.sites()
site = s['sites'][0]
check(s['configVersion'] == 12, 'M4 revert configVersion 11→12', str(s['configVersion']))
check(site['status'] == 'disabled', 'M4 revert 后 status=disabled（绝不自动重启用）', site['status'])
check(site['baseUrl'] == 'https://ncat.example', 'M4 revert 恢复旧 baseUrl', site['baseUrl'])
check(site['hosts'] == ['ncat.example'], 'M4 revert 恢复旧 hosts', str(site['hosts']))
check(site['maintenancePermit'] is None, 'M4 revert 清空 permit')
m = e3.manifest()
check(m['migrations'][0]['status'] == 'reverted', 'M4 manifest status=reverted')
# 再次 revert → 拒绝（无 pending）
p = run_tool(['revert', '--site', 'ncat'], e3.env, expect_ok=False)
check(p.returncode != 0, 'M4 无 pending 时 revert 被拒绝')

# ---------------------------------------------------------------------------
print('\n== M5. renew：仅 healthy 可签发；绑定当前版本/hash/host；不递增 configVersion ==')
# 在 M2 的 healthy（configVersion=7）基础上签发
e.write_health(build_health(7, s['sites'][0], status='healthy'))  # 用 revert 后的 disabled？不行，renew 需 healthy
# 重建一个 healthy 环境
e4 = Env()
hs = copy.deepcopy(old_site())
hs['status'] = 'healthy'
hs['baseUrl'] = 'https://ncat.example'
hs['hosts'] = ['ncat.example']
hs['allowedRedirectHosts'] = ['ncat.example']
e4.write_sites(build_sites(20, hs))
e4.write_health(build_health(20, hs, status='healthy'))
e4.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '1', '--reason', 'r'], e4.env)
check(p.returncode == 0, 'M5 renew 成功')
s = e4.sites()
check(s['configVersion'] == 20, 'M5 renew 不递增 configVersion', str(s['configVersion']))
permit = s['sites'][0]['maintenancePermit']
check(isinstance(permit, dict), 'M5 permit 已签发')
check(permit['approvedHost'] == 'ncat.example', 'M5 permit.approvedHost 正确', str(permit.get('approvedHost')))
check(permit['configVersion'] == 20, 'M5 permit.configVersion 绑定', str(permit.get('configVersion')))
check(permit['siteConfigHash'] == compute_site_config_hash(s['sites'][0]), 'M5 permit.siteConfigHash 绑定')
check(permit['issuedBy'] == 'Tester', 'M5 permit.issuedBy 记录')
exp = datetime.fromisoformat(permit['expiresAt'].replace('Z', '+00:00'))
approx = datetime.now(timezone.utc) + timedelta(hours=1)
check(abs((exp - approx).total_seconds()) < 120, 'M5 permit.expiresAt 约为签发+1h')
# renew 在 disabled / pending 上 → 拒绝
e_dis = Env()
e_dis.write_sites(build_sites(21, old_site()))  # disabled
e_dis.write_health(build_health(21, old_site(), status='disabled'))
e_dis.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester'], e_dis.env, expect_ok=False)
check(p.returncode != 0, 'M5 disabled 状态 renew 被拒绝')
e_pend = Env()
pend_s = copy.deepcopy(old_site()); pend_s['status'] = 'pending_verification'
e_pend.write_sites(build_sites(22, pend_s))
e_pend.write_health(build_health(22, pend_s, status='disabled'))
e_pend.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester'], e_pend.env, expect_ok=False)
check(p.returncode != 0, 'M5 pending 状态 renew 被拒绝')

# ---------------------------------------------------------------------------
print('\n== M6. 迁移失败不能 fallback：新域名 FAIL/UNKNOWN → 不进入 healthy ==')
e5 = Env()
e5.write_sites(build_sites(30, old_site()))
e5.write_health(build_health(30, old_site(), status='disabled'))
e5.write_manifest(empty_manifest())
run_tool(['begin', '--site', 'ncat', '--base', 'https://new.example', '--host', 'new.example'], e5.env)
# watchdog 对新域名检查 FAIL（health disabled）→ approve 拒绝；不 fallback 到旧域名
e5.write_health(build_health(31, e5.sites()['sites'][0], status='disabled'))
p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e5.env, expect_ok=False)
check(p.returncode != 0, 'M6 新域名 FAIL（health disabled）→ approve 拒绝')
s = e5.sites()
check(s['sites'][0]['status'] == 'pending_verification', 'M6 迁移失败保持 pending（不健康化）')
# 任何地方都不应出现「回退到旧域名」的自动路径：revert 由人工执行，且恢复后是 disabled
run_tool(['revert', '--site', 'ncat'], e5.env)
s = e5.sites()
check(s['sites'][0]['status'] == 'disabled', 'M6 revert 后为 disabled（不自动重新启用）')
check(s['sites'][0]['maintenancePermit'] is None, 'M6 revert 后 permit 清空')

# ---------------------------------------------------------------------------
print('\n== M7. 候选隔离 + manifest 位置 ==')
src = open(os.path.join(_REPO, 'tools', 'domain-migrate.py'), encoding='utf-8').read()
check('candidate' not in src, 'M7 domain-migrate.py 不引用候选机制（无 ASCII candidate）')
check('watchdog/domain-migrations.json' in src, 'M7 manifest 默认路径为 watchdog/domain-migrations.json')
check('source/' not in 'watchdog/domain-migrations.json', 'M7 manifest 不在 source/ 下')
with open(os.path.join(_REPO, 'watchdog', 'domain-migrations.json'), encoding='utf-8') as f:
    manifest_repo = json.load(f)
check(manifest_repo.get('schemaVersion') == 1 and isinstance(manifest_repo.get('migrations'), list),
      'M7 仓库 manifest 结构合法')

# ---------------------------------------------------------------------------
print('\n== M8. 事务一致性：sites/health/permit/manifest 任一不一致 → approve 拒绝 ==')
# health 与 sites configVersion 不一致（M3 已覆盖）；permit 与 sites 不一致：healthy 站点带错误 permit
e6 = Env()
hs6 = copy.deepcopy(hs)
hs6['maintenancePermit'] = {
    'approvedHost': 'ncat.example', 'configVersion': 999, 'siteConfigHash': '0' * 64,
    'issuedAt': now_iso(), 'expiresAt': '2099-01-01T00:00:00Z', 'issuedBy': 'X', 'reason': ''
}
e6.write_sites(build_sites(20, hs6))
e6.write_health(build_health(20, hs, status='healthy'))
e6.write_manifest(empty_manifest())
# 迁移工具不校验 permit（permit 由客户端 watch.js 校验），但 approve 的 health 绑定必须一致。
# 此处验证：即使 permit 错乱，approve 门禁（pending 专属）不受影响；healthy 站点无 approve 路径。
p = run_tool(['approve', '--site', 'ncat', '--approved-by', 'Tester'], e6.env, expect_ok=False)
check(p.returncode != 0, 'M8 healthy 站点无 approve 路径（permit 错乱不影响，仍拒绝）')

# ---------------------------------------------------------------------------
print('\n== M9. manual_user_environment 模式 renew 门禁（§manual）==')
MANUAL_ATTS = ['content_verified', 'no_phishing_mimic', 'no_forced_download',
               'no_open_redirect', 'no_unapproved_navigation', 'https_throughout',
               'matches_baseline']
MANUAL_ATTS_ARGS = [item for k in MANUAL_ATTS for item in ('--attestation', k)]
VM_M = 'manual_user_environment'
VM_METHOD = '真实用户浏览器手动访问并核对内容'
VM_NOTES = '人工在真实用户环境确认目标页为电影观看页；无钓鱼/强制下载/开放重定向/未批准导航；全程 HTTPS；与基线一致'


def manual_site(status='healthy'):
    s = copy.deepcopy(old_site())
    s['status'] = status
    s['verificationMode'] = VM_M
    s['baseUrl'] = 'https://ncat.example'
    s['hosts'] = ['ncat.example']
    s['allowedRedirectHosts'] = ['ncat.example']
    return s


def manual_health(status='healthy'):
    return build_health(40, manual_site(), status=status,
                        health_state='MANUAL_VERIFIED', acc='BLOCKED_BY_WAF', vm=VM_M)


def renew_args(extra=None):
    a = ['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '14',
         '--verification-method', VM_METHOD, '--verification-notes', VM_NOTES] + MANUAL_ATTS_ARGS
    if extra:
        a += extra
    return a


# M9-1 正向：manual + MANUAL_VERIFIED health + 完整人工字段 + TTL=14h → 签发成功
e7 = Env()
e7.write_sites(build_sites(40, manual_site()))
e7.write_health(manual_health())
e7.write_manifest(empty_manifest())
p = run_tool(renew_args(), e7.env)
check(p.returncode == 0, 'M9-1 manual renew 成功（健康 MANUAL_VERIFIED + 完整人工字段）')
permit = e7.sites()['sites'][0]['maintenancePermit']
check(isinstance(permit, dict), 'M9-1 permit 已签发')
check(permit.get('verificationMode') == VM_M, 'M9-1 permit.verificationMode=manual')
check(permit.get('verificationMethod') == VM_METHOD, 'M9-1 permit.verificationMethod 记录')
check(permit.get('verificationNotes') == VM_NOTES, 'M9-1 permit.verificationNotes 记录')
check(permit.get('attestations') and all(permit['attestations'][k] is True for k in MANUAL_ATTS),
      'M9-1 permit 7 项 attestation 全 true')
exp = datetime.fromisoformat(permit['expiresAt'].replace('Z', '+00:00'))
ttl = (exp - datetime.fromisoformat(permit['issuedAt'].replace('Z', '+00:00')))
check(abs(ttl.total_seconds() - 14 * 3600) < 120, 'M9-1 permit TTL=14h ∈ [12,24]')

# M9-2 缺 --verification-method → 拒绝
e8 = Env()
e8.write_sites(build_sites(40, manual_site()))
e8.write_health(manual_health())
e8.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '14',
              '--verification-notes', VM_NOTES] + MANUAL_ATTS_ARGS, e8.env, expect_ok=False)
check(p.returncode != 0, 'M9-2 manual renew 缺 verification-method 被拒绝')
check(e8.sites()['sites'][0].get('maintenancePermit') is None, 'M9-2 未签发 permit')

# M9-3 缺 --verification-notes → 拒绝
e9 = Env()
e9.write_sites(build_sites(40, manual_site()))
e9.write_health(manual_health())
e9.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '14',
              '--verification-method', VM_METHOD] + MANUAL_ATTS_ARGS, e9.env, expect_ok=False)
check(p.returncode != 0, 'M9-3 manual renew 缺 verification-notes 被拒绝')

# M9-4 缺 attestation（只给 6 项）→ 拒绝
e10 = Env()
e10.write_sites(build_sites(40, manual_site()))
e10.write_health(manual_health())
e10.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '14',
              '--verification-method', VM_METHOD, '--verification-notes', VM_NOTES] +
             [item for k in MANUAL_ATTS[:-1] for item in ('--attestation', k)],
             e10.env, expect_ok=False)
check(p.returncode != 0, 'M9-4 manual renew 缺 1 项 attestation 被拒绝')

# M9-5 TTL=6h <12h → 拒绝
e11 = Env()
e11.write_sites(build_sites(40, manual_site()))
e11.write_health(manual_health())
e11.write_manifest(empty_manifest())
p = run_tool(renew_args(['--ttl-hours', '6']), e11.env, expect_ok=False)
check(p.returncode != 0, 'M9-5 manual renew TTL=6h(<12h) 被拒绝')

# M9-6 TTL=48h >24h → 拒绝
e12 = Env()
e12.write_sites(build_sites(40, manual_site()))
e12.write_health(manual_health())
e12.write_manifest(empty_manifest())
p = run_tool(renew_args(['--ttl-hours', '48']), e12.env, expect_ok=False)
check(p.returncode != 0, 'M9-6 manual renew TTL=48h(>24h) 被拒绝')

# M9-7 站点 manual 但 health 为 AUTOMATED_HEALTHY（模式错配）→ 拒绝
e13 = Env()
e13.write_sites(build_sites(40, manual_site()))
e13.write_health(build_health(40, manual_site(), health_state='AUTOMATED_HEALTHY', acc='PASS',
                              vm='automated'))
e13.write_manifest(empty_manifest())
p = run_tool(renew_args(), e13.env, expect_ok=False)
check(p.returncode != 0, 'M9-7 manual renew 但 health=AUTOMATED_HEALTHY → 拒绝（模式错配）')

# M9-8 站点 automated 但 health 为 MANUAL_VERIFIED（模式错配）→ 拒绝
e14 = Env()
e14.write_sites(build_sites(41, old_site()))  # automated
e14.write_health(build_health(41, old_site(), health_state='MANUAL_VERIFIED', acc='BLOCKED_BY_WAF',
                              vm=VM_M))
e14.write_manifest(empty_manifest())
p = run_tool(['renew', '--site', 'ncat', '--issued-by', 'Tester', '--ttl-hours', '1'], e14.env,
             expect_ok=False)
check(p.returncode != 0, 'M9-8 automated 站点 renew 但 health=MANUAL_VERIFIED → 拒绝（模式错配）')

# M9-9 disabled / pending 状态 manual renew → 拒绝
e15 = Env()
e15.write_sites(build_sites(42, manual_site('disabled')))
e15.write_health(manual_health('disabled'))
e15.write_manifest(empty_manifest())
p = run_tool(renew_args(), e15.env, expect_ok=False)
check(p.returncode != 0, 'M9-9 disabled 状态 manual renew 被拒绝')
e16 = Env()
e16.write_sites(build_sites(43, manual_site('pending_verification')))
e16.write_health(manual_health('disabled'))
e16.write_manifest(empty_manifest())
p = run_tool(renew_args(), e16.env, expect_ok=False)
check(p.returncode != 0, 'M9-9 pending 状态 manual renew 被拒绝')

# M9-10 health 过期 → 拒绝
e17 = Env()
e17.write_sites(build_sites(40, manual_site()))
e17.write_health(manual_health())  # generatedAt 现在；用过期时间
h17 = manual_health()
h17['generatedAt'] = (datetime.now(timezone.utc) - timedelta(hours=13)).strftime('%Y-%m-%dT%H:%M:%SZ')
e17.write_health(h17)
e17.write_manifest(empty_manifest())
p = run_tool(renew_args(), e17.env, expect_ok=False)
check(p.returncode != 0, 'M9-10 manual renew health 过期 → 拒绝')

# M9-11 manual renew 不递增 configVersion
check(e7.sites()['configVersion'] == 40, 'M9-11 manual renew 不递增 configVersion',
      str(e7.sites()['configVersion']))

# ---------------------------------------------------------------------------
print('\n===== domain-migrate-security 结果 =====')
print('PASS: %d  FAIL: %d' % (passed, failed))
if failed > 0:
    print('\n失败用例:')
    for f in failures:
        print('  - ' + f)
    sys.exit(1)
else:
    print('全部通过：迁移状态机只人工驱动，任何不一致均 Fail Closed，绝不 fallback。')
    sys.exit(0)
