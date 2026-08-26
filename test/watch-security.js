/* ===== 电影观看外链安全测试 v2（DENY 用例矩阵，Phase 2）=====
 *
 * 验收标准：任何安全条件不满足 → 不跳转（Fail Closed）。v2 新增：
 *   - sites.json schemaVersion=2 + configVersion（全局配置版本）
 *   - Maintenance Permit（人工签发的限时维护许可，必要安全条件）
 *   - health.json 与 sites 的绑定：configVersion / siteConfigHash / approvedHost
 *   - 域名迁移生命周期（old → begin pending → 新 watchdog → approve healthy → new permit → allow）
 *   - 迁移失败不能 fallback 到旧域名 / candidate
 * 覆盖用户 Phase 2 §16 的 2~11 项（哈希跨语言见 hash-crosscheck.js）。
 *
 * 运行：
 *   node test/watch-security.js
 */
'use strict';

const path = require('path');
const WatchGate = require(path.join(__dirname, '..', 'source', 'js', 'watch.js'));

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label, extra) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label + (extra ? ' => ' + extra : ''));
    console.log('  FAIL ' + label + (extra ? ' (' + extra + ')' : ''));
  }
}

/* ---------- 固定夹具（v2） ---------- */
const NOW = Date.now();
function iso(ts) { return new Date(ts).toISOString(); }

const CONFIG_VERSION = 7;
const SITE_BASE = {
  id: 'ncat',
  displayName: '网飞猫',
  status: 'healthy',
  baseUrl: 'https://ncat.example',
  hosts: ['ncat.example'],
  allowedRedirectHosts: ['ncat.example'],
  baseline: { titleMarker: '网飞猫' },
  verificationMode: 'automated'
};
const SITE_HASH = WatchGate.computeSiteConfigHash(SITE_BASE);

function makePermit(overrides) {
  const p = {
    approvedHost: 'ncat.example',
    configVersion: CONFIG_VERSION,
    siteConfigHash: SITE_HASH,
    verificationMode: 'automated',
    issuedAt: iso(NOW - 3600000),
    expiresAt: iso(NOW + 24 * 3600000),
    issuedBy: 'MuAn',
    reason: 'test'
  };
  if (overrides) Object.assign(p, overrides);
  return p;
}

const SITE = Object.assign({}, SITE_BASE, { maintenancePermit: makePermit() });

function makeSites(site, cv) {
  return { schemaVersion: 2, configVersion: cv || CONFIG_VERSION, sites: [site || SITE] };
}

function makeHealth(overrides) {
  overrides = overrides || {};
  const cv = overrides.configVersion !== undefined ? overrides.configVersion : CONFIG_VERSION;
  const hash = overrides.hash !== undefined ? overrides.hash : SITE_HASH;
  const host = overrides.host !== undefined ? overrides.host : 'ncat.example';
  const h = {
    schemaVersion: 2,
    configVersion: cv,
    generatedAt: iso(NOW),
    ttlHours: 12,
    sites: {
      ncat: {
        status: 'healthy',
        lastCheck: iso(NOW),
        configVersion: cv,
        siteConfigHash: hash,
        approvedHost: host,
        verificationMode: 'automated',
        healthState: 'AUTOMATED_HEALTHY',
        automatedContentCheck: 'PASS',
        checks: {
          dns: { ok: true, detail: 'ok' },
          tls: { ok: true, detail: 'ok' },
          http: { ok: true, status: 200, detail: 'ok' },
          redirectChain: { ok: true, hops: ['https://' + host + '/'], detail: 'ok' },
          fingerprint: { ok: true, detail: 'ok' },
          riskScan: { ok: true, detail: 'ok' },
          threatIntel: { status: 'not_configured', detail: 'v2 未接入' }
        }
      }
    }
  };
  if (overrides.sites !== undefined) h.sites.ncat.status = overrides.sites;
  if (overrides.checks) Object.assign(h.sites.ncat.checks, overrides.checks);
  if (overrides.schemaVersion !== undefined) h.schemaVersion = overrides.schemaVersion;
  if (overrides.generatedAt !== undefined) h.generatedAt = overrides.generatedAt;
  if (overrides.ttlHours !== undefined) h.ttlHours = overrides.ttlHours;
  if (overrides.sitesMap !== undefined) h.sites = overrides.sitesMap;
  if (overrides.record !== undefined) h.sites.ncat = overrides.record;
  if (overrides.vm !== undefined) h.sites.ncat.verificationMode = overrides.vm;
  if (overrides.healthState !== undefined) h.sites.ncat.healthState = overrides.healthState;
  if (overrides.acc !== undefined) h.sites.ncat.automatedContentCheck = overrides.acc;
  return h;
}

const MOVIE = { id: 'babai', name: '八佰', sub: '2020', watch: { site: 'ncat', path: '/movie/babai' } };

function expectDeny(label, movie, sites, health, opts) {
  const v = WatchGate.evaluateWatch(movie, sites, health, opts || { now: NOW });
  assert(v.ok === false, label, 'expected DENY got ok=' + v.ok + ' reason=' + v.reason);
  return v;
}
function expectOk(label, movie, sites, health, opts) {
  const v = WatchGate.evaluateWatch(movie, sites, health, opts || { now: NOW });
  assert(v.ok === true, label, 'expected OK got reason=' + (v.reason || '?'));
  return v;
}

/* ==================== 1. 正向基线：全部条件（含 valid permit）满足 → 允许 ==================== */
(function () {
  const v = expectOk('POSITIVE: 全部检查通过 + valid permit 允许', MOVIE, makeSites(), makeHealth());
  assert(v.url === 'https://ncat.example/movie/babai', 'POSITIVE: URL 正确', v.url);
  assert(v.host === 'ncat.example', 'POSITIVE: host 正确', v.host);
  // movie 映射缺失时即使其它全通过也要 DENY
  const noWatch = JSON.parse(JSON.stringify(MOVIE)); delete noWatch.watch;
  expectDeny('DENY: 无 watch 映射', noWatch, makeSites(), makeHealth());
})();

/* ==================== 2. Open Redirect / URL Parser Bypass ==================== */
(function () {
  const badPaths = {
    '绝对外链': 'https://evil.com/phish',
    '协议相对': '//evil.com/phish',
    '双斜杠': '/movie//evil.com',
    '反斜杠': '/movie/\\evil.com',
    '路径穿越': '/movie/../evil',
    '问号注入': '/movie/babai?next=https://evil.com',
    '哈希注入': '/movie/babai#evil',
    '冒号协议': '/movie/babai:evil',
    'javascript': 'javascript:alert(1)',
    'data 协议': 'data:text/html,<script>',
    '非 ASCII': '/movie/动画',
    '无前导斜杠': 'movie/babai',
    '空路径': '',
    'userinfo 注入': '/movie/babai@evil.com'
  };
  for (const [label, p] of Object.entries(badPaths)) {
    const m = JSON.parse(JSON.stringify(MOVIE));
    m.watch.path = p;
    expectDeny('DENY: path=' + label, m, makeSites(), makeHealth());
  }
  const m2 = JSON.parse(JSON.stringify(MOVIE)); m2.watch.path = 123;
  expectDeny('DENY: path 非字符串', m2, makeSites(), makeHealth());
  const m3 = JSON.parse(JSON.stringify(MOVIE)); m3.watch.path = '/movie/%2e%2e/evil';
  expectDeny('DENY: 百分号编码路径', m3, makeSites(), makeHealth());
})();

/* ==================== 3. sites.json v2 / site 层 ==================== */
(function () {
  // schemaVersion 必须是 2（v1 旧格式 → DENY）
  expectDeny('DENY: sites schemaVersion=1（旧格式）', MOVIE, { schemaVersion: 1, configVersion: CONFIG_VERSION, sites: [SITE] }, makeHealth());
  expectDeny('DENY: sites schemaVersion 缺失', MOVIE, { configVersion: CONFIG_VERSION, sites: [SITE] }, makeHealth());
  // configVersion 必须为正整数
  expectDeny('DENY: sites configVersion 缺失', MOVIE, { schemaVersion: 2, sites: [SITE] }, makeHealth());
  expectDeny('DENY: sites configVersion=0', MOVIE, { schemaVersion: 2, configVersion: 0, sites: [SITE] }, makeHealth());
  expectDeny('DENY: sites configVersion 非整数', MOVIE, { schemaVersion: 2, configVersion: '7', sites: [SITE] }, makeHealth());
  // 站点状态：disabled / pending_verification → 一律 DENY（§3 状态机）
  const sd = JSON.parse(JSON.stringify(SITE)); sd.status = 'disabled';
  expectDeny('DENY: site status=disabled', MOVIE, makeSites(sd), makeHealth());
  const sp = JSON.parse(JSON.stringify(SITE)); sp.status = 'pending_verification';
  const v = expectDeny('DENY: site status=pending_verification', MOVIE, makeSites(sp), makeHealth());
  assert(v.reason === 'site_pending_verification', 'DENY: pending 专用 reason', v.reason);
  // site 不在白名单 / 其它异常
  const s_other = JSON.parse(JSON.stringify(SITE)); s_other.id = 'other';
  expectDeny('DENY: site 不在 allowlist', MOVIE, makeSites(s_other), makeHealth());
  // baseUrl 层 bypass
  const s1 = JSON.parse(JSON.stringify(SITE)); s1.baseUrl = 'https://user:pass@ncat.example';
  expectDeny('DENY: baseUrl 含 userinfo', MOVIE, makeSites(s1), makeHealth());
  const s2 = JSON.parse(JSON.stringify(SITE)); s2.baseUrl = 'http://ncat.example';
  expectDeny('DENY: baseUrl 非 https', MOVIE, makeSites(s2), makeHealth());
  const s3 = JSON.parse(JSON.stringify(SITE)); s3.baseUrl = 'https://ncat.example/?x=1';
  expectDeny('DENY: baseUrl 含 query', MOVIE, makeSites(s3), makeHealth());
  const s4 = JSON.parse(JSON.stringify(SITE)); s4.hosts = ['xn--evil.example']; s4.allowedRedirectHosts = ['xn--evil.example'];
  expectDeny('DENY: baseUrl host 不在白名单', MOVIE, makeSites(s4), makeHealth());
})();

/* ==================== 4. Maintenance Permit 矩阵（§9 有效条件，任一失败 → DENY） ==================== */
(function () {
  // permit missing
  const s_missing = JSON.parse(JSON.stringify(SITE)); delete s_missing.maintenancePermit;
  const v1 = expectDeny('DENY: permit 缺失', MOVIE, makeSites(s_missing), makeHealth());
  assert(v1.reason === 'permit_missing', 'DENY: permit_missing reason', v1.reason);
  // permit expired（过期 → §15「今日安全维护尚未完成」）
  const s_exp = JSON.parse(JSON.stringify(SITE));
  s_exp.maintenancePermit = makePermit({ expiresAt: iso(NOW - 1000) });
  const v2 = expectDeny('DENY: permit 过期', MOVIE, makeSites(s_exp), makeHealth());
  assert(v2.reason === 'permit_expired', 'DENY: permit_expired reason', v2.reason);
  // permit host mismatch（§6）
  const s_host = JSON.parse(JSON.stringify(SITE));
  s_host.maintenancePermit = makePermit({ approvedHost: 'evil.example' });
  const v3 = expectDeny('DENY: permit approvedHost 不匹配', MOVIE, makeSites(s_host), makeHealth());
  assert(v3.reason === 'permit_host_mismatch', 'DENY: permit_host_mismatch reason', v3.reason);
  // permit version mismatch（§7）
  const s_ver = JSON.parse(JSON.stringify(SITE));
  s_ver.maintenancePermit = makePermit({ configVersion: CONFIG_VERSION - 1 });
  const v4 = expectDeny('DENY: permit configVersion 不匹配', MOVIE, makeSites(s_ver), makeHealth());
  assert(v4.reason === 'permit_config_version_mismatch', 'DENY: permit_config_version_mismatch reason', v4.reason);
  // permit hash mismatch（§8）
  const s_hash = JSON.parse(JSON.stringify(SITE));
  s_hash.maintenancePermit = makePermit({ siteConfigHash: '0'.repeat(64) });
  const v5 = expectDeny('DENY: permit siteConfigHash 不匹配', MOVIE, makeSites(s_hash), makeHealth());
  assert(v5.reason === 'permit_hash_mismatch', 'DENY: permit_hash_mismatch reason', v5.reason);
  // permit invalid expiry / missing expiresAt（§10 时间安全）
  const s_inv1 = JSON.parse(JSON.stringify(SITE));
  s_inv1.maintenancePermit = makePermit({ expiresAt: 'not-a-date' });
  const v6 = expectDeny('DENY: permit expiresAt 非法', MOVIE, makeSites(s_inv1), makeHealth());
  assert(v6.ok === false, 'DENY: 非法 expiresAt → DENY', v6.reason);
  const s_inv2 = JSON.parse(JSON.stringify(SITE));
  delete s_inv2.maintenancePermit.expiresAt;
  expectDeny('DENY: permit expiresAt 缺失', MOVIE, makeSites(s_inv2), makeHealth());
  const s_inv3 = JSON.parse(JSON.stringify(SITE));
  s_inv3.maintenancePermit = makePermit({ expiresAt: '2099-01-01T00:00:00+08:00' }); // 时区偏移（非 Z）
  // 时区偏移是合法 ISO 8601（可解析），此处验证带偏移的时间仍按绝对时刻比较
  const v7 = WatchGate.evaluateWatch(MOVIE, makeSites(s_inv3), makeHealth(), { now: NOW });
  assert(v7.ok === true, 'OK: permit 带时区偏移且未过期 → 允许（绝对时刻比较）', v7.reason);
})();

/* ==================== 5. health.json v2 Fail Closed + 绑定校验（§6） ==================== */
(function () {
  // 绑定：configVersion 不一致 → DENY（§5）
  const v1 = expectDeny('DENY: health.configVersion != sites.configVersion',
    MOVIE, makeSites(), makeHealth({ configVersion: CONFIG_VERSION - 1 }));
  assert(v1.reason === 'config_version_mismatch', 'DENY: config_version_mismatch', v1.reason);
  // 绑定：siteConfigHash 不一致 → DENY（§16.3）
  const v2 = expectDeny('DENY: health.siteConfigHash != 当前配置哈希',
    MOVIE, makeSites(), makeHealth({ hash: '0'.repeat(64) }));
  assert(v2.reason === 'site_config_hash_mismatch', 'DENY: site_config_hash_mismatch', v2.reason);
  // 绑定：approvedHost 不一致 → DENY（§16.4）
  const v3 = expectDeny('DENY: health.approvedHost != 当前 approved host',
    MOVIE, makeSites(), makeHealth({ host: 'evil.example' }));
  assert(v3.reason === 'health_host_mismatch', 'DENY: health_host_mismatch', v3.reason);
  // 绑定字段缺失 → 视为数据损坏 → DENY
  const rec_missing = makeHealth().sites.ncat; delete rec_missing.siteConfigHash;
  expectDeny('DENY: health 记录缺 siteConfigHash', MOVIE, makeSites(), makeHealth({ record: rec_missing }));
  // health schema 必须是 2
  expectDeny('DENY: health schemaVersion=1（旧格式）', MOVIE, makeSites(), makeHealth({ schemaVersion: 1 }));
  // 其它 Fail Closed
  expectDeny('DENY: health 不存在', MOVIE, makeSites(), null);
  expectDeny('DENY: health 非对象', MOVIE, makeSites(), 'garbage');
  expectDeny('DENY: generatedAt 非法', MOVIE, makeSites(), makeHealth({ generatedAt: 'not-a-date' }));
  expectDeny('DENY: ttl 非法', MOVIE, makeSites(), makeHealth({ ttlHours: 0 }));
  expectDeny('DENY: health 过期', MOVIE, makeSites(), makeHealth({ generatedAt: iso(NOW - 13 * 3600000) }));
  expectDeny('DENY: sites 映射缺失', MOVIE, makeSites(), makeHealth({ sitesMap: {} }));
  for (const st of ['disabled', 'suspicious', 'unknown', 'error']) {
    expectDeny('DENY: health status=' + st, MOVIE, makeSites(), makeHealth({ sites: st }));
  }
  const checksList = ['dns', 'tls', 'http', 'redirectChain', 'fingerprint', 'riskScan'];
  for (const c of checksList) {
    const h = makeHealth();
    delete h.sites.ncat.checks[c];
    expectDeny('DENY: 缺检查项 ' + c, MOVIE, makeSites(), h);
    const h2 = makeHealth({ checks: { [c]: { ok: false, detail: 'fail' } } });
    expectDeny('DENY: 检查项 ' + c + ' ok=false', MOVIE, makeSites(), h2);
  }
})();

/* ==================== 5b. redirect chain 逐跳验证 ==================== */
(function () {
  expectDeny('DENY: redirectChain ok=false', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: false, hops: ['https://ncat.example/'], detail: 'x' } } }));
  expectDeny('DENY: hops 为空', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: true, hops: [], detail: 'x' } } }));
  expectDeny('DENY: hop 未知 host（候选域名也不允许）', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: true, hops: ['https://ncat.example/', 'https://candidate.example/'], detail: 'x' } } }));
  expectDeny('DENY: hop 非 https', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: true, hops: ['http://ncat.example/'], detail: 'x' } } }));
  expectDeny('DENY: hop 含 userinfo', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: true, hops: ['https://evil@ncat.example/'], detail: 'x' } } }));
})();

/* ==================== 6. Threat Intelligence 不得伪装安全证明 ==================== */
(function () {
  for (const st of ['malicious', 'suspicious', 'unknown', 'timeout', 'unavailable', 'rate_limited']) {
    expectDeny('DENY: threatIntel=' + st, MOVIE, makeSites(),
      makeHealth({ checks: { threatIntel: { status: st, detail: 'x' } } }));
  }
  expectDeny('DENY: threatIntel 缺失', MOVIE, makeSites(), makeHealth({ checks: { threatIntel: null } }));
  expectOk('OK: threatIntel=not_configured 放行', MOVIE, makeSites(),
    makeHealth({ checks: { threatIntel: { status: 'not_configured', detail: 'x' } } }));
  expectOk('OK: threatIntel=safe 放行', MOVIE, makeSites(),
    makeHealth({ checks: { threatIntel: { status: 'safe', detail: 'x' } } }));
})();

/* ==================== 7. movie / watch 映射 ==================== */
(function () {
  const m1 = JSON.parse(JSON.stringify(MOVIE)); m1.id = '';
  expectDeny('DENY: movie id 为空', m1, makeSites(), makeHealth());
  const m2 = JSON.parse(JSON.stringify(MOVIE)); m2.watch = { path: '/movie/babai' };
  expectDeny('DENY: watch 缺 site', m2, makeSites(), makeHealth());
  const m3 = JSON.parse(JSON.stringify(MOVIE)); m3.watch = { site: 42, path: '/movie/babai' };
  expectDeny('DENY: watch.site 非字符串', m3, makeSites(), makeHealth());
  const m4 = JSON.parse(JSON.stringify(MOVIE)); m4.watch = { site: 'ncat' };
  expectDeny('DENY: watch 缺 path', m4, makeSites(), makeHealth());
  const m5 = JSON.parse(JSON.stringify(MOVIE)); m5.watch = { site: 'nonexistent', path: '/movie/babai' };
  expectDeny('DENY: site 不在白名单', m5, makeSites(), makeHealth());
})();

/* ==================== 8. 域名迁移生命周期（§16.9） ==================== */
(function () {
  const NEW_HOST = 'new.example';
  const NEW_BASE = 'https://' + NEW_HOST;

  function cloneSite(base) { return JSON.parse(JSON.stringify(base)); }
  function hashOf(site) { return WatchGate.computeSiteConfigHash(site); }
  function newHealthFor(cv, site, extraChecks) {
    const h = makeHealth({ configVersion: cv, hash: hashOf(site), host: NEW_HOST });
    if (extraChecks) Object.assign(h.sites.ncat.checks, extraChecks);
    return h;
  }
  function permitFor(cv, site) {
    return {
      approvedHost: NEW_HOST, configVersion: cv, siteConfigHash: hashOf(site),
      verificationMode: site.verificationMode,
      issuedAt: iso(NOW - 1000), expiresAt: iso(NOW + 24 * 3600000),
      issuedBy: 'MuAn', reason: 'migration approve'
    };
  }

  // MIG-1: 旧站点 healthy + valid permit + 旧 health → 允许
  expectOk('MIG-1: 旧域名 healthy + valid permit + health → 允许', MOVIE, makeSites(), makeHealth());

  // begin：进入 pending_verification，configVersion+1，清 permit
  const pend = cloneSite(SITE);
  pend.status = 'pending_verification';
  pend.baseUrl = NEW_BASE; pend.hosts = [NEW_HOST]; pend.allowedRedirectHosts = [NEW_HOST];
  pend.maintenancePermit = null;
  const pendSites = makeSites(pend, CONFIG_VERSION + 1);

  // pending：即使新 health 就绪也永远 DENY（§3 状态机）
  const vPend = expectDeny('MIG-P: pending_verification 即使新 health 就绪也 DENY',
    MOVIE, pendSites, newHealthFor(CONFIG_VERSION + 1, pend));
  assert(vPend.reason === 'site_pending_verification', 'MIG-P: reason', vPend.reason);

  // approve：进入 healthy，configVersion+1（=CONFIG_VERSION+2）
  const healthyNew = cloneSite(pend);
  healthyNew.status = 'healthy';
  const appCv = CONFIG_VERSION + 2;

  // 场景 A（§6 关键）：sites 已换新域名 + 有效新 permit，但 health 仍是旧域名健康状态
  //   → 必须 config_version_mismatch DENY，绝不「旧 health 放行新配置」
  const sA = cloneSite(healthyNew); sA.maintenancePermit = permitFor(appCv, healthyNew);
  const vA = expectDeny('MIG-2: 新 sites+新 permit + 旧 health → config_version_mismatch DENY',
    MOVIE, makeSites(sA, appCv), makeHealth());
  assert(vA.reason === 'config_version_mismatch', 'MIG-2: reason', vA.reason);

  // 场景 B：health 版本已新但 siteConfigHash 是旧配置 → site_config_hash_mismatch
  const hB = makeHealth({ configVersion: appCv, hash: SITE_HASH /* 旧 hash */, host: NEW_HOST });
  const vB = expectDeny('MIG-2b: health 新版本但旧 hash → site_config_hash_mismatch DENY',
    MOVIE, makeSites(sA, appCv), hB);
  assert(vB.reason === 'site_config_hash_mismatch', 'MIG-2b: reason', vB.reason);

  // 场景 C：health 版本+hash 新但 approvedHost 仍是旧域名 → health_host_mismatch
  const hC = makeHealth({ configVersion: appCv, hash: hashOf(healthyNew), host: 'ncat.example' });
  const vC = expectDeny('MIG-2c: health 新版本+hash 但旧 approvedHost → health_host_mismatch DENY',
    MOVIE, makeSites(sA, appCv), hC);
  assert(vC.reason === 'health_host_mismatch', 'MIG-2c: reason', vC.reason);

  // 场景 D：approve 后 healthy 但无 permit → permit_missing DENY（绝不自动签发）
  const vD = expectDeny('MIG-3: approve 后 healthy 无 permit → DENY',
    MOVIE, makeSites(healthyNew, appCv), newHealthFor(appCv, healthyNew));
  assert(vD.reason === 'permit_missing', 'MIG-3: reason', vD.reason);

  // 最终：新域名 + 新 permit + 新 health → 允许，URL 指向新域名
  const sF = cloneSite(healthyNew); sF.maintenancePermit = permitFor(appCv, healthyNew);
  const vFinal = expectOk('MIG-4: 新域名 + 新 permit + 新 health → 允许',
    MOVIE, makeSites(sF, appCv), newHealthFor(appCv, healthyNew));
  assert(vFinal.url === NEW_BASE + '/movie/babai', 'MIG-4: URL 指向新域名', vFinal.url);
  assert(vFinal.host === NEW_HOST, 'MIG-4: host 为新域名', vFinal.host);
})();

/* ==================== 9. 迁移失败不能 fallback（§16.10） ==================== */
(function () {
  const NEW_HOST = 'new.example';
  const NEW_BASE = 'https://' + NEW_HOST;

  function cloneSite(base) { return JSON.parse(JSON.stringify(base)); }
  function hashOf(site) { return WatchGate.computeSiteConfigHash(site); }

  // 使用「post-approve healthy 新域名 + 有效 permit」，把焦点放在 health 层的 fail
  const healthyNew = cloneSite(SITE);
  healthyNew.status = 'healthy';
  healthyNew.baseUrl = NEW_BASE; healthyNew.hosts = [NEW_HOST]; healthyNew.allowedRedirectHosts = [NEW_HOST];
  healthyNew.maintenancePermit = {
    approvedHost: NEW_HOST, configVersion: CONFIG_VERSION + 1, siteConfigHash: hashOf(healthyNew),
    verificationMode: 'automated',
    issuedAt: iso(NOW - 1000), expiresAt: iso(NOW + 24 * 3600000), issuedBy: 'MuAn', reason: ''
  };
  const newSites = makeSites(healthyNew, CONFIG_VERSION + 1);

  // 新域名 watchdog 检查 FAIL（health disabled）→ DENY（不能 fallback）
  const hFail = makeHealth({ configVersion: CONFIG_VERSION + 1, sites: 'disabled',
    hash: hashOf(healthyNew), host: NEW_HOST });
  const v1 = expectDeny('MIG-FAIL: 新域名 health=disabled → DENY', MOVIE, newSites, hFail);
  assert(v1.ok === false, 'MIG-FAIL: 不能 fallback', v1.reason);

  // 新域名检查 UNKNOWN → DENY（UNKNOWN 不转 PASS）
  const hUnknown = makeHealth({ configVersion: CONFIG_VERSION + 1, hash: hashOf(healthyNew),
    host: NEW_HOST, checks: { dns: { ok: false, state: 'UNKNOWN', detail: '未核验' } } });
  const v2 = expectDeny('MIG-FAIL: 新域名 dns=UNKNOWN → DENY', MOVIE, newSites, hUnknown);
  assert(v2.ok === false, 'MIG-FAIL: UNKNOWN 不转 PASS', v2.reason);

  // 系统没有任何「旧域名 fallback」路径：旧 host 不在 allowlist，
  // 即使 health 仍带旧域名 hops → redirect_unknown_host DENY
  const hOldHop = makeHealth({ configVersion: CONFIG_VERSION + 1, hash: hashOf(healthyNew),
    host: NEW_HOST,
    checks: { redirectChain: { ok: true, hops: ['https://ncat.example/', NEW_BASE + '/'], detail: 'x' } } });
  const v3 = expectDeny('MIG-FAIL: health 含旧域名 hop（不在 allowlist）→ DENY',
    MOVIE, newSites, hOldHop);
  assert(v3.reason === 'redirect_unknown_host', 'MIG-FAIL: 旧域名不能作为跳转目标', v3.reason);
})();

/* ==================== 10. 候选隔离（§12 / §16.11） ==================== */
(function () {
  // watch.js 数据源固定为 movies/sites/health，绝不读取候选注册表
  assert(!WatchGate.DATA_SOURCES.candidates, 'ISO: watch.js 不读取候选注册表');
  // 候选域名出现在 health redirect hops 中（未被人工加入 allowedRedirectHosts）→ DENY
  const vIso = expectDeny('ISO: 候选域名出现在 redirect 链 → DENY', MOVIE, makeSites(),
    makeHealth({ checks: { redirectChain: { ok: true, hops: ['https://ncat.example/', 'https://candidate.example/'], detail: 'x' } } }));
  assert(vIso.reason === 'redirect_unknown_host', 'ISO: reason', vIso.reason);
  // 传入候选注册表字段不影响判定（watch.js 只读取约定字段）
  const withCandidates = makeSites();
  withCandidates.candidates = [{ host: 'https://candidate.example' }];
  const v = WatchGate.evaluateWatch(MOVIE, withCandidates, makeHealth(), { now: NOW });
  assert(v.ok === true && v.url === 'https://ncat.example/movie/babai',
    'ISO: 额外候选字段不影响判定（隔离）', v.reason || v.url);
})();

/* ==================== 10b. verificationMode=manual_user_environment 矩阵 ====================
 * 验收（§manual）：
 *   - manual + DNS PASS + TLS PASS + BLOCKED_BY_WAF + MANUAL_VERIFIED + valid permit → ALLOW
 *   - manual 无 permit / permit 过期 / wrong hash / wrong version / wrong host → DENY
 *   - manual + UNKNOWN / FAIL / DNS FAIL / TLS FAIL + permit → DENY（FAIL/UNKNOWN 永不翻案）
 *   - automated + BLOCKED_BY_WAF + valid permit → DENY（manual 分支不被错误用于其他站点）
 *   - manual 迁移：旧 permit 随 configVersion/hash/host 变化自动失效，不能复用
 *   - 时间：permit 过期 / 非法 expiresAt / 缺失 expiresAt / health 过期 / TTL 越界 → DENY
 */
(function () {
  const VM_M = 'manual_user_environment';

  function manualSiteBase() {
    return {
      id: 'ncat', displayName: '网飞猫', status: 'healthy',
      baseUrl: 'https://ncat.example',
      hosts: ['ncat.example'], allowedRedirectHosts: ['ncat.example'],
      baseline: { titleMarker: '网飞猫' },
      verificationMode: VM_M
    };
  }
  const MANUAL_HASH = WatchGate.computeSiteConfigHash(manualSiteBase());
  function manualHash(site) { return WatchGate.computeSiteConfigHash(site); }

  function manualPermit(overrides) {
    const p = {
      approvedHost: 'ncat.example',
      configVersion: CONFIG_VERSION,
      siteConfigHash: MANUAL_HASH,
      verificationMode: VM_M,
      issuedAt: iso(NOW - 3600000),
      expiresAt: iso(NOW + 13 * 3600000), // TTL = 14h ∈ [12,24]
      issuedBy: 'MuAn',
      verificationMethod: '真实用户浏览器手动访问并核对内容',
      verificationNotes: '人工在真实用户环境确认目标页为电影观看页；无钓鱼/强制下载/开放重定向/未批准导航；全程 HTTPS；与基线一致',
      attestations: {
        content_verified: true,
        no_phishing_mimic: true,
        no_forced_download: true,
        no_open_redirect: true,
        no_unapproved_navigation: true,
        https_throughout: true,
        matches_baseline: true
      },
      reason: 'manual verify'
    };
    if (overrides) Object.assign(p, overrides);
    return p;
  }

  function manualSite(overrides) {
    const s = manualSiteBase();
    s.maintenancePermit = manualPermit();
    if (overrides) Object.assign(s, overrides);
    return s;
  }

  function manualHealth(overrides) {
    overrides = overrides || {};
    const h = makeHealth({
      configVersion: CONFIG_VERSION,
      hash: MANUAL_HASH,
      host: 'ncat.example',
      vm: VM_M,
      healthState: 'MANUAL_VERIFIED',
      acc: 'BLOCKED_BY_WAF'
    });
    // manual：内容检查被明确 WAF/anti-bot 阻断（独立证据态 BLOCKED_BY_WAF），
    // 内容组（http/redirectChain/fingerprint/riskScan）不要求 ok —— 由人工 permit 承接。
    h.sites.ncat.checks.http = { ok: false, state: 'BLOCKED_BY_WAF', status: 850, detail: 'WAF/anti-bot 阻断' };
    h.sites.ncat.checks.redirectChain = { ok: false, state: 'BLOCKED_BY_WAF', detail: '内容被阻断未核验' };
    h.sites.ncat.checks.fingerprint = { ok: false, state: 'UNKNOWN', detail: '内容被阻断未核验' };
    h.sites.ncat.checks.riskScan = { ok: false, state: 'UNKNOWN', detail: '内容被阻断未核验' };
    if (overrides.checks) Object.assign(h.sites.ncat.checks, overrides.checks);
    if (overrides.vm !== undefined) h.sites.ncat.verificationMode = overrides.vm;
    if (overrides.healthState !== undefined) h.sites.ncat.healthState = overrides.healthState;
    if (overrides.acc !== undefined) h.sites.ncat.automatedContentCheck = overrides.acc;
    if (overrides.dns !== undefined) h.sites.ncat.checks.dns = overrides.dns;
    if (overrides.tls !== undefined) h.sites.ncat.checks.tls = overrides.tls;
    if (overrides.status !== undefined) h.sites.ncat.status = overrides.status;
    if (overrides.generatedAt !== undefined) h.generatedAt = overrides.generatedAt;
    if (overrides.ttlHours !== undefined) h.ttlHours = overrides.ttlHours;
    if (overrides.configVersion !== undefined) h.configVersion = overrides.configVersion;
    return h;
  }

  /* ---- Manual positive ---- */
  (function () {
    const v = expectOk('MANUAL-POS: manual + DNS/TLS PASS + BLOCKED_BY_WAF + MANUAL_VERIFIED + valid permit → ALLOW',
      MOVIE, makeSites(manualSite()), manualHealth());
    assert(v.url === 'https://ncat.example/movie/babai', 'MANUAL-POS: URL 正确', v.url);
    assert(v.host === 'ncat.example', 'MANUAL-POS: host 正确', v.host);
  })();

  /* ---- Manual + 内容可被机器完整确认（AUTOMATED_HEALTHY + PASS）→ ALLOW（§5 分支 1）---- */
  (function () {
    // manual 站点若其内容能被机器完整确认（watchdog 生成 AUTOMATED_HEALTHY + PASS），
    // 走 ALLOW 分支 1（contentGroup PASS），不要求 BLOCKED_BY_WAF（分支选择按 healthState）。
    const s = manualSite();
    const h = makeHealth({
      configVersion: CONFIG_VERSION,
      hash: MANUAL_HASH,
      host: 'ncat.example',
      vm: VM_M,
      healthState: 'AUTOMATED_HEALTHY',
      acc: 'PASS'
    });
    const v = expectOk('MANUAL-POS2: manual + AUTOMATED_HEALTHY + PASS + valid permit → ALLOW（分支1）',
      MOVIE, makeSites(s), h);
    assert(v.url === 'https://ncat.example/movie/babai', 'MANUAL-POS2: URL 正确', v.url);
  })();

  /* ---- Manual 时钟异常（回拨时钟）---- */
  (function () {
    // health generatedAt 在未来（浏览器时钟被回拨到生成时间之前）→ DENY（invalid_generated_at）
    const hF = manualHealth({ generatedAt: iso(NOW + 3600000) });
    const v = expectDeny('MANUAL-CLOCK: health generatedAt 在未来（回拨时钟）→ DENY',
      MOVIE, makeSites(manualSite()), hF);
    assert(v.reason === 'invalid_generated_at', 'MANUAL-CLOCK: invalid_generated_at', v.reason);
    // permit issuedAt 在未来（回拨时钟到签发之前）→ DENY（permit_invalid_expiry）
    const sF = manualSite(); sF.maintenancePermit = manualPermit({ issuedAt: iso(NOW + 3600000) });
    const v2 = expectDeny('MANUAL-CLOCK: permit issuedAt 在未来（回拨时钟）→ DENY',
      MOVIE, makeSites(sF), manualHealth());
    assert(v2.reason === 'permit_invalid_expiry', 'MANUAL-CLOCK: permit_invalid_expiry', v2.reason);
  })();

  /* ---- Manual negative ---- */
  (function () {
    // 无 permit
    const s1 = manualSite(); s1.maintenancePermit = null;
    const v1 = expectDeny('MANUAL-NEG: BLOCKED_BY_WAF + 无 permit → DENY', MOVIE, makeSites(s1), manualHealth());
    assert(v1.reason === 'permit_missing', 'MANUAL-NEG: permit_missing', v1.reason);
    // permit 过期
    const s2 = manualSite(); s2.maintenancePermit = manualPermit({ expiresAt: iso(NOW - 1000) });
    const v2 = expectDeny('MANUAL-NEG: BLOCKED_BY_WAF + permit 过期 → DENY', MOVIE, makeSites(s2), manualHealth());
    assert(v2.reason === 'permit_expired', 'MANUAL-NEG: permit_expired', v2.reason);
    // wrong hash
    const s3 = manualSite(); s3.maintenancePermit = manualPermit({ siteConfigHash: '0'.repeat(64) });
    const v3 = expectDeny('MANUAL-NEG: BLOCKED_BY_WAF + wrong hash → DENY', MOVIE, makeSites(s3), manualHealth());
    assert(v3.reason === 'permit_hash_mismatch', 'MANUAL-NEG: permit_hash_mismatch', v3.reason);
    // wrong version
    const s4 = manualSite(); s4.maintenancePermit = manualPermit({ configVersion: CONFIG_VERSION - 1 });
    const v4 = expectDeny('MANUAL-NEG: BLOCKED_BY_WAF + wrong version → DENY', MOVIE, makeSites(s4), manualHealth());
    assert(v4.reason === 'permit_config_version_mismatch', 'MANUAL-NEG: permit_config_version_mismatch', v4.reason);
    // wrong host
    const s5 = manualSite(); s5.maintenancePermit = manualPermit({ approvedHost: 'evil.example' });
    const v5 = expectDeny('MANUAL-NEG: BLOCKED_BY_WAF + wrong host → DENY', MOVIE, makeSites(s5), manualHealth());
    assert(v5.reason === 'permit_host_mismatch', 'MANUAL-NEG: permit_host_mismatch', v5.reason);
    // automatedContentCheck=UNKNOWN + permit → DENY（通用 UNKNOWN 永不翻案）
    const vU = expectDeny('MANUAL-NEG: automatedContentCheck=UNKNOWN + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ acc: 'UNKNOWN' }));
    assert(vU.reason === 'content_check_not_blocked', 'MANUAL-NEG: content_check_not_blocked', vU.reason);
    // DNS UNKNOWN + permit → DENY
    const vU2 = expectDeny('MANUAL-NEG: DNS UNKNOWN + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ dns: { ok: false, state: 'UNKNOWN', detail: '未核验' } }));
    assert(vU2.reason === 'dns_failed', 'MANUAL-NEG: dns_failed', vU2.reason);
    // automatedContentCheck=FAIL + permit → DENY（FAIL 永不翻案）
    const vF = expectDeny('MANUAL-NEG: automatedContentCheck=FAIL + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ acc: 'FAIL' }));
    assert(vF.reason === 'content_check_not_blocked', 'MANUAL-NEG: content_check_not_blocked', vF.reason);
    // DNS FAIL + permit → DENY
    expectDeny('MANUAL-NEG: DNS FAIL + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ dns: { ok: false, state: 'FAIL', detail: 'resolve fail' } }));
    // TLS FAIL + permit → DENY
    expectDeny('MANUAL-NEG: TLS FAIL + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ tls: { ok: false, state: 'FAIL', detail: 'tls fail' } }));
    // health status=disabled + permit → DENY（health 必须 healthy）
    expectDeny('MANUAL-NEG: health=disabled + permit → DENY',
      MOVIE, makeSites(manualSite()), manualHealth({ status: 'disabled' }));
  })();

  /* ---- Automated negative：manual 分支不被错误用于其他站点 ---- */
  (function () {
    // automated 站点 + health 记录 BLOCKED_BY_WAF（内容被阻断）→ DENY
    const v1 = expectDeny('AUTO-NEG: automated + BLOCKED_BY_WAF + valid permit → DENY',
      MOVIE, makeSites(), makeHealth({ acc: 'BLOCKED_BY_WAF' }));
    assert(v1.reason === 'content_check_failed', 'AUTO-NEG: content_check_failed', v1.reason);
    // automated 站点 + healthState=MANUAL_VERIFIED → 状态组合非法 → DENY
    const v2 = expectDeny('AUTO-NEG: automated + healthState=MANUAL_VERIFIED → DENY',
      MOVIE, makeSites(), makeHealth({ healthState: 'MANUAL_VERIFIED' }));
    assert(v2.reason === 'health_state_illegal', 'AUTO-NEG: health_state_illegal', v2.reason);
    // automated 站点但 permit 声明 manual（跨模式复用）→ DENY
    const s = JSON.parse(JSON.stringify(SITE));
    s.maintenancePermit = Object.assign(makePermit(), { verificationMode: VM_M });
    expectDeny('AUTO-NEG: automated 站点 + manual permit → DENY（permit_mode_mismatch）',
      MOVIE, makeSites(s), makeHealth());
    // manual 站点 + automated permit（跨模式复用）→ DENY
    const s2 = manualSite(); s2.maintenancePermit = manualPermit({ verificationMode: 'automated' });
    const v3 = expectDeny('MANUAL-NEG: manual 站点 + automated permit → DENY（permit_mode_mismatch）',
      MOVIE, makeSites(s2), manualHealth());
    assert(v3.reason === 'permit_mode_mismatch', 'MANUAL-NEG: permit_mode_mismatch', v3.reason);
  })();

  /* ---- Manual 迁移生命周期：旧 permit 自动失效，不能复用 ---- */
  (function () {
    const NEW_HOST_M = 'new.example';
    const NEW_BASE_M = 'https://' + NEW_HOST_M;
    function cloneMan(s) { return JSON.parse(JSON.stringify(s)); }
    function manualHealthFor(host, cv, site) {
      const h = makeHealth({ configVersion: cv, hash: manualHash(site), host: host });
      h.sites.ncat.verificationMode = VM_M;
      h.sites.ncat.healthState = 'MANUAL_VERIFIED';
      h.sites.ncat.automatedContentCheck = 'BLOCKED_BY_WAF';
      h.sites.ncat.checks.http = { ok: false, state: 'BLOCKED_BY_WAF', status: 850, detail: 'WAF 阻断' };
      h.sites.ncat.checks.redirectChain = { ok: false, state: 'BLOCKED_BY_WAF', detail: '未核验' };
      h.sites.ncat.checks.fingerprint = { ok: false, state: 'UNKNOWN', detail: '未核验' };
      h.sites.ncat.checks.riskScan = { ok: false, state: 'UNKNOWN', detail: '未核验' };
      return h;
    }
    function manualPermitFor(cv, site, host) {
      const p = manualPermit();
      p.approvedHost = host;
      p.configVersion = cv;
      p.siteConfigHash = manualHash(site);
      return p;
    }

    // 旧域名 manual + valid permit + manual health → ALLOW
    expectOk('MANUAL-MIG-1: 旧域名 manual + valid permit + manual health → ALLOW',
      MOVIE, makeSites(manualSite()), manualHealth());

    // begin：pending_verification，configVersion+1，清 permit
    const pendM = manualSite();
    pendM.status = 'pending_verification';
    pendM.baseUrl = NEW_BASE_M; pendM.hosts = [NEW_HOST_M]; pendM.allowedRedirectHosts = [NEW_HOST_M];
    pendM.maintenancePermit = null;
    const pendSitesM = makeSites(pendM, CONFIG_VERSION + 1);
    const vPend = expectDeny('MANUAL-MIG-P: pending_verification 即使新 manual health 就绪也 DENY',
      MOVIE, pendSitesM, manualHealthFor(NEW_HOST_M, CONFIG_VERSION + 1, pendM));
    assert(vPend.reason === 'site_pending_verification', 'MANUAL-MIG-P: reason', vPend.reason);

    // approve：进入 healthy，configVersion+2
    const healthyM = cloneMan(pendM); healthyM.status = 'healthy';
    const appCvM = CONFIG_VERSION + 2;

    // 旧 permit 复用：新 healthy 配置 + 旧 permit（旧 configVersion/hash）→ DENY
    const sOld = cloneMan(healthyM);
    sOld.maintenancePermit = manualPermit(); // 旧 configVersion / 旧 hash
    const vOld = expectDeny('MANUAL-MIG-2: 新配置 + 旧 permit → DENY（旧 permit 不复用）',
      MOVIE, makeSites(sOld, appCvM), manualHealthFor(NEW_HOST_M, appCvM, healthyM));
    assert(vOld.reason === 'permit_config_version_mismatch', 'MANUAL-MIG-2: reason', vOld.reason);

    // approve 后 healthy 无 permit → DENY（绝不自动签发）
    const vNoPermit = expectDeny('MANUAL-MIG-3: approve 后 healthy 无 permit → DENY',
      MOVIE, makeSites(cloneMan(healthyM), appCvM), manualHealthFor(NEW_HOST_M, appCvM, healthyM));
    assert(vNoPermit.reason === 'permit_missing', 'MANUAL-MIG-3: reason', vNoPermit.reason);

    // 最终 renew：新域名 + 新 manual permit + 新 manual health → ALLOW
    const renewM = cloneMan(healthyM);
    renewM.maintenancePermit = manualPermitFor(appCvM, healthyM, NEW_HOST_M);
    const vFinal = expectOk('MANUAL-MIG-4: 新域名 + 新 manual permit + 新 manual health → ALLOW',
      MOVIE, makeSites(renewM, appCvM), manualHealthFor(NEW_HOST_M, appCvM, healthyM));
    assert(vFinal.url === NEW_BASE_M + '/movie/babai', 'MANUAL-MIG-4: URL 指向新域名', vFinal.url);
  })();

  /* ---- Manual 时间安全 ---- */
  (function () {
    // permit valid → ALLOW（positive 已覆盖）
    // permit expired → DENY（negative 已覆盖）
    // invalid expiresAt → DENY
    const s1 = manualSite(); s1.maintenancePermit = manualPermit({ expiresAt: 'not-a-date' });
    expectDeny('MANUAL-TIME: expiresAt 非法 → DENY', MOVIE, makeSites(s1), manualHealth());
    // missing expiresAt → DENY
    const s2 = manualSite(); delete s2.maintenancePermit.expiresAt;
    expectDeny('MANUAL-TIME: expiresAt 缺失 → DENY', MOVIE, makeSites(s2), manualHealth());
    // issuedAt > expiresAt → DENY
    const s3 = manualSite(); s3.maintenancePermit = manualPermit({ issuedAt: iso(NOW + 14 * 3600000) });
    const v3 = expectDeny('MANUAL-TIME: issuedAt > expiresAt → DENY', MOVIE, makeSites(s3), manualHealth());
    assert(v3.reason === 'permit_invalid_expiry', 'MANUAL-TIME: permit_invalid_expiry', v3.reason);
    // TTL > 24h → DENY（不允许永久 permit）
    const s4 = manualSite();
    s4.maintenancePermit = manualPermit({ issuedAt: iso(NOW - 3600000), expiresAt: iso(NOW + 48 * 3600000) }); // TTL=49h
    const v4 = expectDeny('MANUAL-TIME: TTL>24h → DENY', MOVIE, makeSites(s4), manualHealth());
    assert(v4.reason === 'permit_ttl_out_of_range', 'MANUAL-TIME: permit_ttl_out_of_range', v4.reason);
    // TTL < 12h → DENY
    const s5 = manualSite();
    s5.maintenancePermit = manualPermit({ issuedAt: iso(NOW - 3600000), expiresAt: iso(NOW + 6 * 3600000) }); // TTL=7h
    expectDeny('MANUAL-TIME: TTL<12h → DENY', MOVIE, makeSites(s5), manualHealth());
    // health 过期 → DENY（generatedAt 早于 ttlHours=12）
    const hT = manualHealth({ generatedAt: iso(NOW - 13 * 3600000) });
    expectDeny('MANUAL-TIME: health 过期 → DENY', MOVIE, makeSites(manualSite()), hT);
    // 缺 attestation → DENY
    const s6 = manualSite(); delete s6.maintenancePermit.attestations.no_open_redirect;
    expectDeny('MANUAL-TIME: 缺 attestation → DENY', MOVIE, makeSites(s6), manualHealth());
    // 缺 verificationMethod → DENY
    const s7 = manualSite(); delete s7.maintenancePermit.verificationMethod;
    expectDeny('MANUAL-TIME: 缺 verificationMethod → DENY', MOVIE, makeSites(s7), manualHealth());
    // 缺 verificationNotes → DENY
    const s8 = manualSite(); delete s8.maintenancePermit.verificationNotes;
    expectDeny('MANUAL-TIME: 缺 verificationNotes → DENY', MOVIE, makeSites(s8), manualHealth());
    // 缺 issuedBy → DENY
    const s9 = manualSite(); delete s9.maintenancePermit.issuedBy;
    expectDeny('MANUAL-TIME: 缺 issuedBy → DENY', MOVIE, makeSites(s9), manualHealth());
  })();
})();

/* ==================== 11. API 完整性 ==================== */
(function () {
  assert(typeof WatchGate.evaluateWatch === 'function' &&
    typeof WatchGate.validatePermit === 'function' &&
    typeof WatchGate.computeSiteConfigHash === 'function',
    'API: 纯函数接口完整（evaluateWatch/validatePermit/computeSiteConfigHash）');
})();

/* ==================== 汇总 ==================== */
console.log('\n===== 结果 =====');
console.log('PASS: ' + passed + '  FAIL: ' + failed);
if (failed > 0) {
  console.log('\n失败用例:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
} else {
  console.log('全部通过：任何安全条件不满足（含 permit/版本/哈希/主机绑定/迁移中间态）→ DENY，不跳转。');
  process.exit(0);
}
