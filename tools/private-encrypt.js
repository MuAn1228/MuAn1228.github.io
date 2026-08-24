#!/usr/bin/env node
/*
 * 私密文章加密脚本（仅在本机使用，不会把内容/口令推送到任何地方）
 *
 * 用法：
 *   node scripts/private-encrypt.js                 # 交互输入口令（隐藏显示）
 *   node scripts/private-encrypt.js --demo         # 固定测试口令（仅用于本地联调，切勿用于真实内容）
 *
 * 输出：source/data/private/essays.json（AES-256-GCM 密文，公开仓库中不含任何明文）
 * 算法：PBKDF2-SHA256(口令, salt, 600000 次) 派生 256 位密钥；每篇文章独立随机 IV；
 *       同名 `salt` 全局唯一，保证浏览器可借助派生密钥一次性解出全部文章。
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ITER = 600000;
const KEYLEN = 32; // 256 bit AES 密钥
const SALT_LEN = 16;
const IV_LEN = 12;
const OUT_DIR = path.join(__dirname, '..', 'source', 'data', 'private');
const OUT_FILE = path.join(OUT_DIR, 'essays.json');

// 需要加密的文章（默认从本地 Obsidian 备份读取明文，绝不写入仓库）
const DEFAULT_DIR = 'D:\\obsidian\\Obsidian Vault\\博客文章';
const ITEMS = [
  { id: 'love',      title: '我的爱情观', date: '2026-08-16' },
  { id: 'worldview', title: '我的世界观', date: '2026-08-21' },
];

function base64(buf) { return buf.toString('base64'); }

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

function check(ok, msg) {
  if (!ok) { console.error('[private-encrypt] ' + msg); process.exit(1); }
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const dirArg = args.indexOf('--dir');
  const srcDir = dirArg >= 0 ? args[dirArg + 1] : DEFAULT_DIR;
  const pass = demo ? 'demo-pw-2026-Blog@private' : await askPassHidden('请输入文章口令（建议至少 12 位，含大小写与数字）：');
  if (!demo) {
    const again = await askPassHidden('请再次输入确认：');
    check(pass === again && pass.length > 0, '两次输入不一致或为空');
    check(pass.length >= 8, '口令过短（至少 8 位，强烈建议 12 位以上）');
  }

  // 读取明文（Obsidian 备份）
  const contents = [];
  for (const it of ITEMS) {
    const f = path.join(srcDir, it.title + '.md');
    check(fs.existsSync(f), `找不到明文文件：${f}`);
    contents.push({ ...it, text: fs.readFileSync(f, 'utf8') });
  }

  // 全局唯一 salt（供浏览器统一派生密钥）
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, ITER, KEYLEN, 'sha256');

  const items = contents.map((c) => {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(c.text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      id: c.id,
      title: c.title,
      date: c.date,
      iv: base64(iv),
      tag: base64(tag),
      ct: base64(ct),
    };
  });

  const db = { v: 1, alg: 'PBKDF2-SHA256+AES-256-GCM', iter: ITER, salt: base64(salt), items };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`[private-encrypt] 已写出 ${OUT_FILE}`);
  console.log(`[private-encrypt] 共 ${items.length} 篇文章已加密（密文大小 ${items.reduce((s, i) => s + i.ct.length, 0)} 字符，不含任何明文）`);
  if (demo) console.log('[private-encrypt] 注意：这是 --demo 测试密文，真实使用请勿带 --demo 运行！');
}

main().catch((e) => { console.error(e); process.exit(1); });