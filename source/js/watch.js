/* ===== 电影观看外链安全校验模块（Fail Closed / Allowlist / Default Deny）=====
 *
 * 安全模型（严格遵守 AGENTS.md 中「网飞猫外链」安全要求）：
 *   - 任何检查不通过 / 不确定 / 异常 → DENY（不跳转），不存在"可疑但仍允许"的状态。
 *   - destination 只能由 movie_id → site_id → approved path 构建，用户永远不能提供 URL。
 *   - health.json / sites.json 是安全决策数据，不做任何 fallback（旧数据 / 猜测 URL / 其他 Provider）。
 *   - fingerprint 与 risk marker 只是风险信号，不是"网站安全"的证明。
 *   - 本模块不声称"绝对安全 / 保证安全 / 官方合作 / 合法网站"，只准确描述执行的安全检查。
 *
 * 模块形态：UMD —— 浏览器挂 window.WatchGate（页面确认页逻辑自动初始化），
 *            Node/测试环境走 module.exports（纯函数单测）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WatchGate = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA_SOURCES = {
    movies: '/data/movies.json',
    sites: '/data/sites.json',
    health: '/data/health.json'
  };
  var CONFIRM_ROOT_ID = 'watch-confirm';

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function deny(reason) {
    return { ok: false, reason: reason };
  }

  /* ---------- 0. siteConfigHash（跨 Python/JavaScript 一致的配置哈希，绑定安全决策）----------
   *
   * 安全字段固定为以下集合（任何新增/删除都会破坏与 watchdog_check.py 的一致性，
   * 两边必须保持同一份清单，见 test/hash-crosscheck.js）：
   *   id / status / baseUrl / hosts / allowedRedirectHosts / baseline / verificationMode
   * verificationMode 影响客户端对内容的核验责任，必须参与哈希绑定。
   * 规范化：只取上述字段 → 递归按键排序 → 紧凑 JSON（无空格、非 ASCII 原样）→ SHA-256 hex。
   * Python 侧等价实现见 watchdog_check.py 的 compute_site_config_hash()。
   */
  var SECURITY_FIELDS = ['id', 'status', 'baseUrl', 'hosts', 'allowedRedirectHosts', 'baseline', 'verificationMode'];

  // verificationMode 枚举（缺失 / 非法 → 站点无效 / health disabled，Fail Closed）
  var VM_AUTOMATED = 'automated';
  var VM_MANUAL = 'manual_user_environment';

  // healthState 三态（诊断语义，与顶层 status 组合必须合法）
  var HS_AUTOMATED = 'AUTOMATED_HEALTHY';
  var HS_MANUAL = 'MANUAL_VERIFIED';
  var HS_DISABLED = 'DISABLED';

  // automatedContentCheck 四态（内容组自动检查结果）
  var ACC_PASS = 'PASS';
  var ACC_WAF = 'BLOCKED_BY_WAF';
  var ACC_FAIL = 'FAIL';
  var ACC_UNKNOWN = 'UNKNOWN';

  // manual 模式 Maintenance Permit 强制要求：7 项人工 attestation（全部必须为 true）
  var MANUAL_ATTESTATIONS = [
    'content_verified',       // 目标页面确为电影观看/站点内容页，非空壳/纯跳转页
    'no_phishing_mimic',      // 无仿冒正规品牌、无钓鱼/欺诈特征
    'no_forced_download',     // 不诱导下载可执行文件（exe/apk/msi 等）
    'no_open_redirect',       // 无开放重定向（不跳转到用户可控的第三方 URL）
    'no_unapproved_navigation', // 无跳转到未批准外域 host 的强制导航（meta/JS）
    'https_throughout',       // 全程 HTTPS，无明文/混合内容降级
    'matches_baseline'        // 页面与人工审核基线标记一致
  ];
  // manual 模式 permit 有效期约束：12–24 小时（不允许永久 permit / 不允许自动续签）
  var MIN_PERMIT_TTL_MS = 12 * 3600000;
  var MAX_PERMIT_TTL_MS = 24 * 3600000;

  // ---- 紧凑同步 SHA-256（FIPS 180-4），避免把 evaluateWatch 变成异步 API ----
  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function toHex(x) {
    var s = (x >>> 0).toString(16);
    while (s.length < 8) s = '0' + s;
    return s;
  }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff) {
        var next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          var cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          i++;
        } else {
          out.push(0xef, 0xbf, 0xbd);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        out.push(0xef, 0xbf, 0xbd);
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return out;
  }

  function sha256Hex(input) {
    var bytes = utf8Bytes(String(input));
    var bitLenHi = Math.floor(bytes.length / 0x20000000) >>> 0; // bits = len*8, 高 32 位
    var bitLenLo = (bytes.length * 8) >>> 0;
    var msg = bytes.slice();
    msg.push(0x80);
    while ((msg.length + 8) % 64 !== 0) msg.push(0);
    msg.push((bitLenHi >>> 24) & 0xff, (bitLenHi >>> 16) & 0xff, (bitLenHi >>> 8) & 0xff, bitLenHi & 0xff);
    msg.push((bitLenLo >>> 24) & 0xff, (bitLenLo >>> 16) & 0xff, (bitLenLo >>> 8) & 0xff, bitLenLo & 0xff);

    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        var j = off + i * 4;
        w[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
      }
      for (var x = 16; x < 64; x++) {
        var s0 = rotr(w[x - 15], 7) ^ rotr(w[x - 15], 18) ^ (w[x - 15] >>> 3);
        var s1 = rotr(w[x - 2], 17) ^ rotr(w[x - 2], 19) ^ (w[x - 2] >>> 10);
        w[x] = (w[x - 16] + s0 + w[x - 7] + s1) >>> 0;
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (var r = 0; r < 64; r++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + SHA256_K[r] + w[r]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) +
           toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) arr.push(canonicalize(value[i]));
      return arr;
    }
    if (isPlainObject(value)) {
      var keys = Object.keys(value).sort();
      var out = {};
      for (var j = 0; j < keys.length; j++) out[keys[j]] = canonicalize(value[keys[j]]);
      return out;
    }
    return value;
  }

  function computeSiteConfigHash(site) {
    if (!isPlainObject(site)) return null;
    var canonical = {};
    for (var i = 0; i < SECURITY_FIELDS.length; i++) {
      var k = SECURITY_FIELDS[i];
      if (site.hasOwnProperty(k)) canonical[k] = site[k];
    }
    return sha256Hex(JSON.stringify(canonicalize(canonical)));
  }

  // hostname 规范化（小写 + 去尾部点），Python 侧等价实现见 watchdog_check.py 的 hostname_of()
  function hostnameOf(url) {
    if (typeof url !== 'string' || url === '') return null;
    try {
      var h = new URL(url).hostname;
      return h.toLowerCase().replace(/\.+$/, '');
    } catch (e) { return null; }
  }

  /* ---------- 1. approved path 校验（严格白名单字符集，防 URL Parser Bypass）---------- */
  // 只允许：以单个 / 开头，仅含 RFC 3986 unreserved 字符与 /，无 ..、//、\、空格/控制符、
  // 无 ? # % ：、无非 ASCII（防 Unicode/Punycode 混淆）。
  var PATH_RE = /^\/[A-Za-z0-9\-._~\/]+$/;

  function validatePath(path) {
    if (typeof path !== 'string') return null;
    if (path.length < 1 || path.length > 512) return null;
    if (path.charCodeAt(0) !== 47 /* '/' */) return null;
    if (path.indexOf('..') !== -1) return null; // path traversal
    if (path.indexOf('//') !== -1) return null; // protocol-relative / open redirect
    if (path.indexOf('\\') !== -1) return null; // backslash bypass
    if (!PATH_RE.test(path)) return null;       // charset whitelist（含空格/控制/非ASCII/?#%: 一律拒绝）
    return path;
  }

  /* ---------- 2. site 白名单校验（sites.json 的人工审核结果）---------- */
  function validateSite(site) {
    if (!isPlainObject(site)) return null;
    if (typeof site.id !== 'string' || site.id === '') return null;
    if (site.status !== 'healthy') return null; // 人工白名单门禁：非 healthy 一律拒绝
    if (site.verificationMode !== VM_AUTOMATED && site.verificationMode !== VM_MANUAL) {
      return null; // verificationMode 缺失 / 非法 → 站点无效（Fail Closed）
    }
    if (typeof site.baseUrl !== 'string' || site.baseUrl === '') return null;
    if (!Array.isArray(site.hosts) || site.hosts.length === 0) return null;
    if (!Array.isArray(site.allowedRedirectHosts)) return null;

    var hosts = Object.create(null);
    for (var i = 0; i < site.hosts.length; i++) {
      if (typeof site.hosts[i] !== 'string' || site.hosts[i] === '') return null;
      hosts[site.hosts[i]] = true;
    }
    var allowed = Object.create(null);
    for (var j = 0; j < site.allowedRedirectHosts.length; j++) {
      if (typeof site.allowedRedirectHosts[j] !== 'string') return null;
      allowed[site.allowedRedirectHosts[j]] = true;
    }
    return {
      id: site.id,
      baseUrl: site.baseUrl,
      hosts: hosts,
      allowedRedirectHosts: allowed,
      verificationMode: site.verificationMode
    };
  }

  /* ---------- 2b. Maintenance Permit（人工签发的限时维护许可，必要安全条件）----------
   * 任何 permit 缺失 / 过期 / configVersion 不匹配 / siteConfigHash 不匹配 / approvedHost 不匹配
   * → 一律 DENY。仅当 permit 有效且所有条件匹配，才允许继续后续跳转检查。
   * manual_user_environment 模式额外强制：issuedAt/expiresAt 均有效、TTL ∈ [12h,24h]、
   * verificationMethod / verificationNotes 非空、7 项 attestation 全部为 true；
   * permit 必须绑定与站点一致的 verificationMode（防跨模式复用旧 permit）。
   * permit 由 domain-migrate.py 的 approve / renew 命令签发，绑定当前 sites.json 配置。
   */
  function validatePermit(site, configVersion, now) {
    if (!isPlainObject(site)) return deny('permit_missing');
    var permit = site.maintenancePermit;
    if (!isPlainObject(permit)) return deny('permit_missing');
    if (typeof permit.configVersion !== 'number' || permit.configVersion !== configVersion) {
      return deny('permit_config_version_mismatch');
    }
    if (typeof permit.approvedHost !== 'string' || permit.approvedHost === '') return deny('permit_invalid');
    if (typeof permit.siteConfigHash !== 'string' || permit.siteConfigHash === '') return deny('permit_invalid');
    var host = hostnameOf(site.baseUrl);
    if (host === null || permit.approvedHost !== host) return deny('permit_host_mismatch');
    var hash = computeSiteConfigHash(site);
    if (hash === null || permit.siteConfigHash !== hash) return deny('permit_hash_mismatch');

    // permit 必须绑定与站点一致的 verificationMode（防把 automated 的 permit 用到 manual 站点等跨模式复用）
    if (permit.verificationMode !== site.verificationMode) return deny('permit_mode_mismatch');

    var issued = Date.parse(permit.issuedAt);
    var exp = Date.parse(permit.expiresAt);
    if (isNaN(issued) || isNaN(exp)) return deny('permit_invalid_expiry');
    if (issued > exp) return deny('permit_invalid_expiry');
    if (now >= exp) return deny('permit_expired');
    // 时钟异常（Fail Closed）：浏览器时钟早于 permit 签发时间 → 拒绝。
    // 防止回拨时钟把尚未生效 / 本应过期的 permit 长期当成有效（结合短 TTL 双重收窄窗口）。
    if (now < issued) return deny('permit_invalid_expiry');

    if (site.verificationMode === VM_MANUAL) {
      // manual 模式强制：TTL ∈ [12h,24h]（不允许永久 permit）；人工核验字段与 7 项 attestation 齐全
      var ttl = exp - issued;
      if (ttl < MIN_PERMIT_TTL_MS || ttl > MAX_PERMIT_TTL_MS) return deny('permit_ttl_out_of_range');
      if (typeof permit.issuedBy !== 'string' || permit.issuedBy === '') return deny('permit_invalid');
      if (typeof permit.verificationMethod !== 'string' || permit.verificationMethod === '') {
        return deny('permit_invalid');
      }
      if (typeof permit.verificationNotes !== 'string' || permit.verificationNotes === '') {
        return deny('permit_invalid');
      }
      var att = permit.attestations;
      if (!isPlainObject(att)) return deny('permit_invalid');
      for (var a = 0; a < MANUAL_ATTESTATIONS.length; a++) {
        if (att[MANUAL_ATTESTATIONS[a]] !== true) return deny('permit_attestation_missing');
      }
    }
    return { ok: true };
  }

  /* ---------- 3. URL 构建 + 二次校验 ---------- */
  function buildUrl(site, path) {
    var base;
    try { base = new URL(site.baseUrl); } catch (e) { return null; }
    if (base.protocol !== 'https:') return null;         // 仅 https
    if (base.username !== '' || base.password !== '') return null; // userinfo 拒绝
    if (base.search !== '' || base.hash !== '') return null;      // baseUrl 必须干净
    if (!site.hosts[base.hostname]) return null;         // baseUrl 本身必须在白名单内

    var u;
    try { u = new URL(path, site.baseUrl); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;            // protocol bypass（javascript:/data:/file: 等）
    if (u.username !== '' || u.password !== '') return null; // userinfo（ncat.example@evil.com）
    if (u.search !== '' || u.hash !== '') return null;   // 不允许 query/hash
    if (!site.hosts[u.hostname]) return null;            // 最终 host 必须在白名单
    if (u.origin !== base.origin) return null;           // origin 必须与白名单 base 一致
    return u.href;
  }

  /* ---------- 4. health.json 校验（Fail Closed 安全决策数据 + 与 sites 的绑定）----------
   * 状态组合合法性（非法组合 → DENY）：
   *   healthy + AUTOMATED_HEALTHY（automated 模式全部必要检查 PASS）
   *   healthy + MANUAL_VERIFIED（manual 模式机器基础门 PASS + 明确 WAF 阻断，内容由人工许可承接）
   *   disabled + DISABLED
   * 注意：healthy 表示机器基础安全门与当前 verificationMode 所要求的安全条件成立；
   * 【不】意味着内容级自动检查 PASS。manual 分支不要求 http/redirectChain/fingerprint/
   * riskScan 的 ok（内容被 WAF 阻断，由人工限时 permit 承接）；但 DNS/TLS 机器门必须 PASS。
   */
  function validateHealth(healthData, now, siteId, site, binding) {
    if (!isPlainObject(healthData)) return deny('no_health_record');
    if (healthData.schemaVersion !== 2) return deny('health_schema_version_' + String(healthData.schemaVersion));

    // health ↔ sites 绑定：任一不一致 → DENY（watchdog 生成时记录，客户端复验）
    if (!isPlainObject(binding)) return deny('health_binding_missing');
    if (healthData.configVersion !== binding.configVersion) return deny('config_version_mismatch');

    var generatedAt = Date.parse(healthData.generatedAt);
    if (isNaN(generatedAt)) return deny('invalid_generated_at');
    var ttlHours = Number(healthData.ttlHours);
    if (!(ttlHours > 0)) return deny('invalid_ttl');
    if (now - generatedAt > ttlHours * 3600000) return deny('health_expired');
    // 时钟异常（Fail Closed）：浏览器时钟早于 health 生成时间 → 拒绝。
    // 防止回拨时钟把本应过期的 health 长期当成新鲜（与 permit 的 now<issued 检查互补，
    // 双重收窄「回拨时钟」可造成的放行窗口）。
    if (now < generatedAt) return deny('invalid_generated_at');

    if (!isPlainObject(healthData.sites)) return deny('health_sites_missing');
    var health = healthData.sites[siteId] || null;
    if (!isPlainObject(health)) return deny('no_health_record');
    if (health.status !== 'healthy') return deny('health_status_' + (health.status || 'unknown'));

    // 站点记录必须携带与当前配置一致的绑定字段（缺失/不一致视为数据损坏或篡改）
    if (health.siteConfigHash !== binding.siteConfigHash) return deny('site_config_hash_mismatch');
    if (health.approvedHost !== binding.approvedHost) return deny('health_host_mismatch');
    // verificationMode 一致性：health 记录的 mode 必须与站点配置一致（缺失/不符 → 数据损坏/篡改）
    if (health.verificationMode !== site.verificationMode) return deny('health_mode_mismatch');

    var checks = health.checks;
    if (!isPlainObject(checks)) return deny('checks_missing');

    // healthState 合法性：healthy 状态只允许 AUTOMATED_HEALTHY / MANUAL_VERIFIED。
    // 分支选择按 healthState（而不是按站点 verificationMode）：
    //   - MANUAL_VERIFIED 仅允许 manual 站点 + BLOCKED_BY_WAF（内容由人工 permit 承接）；
    //   - AUTOMATED_HEALTHY 要求内容组全 PASS —— automated 站点；manual 站点若其内容
    //     能被机器完整确认（watchdog 会生成 AUTOMATED_HEALTHY + PASS），同样走此分支。
    var hs = health.healthState;
    if (hs !== HS_AUTOMATED && hs !== HS_MANUAL) return deny('health_state_illegal');

    if (hs === HS_MANUAL) {
      // ---- MANUAL_VERIFIED 分支：manual 站点 + BLOCKED_BY_WAF；DNS/TLS 机器门必须 PASS ----
      if (site.verificationMode !== VM_MANUAL) return deny('health_state_illegal');
      if (health.automatedContentCheck !== ACC_WAF) return deny('content_check_not_blocked');
      var mdns = checks.dns, mtls = checks.tls;
      if (!isPlainObject(mdns) || mdns.ok !== true) return deny('dns_failed');
      if (!isPlainObject(mtls) || mtls.ok !== true) return deny('tls_failed');
      // 内容组（http/redirectChain/fingerprint/riskScan）不要求 ok：内容被 WAF 阻断，
      // 由人工限时 maintenancePermit 承接（validatePermit 已强制人工字段）。
    } else {
      // ---- AUTOMATED_HEALTHY 分支：必须 ACC_PASS + 内容组全 PASS ----
      if (health.automatedContentCheck !== ACC_PASS) return deny('content_check_failed');
      // 必填检查项：任一缺失 / ok!==true → DENY（数据损坏 / 篡改 / 检查失败一律拒绝）
      var required = ['dns', 'tls', 'http', 'redirectChain', 'fingerprint', 'riskScan'];
      for (var i = 0; i < required.length; i++) {
        var c = checks[required[i]];
        if (!isPlainObject(c) || c.ok !== true) return deny(required[i] + '_failed');
      }

      // redirect chain 逐跳复验：健康状态必须携带非空 hops，逐跳只允许 approved host + 人工批准的 allowedRedirectHosts
      var rc = checks.redirectChain;
      if (!isPlainObject(rc) || rc.ok !== true) return deny('redirect_chain_failed');
      if (!Array.isArray(rc.hops) || rc.hops.length === 0) return deny('redirect_chain_invalid');
      for (var h = 0; h < rc.hops.length; h++) {
        var hu;
        try { hu = new URL(rc.hops[h]); } catch (e) { return deny('redirect_invalid_hop'); }
        if (hu.protocol !== 'https:') return deny('redirect_unknown_host');
        if (hu.username !== '' || hu.password !== '') return deny('redirect_invalid_hop'); // userinfo 异常
        if (!site.hosts[hu.hostname] && !site.allowedRedirectHosts[hu.hostname]) {
          return deny('redirect_unknown_host');
        }
      }
    }

    // Threat Intelligence：not_configured / safe 为通过；MALICIOUS/SUSPICIOUS/TIMEOUT/UNAVAILABLE/RATE_LIMITED 全 DENY。
    // not_configured 只表示"未接入该检查"，绝不当作"该网站更安全"的证据。
    var ti = checks.threatIntel;
    if (!isPlainObject(ti) || typeof ti.status !== 'string' || ti.status === '') {
      return deny('threat_intel_missing');
    }
    if (ti.status !== 'not_configured' && ti.status !== 'safe') {
      return deny('threat_intel_' + ti.status);
    }

    return { ok: true };
  }

  /* ---------- 5. 主入口：任何条件不满足 → DENY ---------- */
  function evaluateWatch(movie, sitesData, healthData, opts) {
    opts = opts || {};
    var now = typeof opts.now === 'number' ? opts.now : Date.now();

    // 5.1 movie 本体 + watch 映射
    if (!isPlainObject(movie) || typeof movie.id !== 'string' || movie.id === '') {
      return deny('movie_invalid');
    }
    var watch = movie.watch;
    if (!isPlainObject(watch) || typeof watch.site !== 'string' || watch.site === '') {
      return deny('no_watch_mapping');
    }
    var path = validatePath(watch.path);
    if (path === null) return deny('invalid_path');

    // 5.2 sites.json v2（allowlist + configVersion）
    if (!isPlainObject(sitesData) || sitesData.schemaVersion !== 2 || !Array.isArray(sitesData.sites)) {
      return deny('sites_invalid');
    }
    if (!Number.isInteger(sitesData.configVersion) || sitesData.configVersion <= 0) {
      return deny('sites_config_version_invalid');
    }
    var site = null;
    for (var i = 0; i < sitesData.sites.length; i++) {
      var s = sitesData.sites[i];
      if (isPlainObject(s) && s.id === watch.site) { site = s; break; }
    }
    if (!site) return deny('site_not_in_allowlist');
    // 非 healthy 状态细分，便于确认页给出符合约定文案：
    //   pending_verification → “站点正在进行安全维护”；其余非 healthy（含 disabled）→ “在线观看暂不可用”。
    if (site.status === 'pending_verification') return deny('site_pending_verification');
    if (site.status !== 'healthy') return deny('site_disabled');
    var vs = validateSite(site);
    if (!vs) return deny('site_disabled_or_invalid');
    var siteHash = computeSiteConfigHash(site);
    if (siteHash === null) return deny('site_config_invalid');

    // 5.3 Maintenance Permit（必要安全条件：任何不符 → DENY，之后才继续其他检查）
    var permit = validatePermit(site, sitesData.configVersion, now);
    if (!permit.ok) return permit;

    // 5.4 URL 构建
    var url = buildUrl(vs, path);
    if (url === null) return deny('url_build_failed');

    // 5.5 health.json（安全决策数据 + 与当前配置的绑定校验）
    var baseHost = hostnameOf(vs.baseUrl);
    var hv = validateHealth(healthData, now, watch.site, vs, {
      configVersion: sitesData.configVersion,
      siteConfigHash: siteHash,
      approvedHost: baseHost
    });
    if (!hv.ok) return hv;

    return { ok: true, url: url, host: hostnameOf(url) };
  }

  /* ===================== 浏览器页面层（离站确认页） ===================== */

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function renderRoot(root, inner) {
    root.innerHTML = inner;
    return root;
  }

  function renderConfirm(root, movie, verdict) {
    renderRoot(root,
      '<div class="wc-card">' +
        '<h2 class="wc-title">即将离开本站</h2>' +
        '<p class="wc-lead">即将离开本站并访问第三方网站。</p>' +
        '<div class="wc-row"><span class="wc-label">电影名称</span><span class="wc-value">' + escapeHtml(movie.name) + '</span></div>' +
        '<div class="wc-row"><span class="wc-label">即将访问</span><span class="wc-value wc-host">' + escapeHtml(verdict.host) + '</span></div>' +
        '<p class="wc-disclaimer">本站不控制该网站的内容、安全性或合法性。访问前请自行判断。</p>' +
        '<p class="wc-note">本入口仅表示本站收录了该影片的第三方观看链接，不构成对该网站内容、安全或合法性的任何保证。</p>' +
        '<div class="wc-actions">' +
          '<button type="button" id="wc-confirm" class="wc-btn wc-primary">继续访问</button>' +
          '<button type="button" id="wc-back" class="wc-btn">返回</button>' +
        '</div>' +
      '</div>'
    );
    var go = document.getElementById('wc-confirm');
    if (go) {
      go.addEventListener('click', function () {
        // verdict.url 已在全部校验通过后构建，非用户输入
        window.location.assign(verdict.url);
      });
    }
    bindBack(root);
  }

  // 不同 DENY 原因对应的友好文案（默认走通用文案）。不声称「安全/官方/合法」。
  var BLOCKED_MESSAGES = {
    site_pending_verification: '在线观看暂不可用。站点正在进行安全维护。',
    site_disabled: '在线观看暂不可用。',
    permit_missing: '该站点正处于维护审批中，本站不会跳转到第三方网站。',
    permit_expired: '今日安全维护尚未完成，请稍后再试。',
    permit_config_version_mismatch: '在线观看暂不可用。站点安全校验更新中。',
    permit_hash_mismatch: '在线观看暂不可用。站点配置已更新，维护许可未同步。',
    permit_host_mismatch: '在线观看暂不可用。站点域名与维护许可不一致。',
    permit_invalid: '在线观看暂不可用。维护许可数据异常。',
    permit_mode_mismatch: '在线观看暂不可用。维护许可与站点核验模式不一致。',
    permit_invalid_expiry: '在线观看暂不可用。维护许可时间数据异常。',
    permit_ttl_out_of_range: '在线观看暂不可用。维护许可有效期不在允许范围。',
    permit_attestation_missing: '在线观看暂不可用。人工核验确认信息不完整。',
    config_version_mismatch: '在线观看暂不可用。站点安全校验数据更新中。',
    site_config_hash_mismatch: '在线观看暂不可用。站点安全校验数据与配置不一致。',
    health_host_mismatch: '在线观看暂不可用。站点安全校验域名与配置不一致。',
    health_mode_mismatch: '在线观看暂不可用。站点安全校验数据与核验模式不一致。',
    health_state_illegal: '在线观看暂不可用。站点安全校验状态组合异常。',
    content_check_failed: '在线观看暂不可用。站点自动内容检查未通过。',
    content_check_not_blocked: '在线观看暂不可用。站点安全校验状态异常。',
    site_disabled_or_invalid: '在线观看暂不可用。',
    default: '在线观看暂不可用。'
  };

  function renderBlocked(root, reason) {
    var msg = BLOCKED_MESSAGES[reason] || BLOCKED_MESSAGES.default;
    renderRoot(root,
      '<div class="wc-card wc-blocked">' +
        '<h2 class="wc-title">该观看链接暂不可用</h2>' +
        '<p class="wc-lead">' + escapeHtml(msg) + '</p>' +
        '<p class="wc-reason">原因：<code>' + escapeHtml(reason) + '</code></p>' +
        '<p class="wc-note">宁可链接不可用，也不会把未经验证的第三方网站带给你。</p>' +
        '<div class="wc-actions">' +
          '<button type="button" id="wc-back" class="wc-btn">返回</button>' +
        '</div>' +
      '</div>'
    );
    bindBack(root);
  }

  function renderError(root) {
    renderRoot(root,
      '<div class="wc-card wc-blocked">' +
        '<h2 class="wc-title">该观看链接暂不可用</h2>' +
        '<p class="wc-lead">安全校验数据无法读取，本站不会跳转到第三方网站。</p>' +
        '<div class="wc-actions">' +
          '<button type="button" id="wc-back" class="wc-btn">返回</button>' +
        '</div>' +
      '</div>'
    );
    bindBack(root);
  }

  function bindBack(root) {
    var back = root.querySelector('#wc-back');
    if (back) {
      back.addEventListener('click', function () {
        if (window.history && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/';
        }
      });
    }
  }

  /* 确认页初始化：/watch/?movie=<id>，movie 仅作 movies.json 的 key 查找，
     任何未命中 / 校验失败 → 渲染不可用态，绝不跳转。 */
  function initConfirmPage() {
    var root = document.getElementById(CONFIRM_ROOT_ID);
    if (!root) return;

    var params = new URLSearchParams(window.location.search || '');
    var movieId = params.get('movie');

    Promise.all([fetchJson(DATA_SOURCES.movies), fetchJson(DATA_SOURCES.sites), fetchJson(DATA_SOURCES.health)])
      .then(function (results) {
        var movies = results[0];
        var movie = null;
        if (Array.isArray(movies) && typeof movieId === 'string') {
          for (var i = 0; i < movies.length; i++) {
            if (movies[i] && movies[i].id === movieId) { movie = movies[i]; break; }
          }
        }
        var verdict = evaluateWatch(movie, results[1], results[2]);
        if (!verdict.ok) {
          renderBlocked(root, verdict.reason);
          return;
        }
        renderConfirm(root, movie, verdict);
      })
      .catch(function () {
        renderError(root);
      });
  }

  /* 自初始化：仅当页面存在 #watch-confirm 时运行（只在确认页加载本脚本） */
  function autoInit() {
    if (document.getElementById(CONFIRM_ROOT_ID)) {
      initConfirmPage();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      autoInit();
    }
  }

  return {
    evaluateWatch: evaluateWatch,
    validatePath: validatePath,
    validateSite: validateSite,
    buildUrl: buildUrl,
    validateHealth: validateHealth,
    validatePermit: validatePermit,
    computeSiteConfigHash: computeSiteConfigHash,
    sha256Hex: sha256Hex,
    hostnameOf: hostnameOf,
    SECURITY_FIELDS: SECURITY_FIELDS.slice(),
    initConfirmPage: initConfirmPage,
    DATA_SOURCES: DATA_SOURCES
  };
});
