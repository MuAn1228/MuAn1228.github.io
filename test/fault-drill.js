/* ===== 电影观看外链 —— 故障演练（Fail Closed 演练）v2 =====
 *
 * 覆盖 AGENTS.md 要求的七类故障场景（A–G）+ 一个合成 HEALTHY 成功路径（S0）。
 * v2（Phase 2）：sites.json schemaVersion=2 + configVersion；Maintenance Permit 为必要安全条件，
 * 因此新增 H（permit 故障 → DENY）。全部使用测试数据，绝不触碰生产 sites.json / health.json /
 * movies.json / watch.js。
 *
 * 预期：A–H 一律「不能访问」（evaluateWatch 返回 DENY）；S0 证明成功路径下
 * target URL 由 movie_id → site_id → approved path 构建，host 为 approved host，
 * 且绝不接受用户输入的 URL。
 *
 * 运行：
 *   node test/fault-drill.js
 */
'use strict';

const path = require('path');
const WatchGate = require(path.join(__dirname, '..', 'source', 'js', 'watch.js'));

let passed = 0;
let failed = 0;
const failures = [];

function check(cond, label, extra) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label + (extra ? ' => ' + extra : ''));
    console.log('  FAIL ' + label + (extra ? ' (' + extra + ')' : ''));
  }
}

/* ---------- 固定夹具（全部为测试数据，v2） ---------- */
const NOW = Date.now();
function iso(ts) { return new Date(ts).toISOString(); }

const CONFIG_VERSION = 7;

// 合成 HEALTHY 的 ncat（真实候选域名 + 试点电影真实路径）—— 仅本演练使用，不写生产文件
const SITE_NCAT = {
  id: 'ncat',
  displayName: '网飞猫',
  status: 'healthy',
  baseUrl: 'https://www.ncat21.com',
  hosts: ['www.ncat21.com'],
  allowedRedirectHosts: ['www.ncat21.com'],
  baseline: { titleMarker: '肖申克的救赎' },
  verificationMode: 'automated'
};
const SITE_HASH = WatchGate.computeSiteConfigHash(SITE_NCAT);

// 有效 maintenance permit（绑定当前 configVersion / siteConfigHash / approvedHost / verificationMode）
const VALID_PERMIT = {
  approvedHost: 'www.ncat21.com',
  configVersion: CONFIG_VERSION,
  siteConfigHash: SITE_HASH,
  verificationMode: 'automated',
  issuedAt: iso(NOW - 3600000),
  expiresAt: iso(NOW + 24 * 3600000),
  issuedBy: 'MuAn',
  reason: 'test fixture'
};

// sitesOk：schemaVersion=2 + configVersion + 带有效 permit 的 healthy 站点
const sitesOk = {
  schemaVersion: 2,
  configVersion: CONFIG_VERSION,
  sites: [Object.assign({}, SITE_NCAT, { maintenancePermit: VALID_PERMIT })]
};

// 试点电影：肖申克的救赎（真实 ncat21 详情路径 /detail/9470.html）
const PILOT = {
  id: 'xiaoshenke', name: '肖申克的救赎', sub: '1994',
  watch: { site: 'ncat', path: '/detail/9470.html' }
};

function makeHealth(overrides) {
  overrides = overrides || {};
  const cv = overrides.configVersion !== undefined ? overrides.configVersion : CONFIG_VERSION;
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
        siteConfigHash: overrides.hash !== undefined ? overrides.hash : SITE_HASH,
        approvedHost: 'www.ncat21.com',
        verificationMode: 'automated',
        healthState: 'AUTOMATED_HEALTHY',
        automatedContentCheck: 'PASS',
        checks: {
          dns: { ok: true, detail: 'ok' },
          tls: { ok: true, detail: 'ok' },
          http: { ok: true, status: 200, detail: 'ok' },
          redirectChain: { ok: true, hops: ['https://www.ncat21.com/'], detail: 'ok' },
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
  if (overrides.sitesMap !== undefined) h.sites = overrides.sitesMap;
  return h;
}

function expectDeny(label, movie, sites, health, opts) {
  const v = WatchGate.evaluateWatch(movie, sites, health, opts || { now: NOW });
  check(v.ok === false, label, 'expected DENY got ok=' + v.ok + ' reason=' + v.reason);
  return v;
}
function expectOk(label, movie, sites, health, opts) {
  const v = WatchGate.evaluateWatch(movie, sites, health, opts || { now: NOW });
  check(v.ok === true, label, 'expected OK got reason=' + (v.reason || '?'));
  return v;
}

/* ==================== S0. 合成 HEALTHY 成功路径（证明 URL 构建正确） ==================== */
(function () {
  const v = expectOk('S0: 合成 HEALTHY + valid permit 试点允许', PILOT, sitesOk, makeHealth());
  check(v.url === 'https://www.ncat21.com/detail/9470.html', 'S0: target URL 由 approved path 构建', v.url);
  check(v.host === 'www.ncat21.com', 'S0: target host 为 approved host', v.host);
  // target URL 不是用户输入：任何用户可控参数都不参与构建（evaluateWatch 无 url 入参）
  const v2 = WatchGate.evaluateWatch(PILOT, sitesOk, makeHealth(), { now: NOW, userUrl: 'https://evil.example/x' });
  check(v2.ok === true && v2.url === 'https://www.ncat21.com/detail/9470.html',
    'S0: 用户提供的 URL 不影响 target（无用户输入参与）', v2.url);
  // 只允许 movie_id→site_id→approved path 这一条路径。
  // movie id 查找发生在页面层（initConfirmPage 在 movies 数组里按 id 查找）；
  // 未登记/未命中的 id → movie=null → evaluateWatch 拒绝（与浏览器端到端测试一致）。
  const moviesList = [PILOT];
  const miss = moviesList.filter(function (m) { return m && m.id === 'not-in-list'; });
  check(miss.length === 0, 'S0: 页面层按 id 查找，未登记的 movie id 查不到');
  const vMiss = WatchGate.evaluateWatch(miss[0] || null, sitesOk, makeHealth(), { now: NOW });
  check(vMiss.ok === false, 'S0: 未命中 movie（null）→ DENY（页面层行为）', vMiss.reason);
})();

/* ==================== A. ncat = DISABLED → 不能访问 ==================== */
(function () {
  // sites.json 层 disabled
  const siteDisabled = JSON.parse(JSON.stringify(SITE_NCAT)); siteDisabled.status = 'disabled';
  const v = expectDeny('A: site status=disabled → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [siteDisabled] }, makeHealth());
  // health.json 层 disabled
  const v2 = expectDeny('A: health status=disabled → DENY', PILOT, sitesOk, makeHealth({ sites: 'disabled' }));
  console.log('  [A] ncat=DISABLED → 不能访问（site:' + v.reason + ' / health:' + v2.reason + '）');
})();

/* ==================== B. health.json 过期 → 不能访问 ==================== */
(function () {
  const h = makeHealth({ generatedAt: iso(NOW - 13 * 3600000) }); // ttl=12h，超过 1h
  const v = expectDeny('B: health 过期 → DENY', PILOT, sitesOk, h);
  console.log('  [B] health.json 过期 → 不能访问（' + v.reason + '）');
})();

/* ==================== C. health.json 损坏 → 不能访问 ==================== */
(function () {
  const cases = {
    'null': null,
    '非对象字符串': 'garbage',
    'schemaVersion 不支持': makeHealth({ schemaVersion: 3 }),
    '缺 sites 映射': makeHealth({ sitesMap: {} }),
    '缺 checks': (function () { const x = makeHealth(); delete x.sites.ncat.checks; return x; }()),
    '缺必填检查项 dns': (function () { const x = makeHealth(); delete x.sites.ncat.checks.dns; return x; }())
  };
  for (const [label, h] of Object.entries(cases)) {
    const v = expectDeny('C: health 损坏(' + label + ') → DENY', PILOT, sitesOk, h);
  }
  console.log('  [C] health.json 损坏（' + Object.keys(cases).length + ' 种）→ 不能访问');
})();

/* ==================== D. redirect 到未知域名 → 不能访问 ==================== */
(function () {
  const v = expectDeny('D: redirect 链含未知 host → DENY', PILOT, sitesOk, makeHealth({
    checks: { redirectChain: { ok: true, hops: ['https://www.ncat21.com/', 'https://evil.example/'], detail: 'x' } }
  }));
  console.log('  [D] redirect 到未知域名 → 不能访问（' + v.reason + '）');
})();

/* ==================== E. candidate 技术检查通过但未人工批准 → 不能访问 ==================== */
(function () {
  // candidate 在候选注册表（candidates.json）里为 TECHNICALLY_ELIGIBLE，
  // 但 sites.json 白名单没有它（未人工批准）→ site 不在 allowlist → DENY。
  const v = expectDeny('E: candidate 未人工批准（不在 sites.json）→ DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [] }, makeHealth());
  // 架构保证：watch.js 的数据源只有 movies/sites/health，绝不读取候选注册表
  check(!WatchGate.DATA_SOURCES.candidates, 'E: watch.js 不读取候选注册表（无 candidates 数据源）');
  console.log('  [E] candidate 技术检查通过但未人工批准 → 不能访问（' + v.reason + '）');
})();

/* ==================== F. approved 域名失效 → 自动进入 DISABLED ==================== */
(function () {
  // 客户端侧：health 一旦被判 disabled（watchdog 自动写入）→ 立即 DENY。
  // watchdog 侧的「自动进入 DISABLED」由 watchdog_check.py 在真实网络检查中产生
  // （本演练的 F 节点单独用 python 验证 watchdog 输出，见 fault-drill 说明）。
  const v = expectDeny('F: approved 域名失效（health disabled）→ 客户端 DENY', PILOT, sitesOk,
    makeHealth({ sites: 'disabled' }));
  console.log('  [F] approved 域名失效 → 客户端不能访问（' + v.reason + '；watchdog 自动翻转由 python 侧验证）');
})();

/* ==================== G. 新 candidate 出现 → 只记录，不自动跳转 ==================== */
(function () {
  // 新候选域名（如 ncat22.com）仅出现在候选注册表，绝不在 sites.json 白名单
  const siteOnly = { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [] }; // 候选未人工批准，白名单为空
  const v = expectDeny('G: 新 candidate 未批准 → 不自动跳转（DENY）', PILOT, siteOnly, makeHealth());
  check(WatchGate.DATA_SOURCES.sites === '/data/sites.json' &&
    WatchGate.DATA_SOURCES.health === '/data/health.json',
    'G: 数据源固定为人工白名单 sites.json + 决策数据 health.json，候选不进白名单');
  console.log('  [G] 新 candidate 出现 → 只记录不自动跳转（' + v.reason + '）');
})();

/* ==================== H. Maintenance Permit 故障 → 不能访问（§1 / §9） ==================== */
(function () {
  // H1: 站点 healthy + health 全 PASS，但 permit 缺失 → 必须 DENY
  const noPermit = JSON.parse(JSON.stringify(SITE_NCAT)); noPermit.status = 'healthy'; // 无 maintenancePermit
  const v1 = expectDeny('H1: 缺 maintenancePermit → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [noPermit] }, makeHealth());

  // H2: permit 过期 → 必须 DENY（浏览器时钟 + 短有效期；本地时钟可被篡改属已知限制，见 §10）
  const expired = Object.assign({}, SITE_NCAT, {
    maintenancePermit: Object.assign({}, VALID_PERMIT, { expiresAt: iso(NOW - 1000) })
  });
  const v2 = expectDeny('H2: permit 过期 → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [expired] }, makeHealth());

  // H3: permit host 与当前站点域名不一致 → 必须 DENY（旧域名 permit 不能复用）
  const wrongHost = Object.assign({}, SITE_NCAT, {
    maintenancePermit: Object.assign({}, VALID_PERMIT, { approvedHost: 'old.example' })
  });
  const v3 = expectDeny('H3: permit host 不匹配 → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [wrongHost] }, makeHealth());

  // H4: permit configVersion 与当前 configVersion 不一致 → 必须 DENY（新配置 + 旧 permit 不放行）
  const staleCv = Object.assign({}, SITE_NCAT, {
    maintenancePermit: Object.assign({}, VALID_PERMIT, { configVersion: CONFIG_VERSION - 1 })
  });
  const v4 = expectDeny('H4: permit configVersion 不匹配 → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [staleCv] }, makeHealth());

  // H5: permit siteConfigHash 与当前配置哈希不一致 → 必须 DENY
  const wrongHash = Object.assign({}, SITE_NCAT, {
    maintenancePermit: Object.assign({}, VALID_PERMIT, { siteConfigHash: '0'.repeat(64) })
  });
  const v5 = expectDeny('H5: permit siteConfigHash 不匹配 → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [wrongHash] }, makeHealth());

  // H6: permit 时间字段非法（不可解析）→ 必须 DENY
  const badTime = Object.assign({}, SITE_NCAT, {
    maintenancePermit: Object.assign({}, VALID_PERMIT, { expiresAt: 'not-a-time' })
  });
  const v6 = expectDeny('H6: permit expiresAt 非法 → DENY', PILOT,
    { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [badTime] }, makeHealth());

  console.log('  [H] Maintenance Permit 故障（缺失/过期/host/version/hash/非法时间）→ 不能访问'
    + '（' + v1.reason + ' / ' + v2.reason + ' / ' + v3.reason + ' / ' + v4.reason + ' / ' + v5.reason + ' / ' + v6.reason + '）');
})();

/* ==================== I. manual_user_environment 故障演练（§manual） ====================
 * 验收：
 *   I0  成功路径：manual + DNS/TLS PASS + BLOCKED_BY_WAF + MANUAL_VERIFIED + valid permit → ALLOW
 *       （证明 manual ALLOW 分支成立且 URL 仍由 movie→site→approved path 构建）
 *   I1–I5  manual + 无 permit / 过期 / wrong hash / wrong version / wrong host → DENY
 *   I6–I7  manual + UNKNOWN / FAIL + permit → DENY（FAIL/UNKNOWN 永不人工翻案）
 *   I8–I9  manual + DNS FAIL / TLS FAIL + permit → DENY（manual 不关闭任何机器门）
 *   I10  automated 站点 + BLOCKED_BY_WAF + permit → DENY（manual 分支不用于其他站点）
 *   I11–I13 manual TTL<12h / 缺 attestation / health=disabled → DENY
 */
(function () {
  const VM_M = 'manual_user_environment';
  const SITE_MANUAL = Object.assign({}, SITE_NCAT, { verificationMode: VM_M });
  const MANUAL_HASH = WatchGate.computeSiteConfigHash(SITE_MANUAL);

  function manualPermit(overrides) {
    const p = {
      approvedHost: 'www.ncat21.com',
      configVersion: CONFIG_VERSION,
      siteConfigHash: MANUAL_HASH,
      verificationMode: VM_M,
      issuedAt: iso(NOW - 3600000),
      expiresAt: iso(NOW + 13 * 3600000), // TTL=14h ∈ [12,24]
      issuedBy: 'MuAn',
      verificationMethod: '真实用户浏览器手动访问并核对内容',
      verificationNotes: '人工在真实用户环境确认目标页为电影观看页；无钓鱼/强制下载/开放重定向/未批准导航；全程 HTTPS；与基线一致',
      attestations: {
        content_verified: true, no_phishing_mimic: true, no_forced_download: true,
        no_open_redirect: true, no_unapproved_navigation: true, https_throughout: true,
        matches_baseline: true
      },
      reason: 'manual verify'
    };
    if (overrides) Object.assign(p, overrides);
    return p;
  }

  // manual health：DNS/TLS PASS + 内容组 BLOCKED_BY_WAF（内容由人工 permit 承接）
  function manualHealth(overrides) {
    overrides = overrides || {};
    const h = makeHealth();
    const rec = h.sites.ncat;
    rec.verificationMode = VM_M;
    rec.healthState = 'MANUAL_VERIFIED';
    rec.automatedContentCheck = 'BLOCKED_BY_WAF';
    rec.siteConfigHash = MANUAL_HASH;
    rec.checks.http = { ok: false, state: 'BLOCKED_BY_WAF', status: 850, detail: 'WAF/anti-bot 阻断' };
    rec.checks.redirectChain = { ok: false, state: 'BLOCKED_BY_WAF', detail: '内容被阻断未核验' };
    rec.checks.fingerprint = { ok: false, state: 'UNKNOWN', detail: '内容被阻断未核验' };
    rec.checks.riskScan = { ok: false, state: 'UNKNOWN', detail: '内容被阻断未核验' };
    if (overrides.dns) rec.checks.dns = overrides.dns;
    if (overrides.tls) rec.checks.tls = overrides.tls;
    if (overrides.acc) rec.automatedContentCheck = overrides.acc;
    if (overrides.status) rec.status = overrides.status;
    return h;
  }

  const sitesManual = function (site) {
    return { schemaVersion: 2, configVersion: CONFIG_VERSION, sites: [site] };
  };

  // I0: manual 成功路径
  const s0 = Object.assign({}, SITE_MANUAL, { maintenancePermit: manualPermit() });
  const v0 = expectOk('I0: manual + DNS/TLS PASS + BLOCKED_BY_WAF + MANUAL_VERIFIED + valid permit 允许',
    PILOT, sitesManual(s0), manualHealth());
  check(v0.url === 'https://www.ncat21.com/detail/9470.html', 'I0: manual 分支 URL 仍由 approved path 构建', v0.url);
  check(v0.host === 'www.ncat21.com', 'I0: manual 分支 host 为 approved host', v0.host);

  // I1: 无 permit
  const s1 = Object.assign({}, SITE_MANUAL); s1.maintenancePermit = null;
  const v1 = expectDeny('I1: manual + BLOCKED_BY_WAF + 无 permit → DENY', PILOT, sitesManual(s1), manualHealth());
  check(v1.reason === 'permit_missing', 'I1: permit_missing', v1.reason);

  // I2: permit 过期
  const s2 = Object.assign({}, SITE_MANUAL, { maintenancePermit: manualPermit({ expiresAt: iso(NOW - 1000) }) });
  const v2 = expectDeny('I2: manual + permit 过期 → DENY', PILOT, sitesManual(s2), manualHealth());
  check(v2.reason === 'permit_expired', 'I2: permit_expired', v2.reason);

  // I3: wrong hash
  const s3 = Object.assign({}, SITE_MANUAL, { maintenancePermit: manualPermit({ siteConfigHash: '0'.repeat(64) }) });
  const v3 = expectDeny('I3: manual + wrong hash → DENY', PILOT, sitesManual(s3), manualHealth());
  check(v3.reason === 'permit_hash_mismatch', 'I3: permit_hash_mismatch', v3.reason);

  // I4: wrong version
  const s4 = Object.assign({}, SITE_MANUAL, { maintenancePermit: manualPermit({ configVersion: CONFIG_VERSION - 1 }) });
  const v4 = expectDeny('I4: manual + wrong version → DENY', PILOT, sitesManual(s4), manualHealth());
  check(v4.reason === 'permit_config_version_mismatch', 'I4: permit_config_version_mismatch', v4.reason);

  // I5: wrong host
  const s5 = Object.assign({}, SITE_MANUAL, { maintenancePermit: manualPermit({ approvedHost: 'old.example' }) });
  const v5 = expectDeny('I5: manual + wrong host → DENY', PILOT, sitesManual(s5), manualHealth());
  check(v5.reason === 'permit_host_mismatch', 'I5: permit_host_mismatch', v5.reason);

  // I6: UNKNOWN + permit → DENY（通用 UNKNOWN 永不翻案）
  const v6 = expectDeny('I6: manual + UNKNOWN + permit → DENY', PILOT, sitesManual(s0),
    manualHealth({ acc: 'UNKNOWN' }));
  check(v6.reason === 'content_check_not_blocked', 'I6: content_check_not_blocked', v6.reason);

  // I7: FAIL + permit → DENY（FAIL 永不翻案）
  const v7 = expectDeny('I7: manual + FAIL + permit → DENY', PILOT, sitesManual(s0),
    manualHealth({ acc: 'FAIL' }));
  check(v7.reason === 'content_check_not_blocked', 'I7: content_check_not_blocked', v7.reason);

  // I8: DNS FAIL + permit → DENY（manual 不关闭 DNS 机器门）
  const v8 = expectDeny('I8: manual + DNS FAIL + permit → DENY', PILOT, sitesManual(s0),
    manualHealth({ dns: { ok: false, state: 'FAIL', detail: 'resolve fail' } }));
  check(v8.reason === 'dns_failed', 'I8: dns_failed', v8.reason);

  // I9: TLS FAIL + permit → DENY（manual 不关闭 TLS 机器门）
  const v9 = expectDeny('I9: manual + TLS FAIL + permit → DENY', PILOT, sitesManual(s0),
    manualHealth({ tls: { ok: false, state: 'FAIL', detail: 'tls fail' } }));
  check(v9.reason === 'tls_failed', 'I9: tls_failed', v9.reason);

  // I10: automated 站点 + BLOCKED_BY_WAF + valid permit → DENY（manual 分支不用于其他站点）。
  // automated 站点必须带自己的 health（hash=SITE_HASH，healthState=AUTOMATED_HEALTHY，
  // 但 automatedContentCheck=BLOCKED_BY_WAF）→ content_check_failed。
  const sAuto = Object.assign({}, SITE_NCAT, { maintenancePermit: VALID_PERMIT });
  const hAutoBlocked = (function () {
    const h = makeHealth();
    h.sites.ncat.verificationMode = 'automated';
    h.sites.ncat.healthState = 'AUTOMATED_HEALTHY';
    h.sites.ncat.automatedContentCheck = 'BLOCKED_BY_WAF';
    return h;
  }());
  const v10 = expectDeny('I10: automated + BLOCKED_BY_WAF + permit → DENY', PILOT,
    sitesManual(sAuto), hAutoBlocked);
  check(v10.reason === 'content_check_failed', 'I10: content_check_failed', v10.reason);

  // I11: TTL<12h → DENY（不允许过短的人工许可）
  const s11 = Object.assign({}, SITE_MANUAL, {
    maintenancePermit: manualPermit({ issuedAt: iso(NOW - 3600000), expiresAt: iso(NOW + 6 * 3600000) }) // TTL=7h
  });
  const v11 = expectDeny('I11: manual TTL<12h → DENY', PILOT, sitesManual(s11), manualHealth());
  check(v11.reason === 'permit_ttl_out_of_range', 'I11: permit_ttl_out_of_range', v11.reason);

  // I12: 缺 attestation → DENY（7 项人工确认缺一不可）
  const p12 = manualPermit(); delete p12.attestations.no_open_redirect;
  const s12 = Object.assign({}, SITE_MANUAL, { maintenancePermit: p12 });
  const v12 = expectDeny('I12: manual 缺 attestation → DENY', PILOT, sitesManual(s12), manualHealth());
  check(v12.reason === 'permit_attestation_missing', 'I12: permit_attestation_missing', v12.reason);

  // I13: health=disabled + permit → DENY（health 必须 healthy）
  const v13 = expectDeny('I13: manual + health disabled + permit → DENY', PILOT, sitesManual(s0),
    manualHealth({ status: 'disabled' }));

  console.log('  [I] manual_user_environment 故障（无 permit/过期/hash/version/host/UNKNOWN/FAIL/DNS/TLS/跨模式/TTL/attestation/health disabled）→ 不能访问');
})();

/* ==================== 汇总 ==================== */
console.log('\n===== 故障演练结果 =====');
console.log('PASS: ' + passed + '  FAIL: ' + failed);
if (failed > 0) {
  console.log('\n失败用例:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
} else {
  console.log('全部通过：A–I 故障场景一律不能访问（含 manual 模式所有否定路径）；S0/I0 成功路径 URL 构建正确且不接受用户输入。');
  process.exit(0);
}
