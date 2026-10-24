#!/usr/bin/env node
/*
 * 私密文章加密脚本（仅在本机使用，不会把内容/口令推送到任何地方）
 *
 * 用法：
 *   node tools/private-encrypt.js                 # 交互输入口令（隐藏显示）
 *   node tools/private-encrypt.js --dry-run       # 只验证明文与图片可读，不写密文
 *   node tools/private-encrypt.js --demo         # 固定测试口令（仅用于本地联调，切勿用于真实内容）
 *
 * 输出：source/data/private/essays.json（AES-256-GCM 密文，公开仓库中不含任何明文）
 * 算法：PBKDF2-SHA256(口令, salt, 600000 次) 派生 256 位密钥；每篇文章独立随机 IV；
 *       同名 `salt` 全局唯一，保证浏览器可借助派生密钥一次性解出全部文章。
 *
 * 明文来源约定：
 *   - 前两篇（我的爱情观 / 我的世界观）无图，从本地 Obsidian 备份读取。
 *   - 《我的前半生》含 25 张图，明文取自 Obsidian 备份（公开仓库里的博客源文件已永久删除）。
 *     Obsidian 用 ![[<md5>.jpg]] 内嵌图片，脚本先转成 <img> 再逐张内联为 data:image；
 *     原图优先读 D:\photo\wodeqianbansheng\，缺失时回退 Obsidian attachments。
 *     图片用 sharp 压缩为 720w WebP 后整体加密（仓库中不存在任何公开图片文件）。
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');

const ITER = 600000;
const KEYLEN = 32; // 256 bit AES 密钥
const SALT_LEN = 16;
const IV_LEN = 12;
const OUT_DIR = path.join(__dirname, '..', 'source', 'data', 'private');
const OUT_FILE = path.join(OUT_DIR, 'essays.json');

// 需要加密的文章
const DEFAULT_DIR = 'D:\\obsidian\\Obsidian Vault\\博客文章';
const ATTACH_DIR = 'D:\\obsidian\\Obsidian Vault\\attachments';
const ITEMS = [
  { id: 'love',      title: '我的爱情观', date: '2026-08-16' },
  { id: 'worldview', title: '我的世界观', date: '2026-08-21' },
  {
    id: 'first-half',
    title: '我的前半生',
    date: '2026-08-21',
    // 明文取自 Obsidian 备份，图片引用是 ![[<md5>.jpg]]，需要先转换再内联
    srcFile: path.join(DEFAULT_DIR, '我的前半生.md'),
    imgDir: 'D:\\photo\\wodeqianbansheng',
    imgRef: '/img/wodeqianbansheng/',
    wikiEmbeds: true,
  },
];

function base64(buf) { return buf.toString('base64'); }
function check(ok, msg) {
  if (!ok) { console.error('[private-encrypt] ' + msg); process.exit(1); }
}

function askPassHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function (str) {
      // 回显星号而不是明文
      if (str === prompt) { rl.output.write(prompt); return; }
      rl.output.write('*');
    };
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Obsidian 附件可能带重名副本后缀（"xxxx 1.jpg"），统一回 md5 原名
function normalizeImgName(name) {
  return name.trim().replace(/\s+\d+(?=\.\w+$)/, '');
}

// 原图优先取本地备份，缺失时回退 Obsidian attachments
function resolveImg(it, name) {
  const primary = path.join(it.imgDir, name);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(ATTACH_DIR, name);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

// 读取《我的前半生》正文：剥掉 front matter，图片替换为 base64 内联
async function loadFileItem(it) {
  check(fs.existsSync(it.srcFile), `找不到明文文件：${it.srcFile}`);
  let md = fs.readFileSync(it.srcFile, 'utf8');
  md = md.replace(/^---[\s\S]*?---\s*/, ''); // 去掉 front matter

  // ![[xxx.jpg]] → <img src="/img/wodeqianbansheng/xxx.jpg" loading="lazy">
  if (it.wikiEmbeds) {
    md = md.replace(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, (all, raw) => {
      return `<img src="${it.imgRef}${normalizeImgName(raw)}" loading="lazy">`;
    });
  }

  const re = new RegExp('<img\\s+src="' + escapeRe(it.imgRef) + '([^"]+)"\\s+loading="lazy">', 'g');
  const used = new Set();
  let m;
  while ((m = re.exec(md)) !== null) {
    const name = m[1];
    used.add(name);
    const src = resolveImg(it, name);
    check(!!src, `缺图：${name}（${it.imgDir} 与 ${ATTACH_DIR} 都没有）`);
    const webp = await sharp(src).resize({ width: 720 }).webp({ quality: 82 }).toBuffer();
    const dataUri = 'data:image/webp;base64,' + base64(webp);
    md = md.split(m[0]).join(`<img src="${dataUri}" loading="lazy">`);
  }
  console.log(`[private-encrypt] ${it.title}：内联图片 ${used.size} 张`);
  return md;
}

function readIt(srcDir) {
  return async (it) => {
    if (it.srcFile) {
      return { ...it, text: await loadFileItem(it) };
    }
    const f = path.join(srcDir, it.title + '.md');
    check(fs.existsSync(f), `找不到明文文件：${f}`);
    return { ...it, text: fs.readFileSync(f, 'utf8') };
  };
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const dryRun = args.includes('--dry-run');
  const dirArg = args.indexOf('--dir');
  const srcDir = dirArg >= 0 ? args[dirArg + 1] : DEFAULT_DIR;
  // 口令优先级：环境变量 PRIVATE_ESSAYS_PASS（本机临时设置，不进命令行历史）> 交互输入
  const pass = dryRun ? '' : (process.env.PRIVATE_ESSAYS_PASS || (demo
    ? 'demo-pw-2026-Blog@private'
    : await askPassHidden('请输入文章口令（建议至少 12 位，含大小写与数字）：')));
  if (!dryRun && !demo && !process.env.PRIVATE_ESSAYS_PASS) {
    const again = await askPassHidden('请再次输入确认：');
    check(pass === again && pass.length > 0, '两次输入不一致或为空');
    check(pass.length >= 8, '口令过短（至少 8 位，强烈建议 12 位以上）');
  }

  // 读取明文
  const rd = readIt(srcDir);
  const contents = [];
  for (const it of ITEMS) contents.push(await rd(it));

  // --dry-run：只验证明文与图片能否全部读到，不写文件
  if (dryRun) {
    contents.forEach((c) => console.log(`[private-encrypt] --dry-run ${c.title}：正文 ${c.text.length} 字符`));
    console.log('[private-encrypt] --dry-run 未写出 essays.json');
    return;
  }

  // 全局唯一 salt（供浏览器统一派生密钥）
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, ITER, KEYLEN, 'sha256');

  const items = contents.map((c) => {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(c.text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { id: c.id, title: c.title, date: c.date, iv: base64(iv), tag: base64(tag), ct: base64(ct) };
  });

  const db = { v: 1, alg: 'PBKDF2-SHA256+AES-256-GCM', iter: ITER, salt: base64(salt), items };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`[private-encrypt] 已写出 ${OUT_FILE}`);
  console.log(`[private-encrypt] 共 ${items.length} 篇文章已加密（密文大小 ${items.reduce((s, i) => s + i.ct.length, 0)} 字符，不含任何明文）`);
  if (demo) console.log('[private-encrypt] 注意：这是 --demo 测试密文，真实使用请勿带 --demo 运行！');
}

main().catch((e) => { console.error(e); process.exit(1); });