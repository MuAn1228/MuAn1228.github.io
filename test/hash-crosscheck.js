/* ===== siteConfigHash 跨 Python/JavaScript 一致性测试 =====
 *
 * 目标：watch.js 的 computeSiteConfigHash 与 watchdog_check.py 的
 * compute_site_config_hash 必须对同一 site config 产生完全一致的 SHA-256。
 *
 * 数据来源：
 *   test/hash-crosscheck/fixtures.json   夹具（覆盖 ASCII/Unicode/nested/array/null/bool/
 *                                        number/key order/field omission/verificationMode）
 *   test/hash-crosscheck/expected.json   Python 侧 golden（由 ref.py 生成）
 *
 * 验证方式（三份独立证据）：
 *   1. watch.js computeSiteConfigHash  === expected.json（Python）
 *   2. 独立 canonical JSON（本文件实现）+ node:crypto SHA-256 === expected.json
 *   3. 独立 canonical JSON + node:crypto === watch.js 哈希（互相印证）
 *   4. key_order_a / key_order_b 哈希必须相等（键顺序无关）
 *   7. mode_automated / mode_manual 哈希必须不同（verificationMode 参与哈希，
 *      仅模式不同的配置必须产生不同 siteConfigHash）
 *
 * 若 expected.json 过期，先运行：
 *   python test/hash-crosscheck/ref.py
 *
 * 运行：
 *   node test/hash-crosscheck.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const WatchGate = require(path.join(__dirname, '..', 'source', 'js', 'watch.js'));

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'hash-crosscheck', 'fixtures.json'), 'utf8'));
const EXPECTED = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'hash-crosscheck', 'expected.json'), 'utf8'));

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

// 独立 canonical 序列化（不依赖 watch.js，仅作为第二份证据）
function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v !== null && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach(function (k) { out[k] = canonicalize(v[k]); });
    return out;
  }
  return v;
}
function independentCanonicalJson(site) {
  const SEC = ['id', 'status', 'baseUrl', 'hosts', 'allowedRedirectHosts', 'baseline', 'verificationMode'];
  const c = {};
  SEC.forEach(function (k) { if (site.hasOwnProperty(k)) c[k] = site[k]; });
  return JSON.stringify(canonicalize(c));
}

/* ---------- 1. 逐 case：watch.js hash === Python golden ---------- */
console.log('== 1. watch.js hash vs Python golden ==');
for (const c of FIXTURES.cases) {
  const name = c.name;
  const jsHash = WatchGate.computeSiteConfigHash(c.site);
  const pyHash = EXPECTED.cases[name];
  assert(pyHash !== undefined, 'fixture[' + name + '] 在 expected.json 中存在');
  assert(typeof jsHash === 'string' && /^[0-9a-f]{64}$/.test(jsHash),
    'fixture[' + name + '] hash 为 64 位 hex', String(jsHash));
  assert(jsHash === pyHash, 'fixture[' + name + '] JS hash === Python golden',
    'js=' + jsHash + ' py=' + pyHash);
}

/* ---------- 2. 独立 canonical + node crypto === Python golden ---------- */
console.log('\n== 2. 独立 canonical(JS) + node crypto vs Python golden ==');
for (const c of FIXTURES.cases) {
  const name = c.name;
  const canon = independentCanonicalJson(c.site);
  const nodeHash = crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
  const pyHash = EXPECTED.cases[name];
  assert(nodeHash === pyHash, 'canon[' + name + '] node-crypto === Python golden',
    'node=' + nodeHash + ' py=' + pyHash);
}

/* ---------- 3. watch.js hash === 独立 canonical + node crypto ---------- */
console.log('\n== 3. watch.js hash vs 独立 canonical + node crypto ==');
for (const c of FIXTURES.cases) {
  const name = c.name;
  const jsHash = WatchGate.computeSiteConfigHash(c.site);
  const canon = independentCanonicalJson(c.site);
  const nodeHash = crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
  assert(jsHash === nodeHash, 'cross[' + name + '] watch.js === node-crypto',
    'js=' + jsHash + ' node=' + nodeHash);
}

/* ---------- 4. 键顺序无关：key_order_a === key_order_b ---------- */
console.log('\n== 4. key order 不变性 ==');
const a = FIXTURES.cases.find(function (c) { return c.name === 'key_order_a'; });
const b = FIXTURES.cases.find(function (c) { return c.name === 'key_order_b'; });
assert(a && b, '存在 key_order_a / key_order_b 夹具');
if (a && b) {
  const ha = WatchGate.computeSiteConfigHash(a.site);
  const hb = WatchGate.computeSiteConfigHash(b.site);
  assert(ha === hb, 'key_order_a hash === key_order_b hash（键顺序无关）', 'a=' + ha + ' b=' + hb);
}

/* ---------- 5. SHA-256 已知向量（自检 watch.js 实现） ---------- */
console.log('\n== 5. SHA-256 已知向量 ==');
assert(WatchGate.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'sha256("abc") 正确', WatchGate.sha256Hex('abc'));
assert(WatchGate.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'sha256("") 正确', WatchGate.sha256Hex(''));
const unicodeVec = crypto.createHash('sha256').update('网飞猫在线电影导航站', 'utf8').digest('hex');
assert(WatchGate.sha256Hex('网飞猫在线电影导航站') === unicodeVec,
  'sha256(Unicode) === node crypto', WatchGate.sha256Hex('网飞猫在线电影导航站'));

/* ---------- 6. 安全字段集合一致性（固定清单，防止误改） ---------- */
console.log('\n== 6. SECURITY_FIELDS 固定 ==');
assert(JSON.stringify(WatchGate.SECURITY_FIELDS) ===
  JSON.stringify(['id', 'status', 'baseUrl', 'hosts', 'allowedRedirectHosts', 'baseline', 'verificationMode']),
  'watch.js SECURITY_FIELDS 与约定一致', JSON.stringify(WatchGate.SECURITY_FIELDS));

/* ---------- 7. verificationMode 参与哈希（mode_automated != mode_manual） ---------- */
console.log('\n== 7. verificationMode 参与哈希 ==');
const ma = FIXTURES.cases.find(function (c) { return c.name === 'mode_automated'; });
const mm = FIXTURES.cases.find(function (c) { return c.name === 'mode_manual'; });
assert(ma && mm, '存在 mode_automated / mode_manual 夹具');
if (ma && mm) {
  const ha = WatchGate.computeSiteConfigHash(ma.site);
  const hb = WatchGate.computeSiteConfigHash(mm.site);
  assert(ha !== hb, 'mode_automated hash !== mode_manual hash（verificationMode 必须参与哈希）',
    'auto=' + ha + ' manual=' + hb);
}

/* ---------- 汇总 ---------- */
console.log('\n===== hash-crosscheck 结果 =====');
console.log('PASS: ' + passed + '  FAIL: ' + failed);
if (failed > 0) {
  console.log('\n失败用例:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
} else {
  console.log('全部通过：Python / JavaScript 对同一 site config 的 SHA-256 完全一致。');
  process.exit(0);
}
