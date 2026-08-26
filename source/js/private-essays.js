/*
 * 私密文章解密器（/private/）
 * 数据：/data/private/essays.json —— 仓库中只有 AES-256-GCM 密文
 * 流程：输入口令 → PBKDF2-SHA256 派生密钥 → 解密 → 本地浏览器渲染（明文只存在于当前 tab）
 * 记住：成功解密后派生密钥（非口令本身）缓存到 localStorage，同口令文章可直接打开
 */
(function () {
  'use strict';

  if (!/\/private\/?($|\?|#)/.test(window.location.pathname)) return;

  var app = document.getElementById('private-app');
  if (!app) return;

  var DB = null;
  var SAVED_KEY = 'private-key-v1';
  var curKey = null; // CryptoKey（从 localStorage 或口令派生）

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function loadDB() {
    if (DB) return DB;
    var r = await fetch('/data/private/essays.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('数据加载失败');
    DB = await r.json();
    return DB;
  }

  async function deriveKeyFromPass(pass) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']
    );
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64ToBytes(DB.salt), iterations: DB.iter, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  async function decryptItem(item, key) {
    var iv = b64ToBytes(item.iv);
    var tag = b64ToBytes(item.tag);
    var ct = b64ToBytes(item.ct);
    var buf = new Uint8Array(ct.length + tag.length);
    buf.set(ct, 0);
    buf.set(tag, ct.length);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, buf);
    return new TextDecoder().decode(pt);
  }

  // 记住派生密钥（salt 匹配才可直接复用）
  function saveKey(key) {
    try {
      crypto.subtle.exportKey('raw', key).then(function (raw) {
        var packed = { salt: DB.salt, key: btoa(String.fromCharCode.apply(null, raw)) };
        localStorage.setItem(SAVED_KEY, JSON.stringify(packed));
      }).catch(function () {});
    } catch (e) { /* 隐私模式下忽略 */ }
  }
  async function loadSavedKey() {
    var packed = null;
    try { packed = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null'); } catch (e) { return null; }
    if (!packed || !packed.key || packed.salt !== DB.salt) return null;
    try {
      return await crypto.subtle.importKey(
        'raw', b64ToBytes(packed.key), { name: 'AES-GCM' }, false, ['decrypt']
      );
    } catch (e) { return null; }
  }

  // —— 简易 markdown 渲染（覆盖博客文章用到的子集）——
  // 图片只允许解密后内联的 data:image 标签；其余 <img> 一律不渲染，防止任何外链
  function renderMd(md) {
    var imgs = [];
    md = md.replace(/<img\s+src="(data:image\/[^"]+)"(?:\s+[^>]*)?>/g, function (all, src) {
      var idx = imgs.length;
      imgs.push('<img src="' + src + '" loading="lazy" alt="">');
      return '\uE000' + idx + '\uE001';
    });
    var escaped = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var html = escaped
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener nofollow">$1</a>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\uE000(\d+)\uE001/g, function (_, i) { return imgs[+i] || ''; });
    return html.split(/\n{2,}/).map(function (blk) {
      var t = blk.trim();
      if (!t) return '';
      if (/^<(h[123]|hr|blockquote|ul|ol|pre|img)\b/.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }

  // —— UI ——
  function renderList() {
    app.innerHTML = '';
    var wrap = el('div', 'private-app-inner');
    var head = el('div', 'private-head', '<span class="private-eyebrow">PRIVATE</span><h1 class="private-title">私密文章</h1><p class="private-sub">输入口令后解锁阅读，正文仅在你浏览器中解密。</p>');
    wrap.appendChild(head);
    var grid = el('div', 'private-list');
    DB.items.forEach(function (it) {
      var card = el('button', 'private-card', '<span class="private-card-title">' + it.title + '</span><span class="private-card-date">' + it.date + '</span>');
      card.addEventListener('click', function () { openArticle(it); });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    app.appendChild(wrap);
  }

  function showPwd(callback) {
    var box = el('div', 'private-pwd');
    box.innerHTML = '<div class="private-pwd-box"><input type="password" class="private-pwd-input" placeholder="输入口令" autocomplete="off"><button class="private-pwd-btn" type="button">解锁</button><p class="private-pwd-err" hidden>口令错误，请重试。</p></div>';
    var input = $('.private-pwd-input', box);
    var btn = $('.private-pwd-btn', box);
    var err = $('.private-pwd-err', box);
    function submit() {
      var pass = input.value;
      if (!pass) return;
      btn.disabled = true;
      deriveKeyFromPass(pass).then(function (key) {
        return callback(key, function (ok) {
          if (ok) { curKey = key; saveKey(key); }
          else { err.hidden = false; btn.disabled = false; }
        });
      }).catch(function () { err.hidden = false; btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    input.focus();
    return box;
  }

  function openArticle(item) {
    var view = el('div', 'private-view');
    var back = el('button', 'private-back', '‹ 返回列表');
    back.addEventListener('click', renderList);
    view.appendChild(back);

    var need = function () {
      view.appendChild(showPwd(function (key, done) {
        decryptItem(item, key).then(function (text) {
          done(true);
          renderArticle(view, item, text);
        }).catch(function () { done(false); });
      }));
      app.innerHTML = '';
      app.appendChild(view);
    };

    if (curKey) {
      decryptItem(item, curKey).then(function (text) {
        renderArticle(view, item, text);
      }).catch(function () { useSavedThen(item, view, need); });
    } else {
      useSavedThen(item, view, need);
    }
  }

  function useSavedThen(item, view, need) {
    loadSavedKey().then(function (saved) {
      if (saved) {
        decryptItem(item, saved).then(function (text) {
          curKey = saved;
          renderArticle(view, item, text);
        }).catch(function () { need(); });
      } else {
        need();
      }
    }).catch(function () { need(); });
  }

  function renderArticle(view, item, text) {
    view.innerHTML = '';
    var back = el('button', 'private-back', '‹ 返回列表');
    back.addEventListener('click', renderList);
    view.appendChild(back);
    var art = el('article', 'private-article');
    var title = el('h1', 'private-article-title', item.title);
    var body = el('div', 'private-article-body');
    body.innerHTML = renderMd(text);
    art.appendChild(title);
    art.appendChild(body);
    view.appendChild(art);
    app.innerHTML = '';
    app.appendChild(view);
    window.scrollTo(0, 0);
  }

  // —— 启动 ——
  loadDB().then(function () {
    renderList();
    curKey = null; // 列表页不预解，进入文章时再复用缓存密钥
  }).catch(function () {
    app.innerHTML = '<div class="private-msg">私密数据暂不可用。</div>';
  });
})();