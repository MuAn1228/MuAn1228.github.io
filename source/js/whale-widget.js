/*!
 * 博客版小鲸鱼看板娘
 *
 * 视觉与交互参考 MeteorNOX/DeepSeek-Balance-Whale-Widget：
 * https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
 * 该项目代码为 MIT；角色素材按其 PROVENANCE 说明随插件原样分发。
 *
 * 本文件是针对博客的改编重写，不依赖 DSH 宿主：
 * - 去掉了余额、记账、每轮消耗、音效组、资源管理等 DSH 专属功能
 * - 保留小鲸鱼 + 代码绘制气泡 + 拖拽吸附 + 左贴镜像 + 按压 Q 弹 + 按压音效
 * - 气泡内容改为博客问候、随机台词与站内快捷入口；设置存 localStorage
 */
(function () {
  'use strict';

  if (window.__blogWhale) return;
  window.__blogWhale = true;

  var STORE_KEY = 'blog-whale-v1';
  var HIDE_KEY = 'blog-whale-hidden';
  var IMG_SRC = '/img/whale/whale-maid.webp';
  var SOUND_PRESS = '/media/whale/press.mp3';
  var SOUND_RELEASE = '/media/whale/release.mp3';

  var DEFAULT_STATE = { scale: 0.9, sound: true, h: 'right', v: 'bottom', x: null, y: null };
  var MARGIN = 8;
  // 右侧留出让位：Butterfly 的 #rightside 工具栏在右边的窄条里，贴右时不要压住它
  var RIGHT_GAP = 60;
  var AUTO_CLOSE = [7000, 7000, 16000];
  var PAGE_COUNT = 3;

  // 各站内入口：与导航栏保持同一套路径
  var LINKS = [
    { t: '展示', h: '/showcase/' },
    { t: '旅行', h: '/travel/' },
    { t: '音乐', h: '/fun/music/' },
    { t: '游戏', h: '/fun/games/' },
    { t: '关于本站', h: '/about-site/' },
    { t: '交易', h: '/finance/' }
  ];

  // 博客版台词：比余额挂件更贴近这个站点
  var QUOTES = [
    '代码写累了，\n就看看海吧。',
    '慢一点也没关系，\n鲸鱼也是慢慢游的。',
    '今天的 bug，\n是明天的经验。',
    '把复杂的事拆开，\n就不那么难了。',
    '别急，你已经\n比昨天走得更远了。',
    '记得喝水，\n也记得抬头看看窗外。',
    '深夜的灵感，\n往往藏在安静里。',
    '每一次重构，\n都是和过去的自己握手。',
    '世界很大，\n先把这一行写完。',
    '写博客的人，\n也在写给未来的自己。',
    '海面很吵，深海很静，\n选一个适合你的节奏。',
    '如果不知道往哪走，\n就先把脚下这一步走稳。'
  ];

  var state = readState();
  var hidden = false;
  try { hidden = sessionStorage.getItem(HIDE_KEY) === '1'; } catch (err) {}
  if (hidden) return;

  var root;
  var img;
  var bubble;
  var copy;
  var menuBtn;
  var menu;

  var bubbleOpen = false;
  var page = 0;
  var closeTimer = 0;
  var clockTimer = 0;
  var renderToken = 0;
  var menuOpen = false;
  var drag = null;
  var lastQuote = -1;

  var hitW = 0;
  var hitH = 0;
  var hitData = null;

  var pressAudio = null;
  var releaseAudio = null;
  var swallowClick = false;

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  function init() {
    buildDom();
    buildMenu();
    bindEvents();
    root.style.setProperty('--whale-scale', String(state.scale));
    applyAnchor(false);
  }

  function buildDom() {
    root = document.createElement('div');
    root.id = 'whale-widget';
    root.className = 'whale-root';
    root.innerHTML =
      '<div class="whale-body">' +
        '<div class="whale-bubble" aria-hidden="true">' +
          '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path class="whale-shape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" ' +
              'd="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
            '<ellipse class="whale-shape whale-shape-1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
            '<ellipse class="whale-shape whale-shape-2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
          '</svg>' +
          '<div class="whale-copy"></div>' +
        '</div>' +
        '<img class="whale-img" alt="小鲸鱼看板娘" draggable="false" decoding="async">' +
      '</div>' +
      '<button type="button" class="whale-menu-btn" aria-label="小鲸鱼菜单" title="小鲸鱼菜单">' +
        '<span></span><span></span><span></span>' +
      '</button>';

    document.body.appendChild(root);

    img = root.querySelector('.whale-img');
    bubble = root.querySelector('.whale-bubble');
    copy = root.querySelector('.whale-copy');
    menuBtn = root.querySelector('.whale-menu-btn');

    img.addEventListener('load', buildHitMap);
    img.src = IMG_SRC;
  }

  function buildMenu() {
    menu = document.createElement('div');
    menu.className = 'whale-menu';
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', '小鲸鱼设置');
    menu.innerHTML =
      '<div class="whale-menu-row"><span>大小</span>' +
        '<input type="range" class="whale-range" min="60" max="200" step="5" aria-label="小鲸鱼大小">' +
        '<span class="whale-pct"></span></div>' +
      '<label class="whale-menu-row"><span>按压音效</span>' +
        '<input type="checkbox" class="whale-check"></label>' +
      '<div class="whale-menu-sep"></div>' +
      '<button type="button" class="whale-act" data-act="reset">回到右下角</button>' +
      '<button type="button" class="whale-act" data-act="hide">隐藏小鲸鱼（本次浏览）</button>' +
      '<div class="whale-credit">角色素材：' +
        '<a href="https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget" target="_blank" rel="noopener noreferrer">MeteorNOX · DeepSeek-Balance-Whale-Widget</a>' +
      '</div>';
    document.body.appendChild(menu);

    var range = menu.querySelector('.whale-range');
    var pct = menu.querySelector('.whale-pct');
    var soundBox = menu.querySelector('.whale-check');

    range.value = String(Math.round(state.scale * 100));
    pct.textContent = Math.round(state.scale * 100) + '%';
    soundBox.checked = !!state.sound;

    range.addEventListener('input', function () {
      setScale(Number(range.value) / 100, false);
    });
    range.addEventListener('change', function () {
      setScale(Number(range.value) / 100, true);
    });
    soundBox.addEventListener('change', function () {
      state.sound = !!soundBox.checked;
      if (!state.sound) stopSounds();
      saveState();
    });

    menu.querySelector('[data-act="reset"]').addEventListener('click', function () {
      state.h = 'right';
      state.v = 'bottom';
      state.x = null;
      state.y = null;
      closeMenu();
      applyAnchor(true);
      saveState();
    });

    menu.querySelector('[data-act="hide"]').addEventListener('click', function () {
      try { sessionStorage.setItem(HIDE_KEY, '1'); } catch (err) {}
      closeMenu();
      closeBubble();
      root.style.display = 'none';
      menu.style.display = 'none';
      showToast('小鲸鱼已隐藏，关闭标签页后恢复');
    });

    menuBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (menuOpen) closeMenu();
      else openMenu();
    });
  }

  function bindEvents() {
    bubble.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link) return;
      advanceBubble();
    });

    bubble.addEventListener('pointerenter', function () {
      clearTimeout(closeTimer);
    });
    bubble.addEventListener('pointerleave', function () {
      if (bubbleOpen) armClose();
    });

    // 鲸鱼身体自己不做 pointer-events，由文档级命中图决定是否拦截：
    // 这样图片矩形里透明的角落不会挡住页面按钮。
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointermove', onHoverMove, { passive: true });
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('contextmenu', onContextMenu, true);

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });

    document.addEventListener('pointerdown', function (e) {
      if (!menuOpen) return;
      if (menu.contains(e.target) || menuBtn.contains(e.target)) return;
      closeMenu();
    }, true);

    // 按下鲸鱼时页面本身也会收到 click（根节点 pointer-events:none），
    // 吞掉这一次 click，避免误触到鲸鱼背后的链接/按钮。
    document.addEventListener('click', function (e) {
      if (!swallowClick) return;
      swallowClick = false;
      if (e.target && e.target.closest && e.target.closest('.whale-menu, .whale-menu-btn')) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {}
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      closeBubble();
    });

    window.addEventListener('resize', function () {
      clearTimeout(bindEvents._resizeTimer);
      bindEvents._resizeTimer = setTimeout(function () {
        applyAnchor(false);
        if (menuOpen) positionMenu();
      }, 120);
    });
  }

  // 菜单、菜单按钮、已展开的气泡各自处理自己的点击，不进入拖拽逻辑
  function isUiTarget(target) {
    return !!(target && target.closest && target.closest('.whale-menu, .whale-menu-btn, .whale-bubble'));
  }

  // 图片本身 pointer-events:none 才能点穿透明角落，
  // 所以悬停要自己用命中图判断，命中鲸鱼时才露出菜单按钮
  var hovering = false;
  function onHoverMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (drag) return;
    var on = menuOpen || hitWhale(e);
    if (on === hovering) return;
    hovering = on;
    root.classList.toggle('whale-menu-visible', on);
  }

  // ---------- 命中图：只让不透明像素接住指针 ----------
  function buildHitMap() {
    try {
      hitW = img.naturalWidth || 0;
      hitH = img.naturalHeight || 0;
      if (!hitW || !hitH) return;
      var canvas = document.createElement('canvas');
      canvas.width = hitW;
      canvas.height = hitH;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      hitData = ctx.getImageData(0, 0, hitW, hitH).data;
    } catch (err) {
      hitData = null;
    }
  }

  function hitWhale(e) {
    if (!hitData) return false;
    var r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var scale = Math.min(r.width / hitW, r.height / hitH);
    var dw = hitW * scale;
    var dh = hitH * scale;
    // object-position: right bottom
    var x0 = r.right - dw;
    var y0 = r.bottom - dh;
    if (e.clientX < x0 || e.clientX > x0 + dw || e.clientY < y0 || e.clientY > y0 + dh) return false;
    var nx = (e.clientX - x0) / dw;
    var ny = (e.clientY - y0) / dh;
    if (root.classList.contains('whale-left')) nx = 1 - nx;
    var px = Math.min(hitW - 1, Math.max(0, Math.floor(nx * hitW)));
    var py = Math.min(hitH - 1, Math.max(0, Math.floor(ny * hitH)));
    return hitData[(py * hitW + px) * 4 + 3] > 12;
  }

  // ---------- 拖拽 / 按压 / 点击 ----------
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isUiTarget(e.target)) return;
    if (!hitWhale(e)) return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}

    closeMenu();
    var r = root.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      w: r.width,
      h: r.height,
      moved: false
    };
    root.classList.add('whale-pressed');
    root.style.transition = 'none';
    playSound('press');
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.sx;
    var dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (dx * dx + dy * dy < 9) return;
      drag.moved = true;
      root.classList.add('whale-dragging');
    }
    var vp = viewport();
    var x = clamp(drag.left + dx, 0, Math.max(0, vp.w - drag.w));
    var y = clamp(drag.top + dy, 0, Math.max(0, vp.h - drag.h));
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    try { e.preventDefault(); } catch (err) {}
  }

  function onPointerUp(e) {
    endDrag(e, false);
  }

  function onPointerCancel(e) {
    endDrag(e, true);
  }

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = drag.moved;
    // 必须在移除 whale-dragging（恢复 transition）之前量位置，
    // 否则浏览器会从上一帧位置开始补间，吸附判定读到的是旧坐标。
    var endRect = moved ? root.getBoundingClientRect() : null;
    drag = null;
    root.classList.remove('whale-pressed', 'whale-dragging');
    root.style.transition = '';
    playSound('release');
    swallowClick = true;
    setTimeout(function () { swallowClick = false; }, 300);
    if (cancelled) {
      if (moved) settleAfterDrag(endRect);
      return;
    }
    if (moved) {
      settleAfterDrag(endRect);
    } else {
      advanceBubble();
    }
  }

  function onContextMenu(e) {
    if (isUiTarget(e.target)) return;
    if (!hitWhale(e)) return;
    try {
      e.preventDefault();
    } catch (err) {}
    openMenu();
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    if (isUiTarget(e.target)) return;
    if (!hitWhale(e.touches[0])) return;
    try { e.preventDefault(); } catch (err) {}
  }

  function onTouchMove(e) {
    if (!drag) return;
    try { e.preventDefault(); } catch (err) {}
  }

  // ---------- 位置 ----------
  function viewport() {
    return {
      w: document.documentElement.clientWidth || window.innerWidth || 375,
      h: document.documentElement.clientHeight || window.innerHeight || 667
    };
  }

  function applyAnchor(animate) {
    var vp = viewport();
    var r = root.getBoundingClientRect();
    var w = r.width || 250;
    var h = r.height || 250;
    var x;
    var y;

    if (state.h === 'left') x = MARGIN;
    else if (state.h === 'right') x = vp.w - w - RIGHT_GAP;
    else x = clamp(Number(state.x) || 0, 0, Math.max(0, vp.w - w));

    if (state.v === 'top') y = MARGIN;
    else if (state.v === 'bottom') y = vp.h - h - MARGIN;
    else y = clamp(Number(state.y) || 0, 0, Math.max(0, vp.h - h));

    state.x = x;
    state.y = y;
    root.style.right = 'auto';
    root.style.bottom = 'auto';

    if (!animate) {
      root.style.transition = 'none';
      root.style.left = x + 'px';
      root.style.top = y + 'px';
      void root.offsetWidth;
      root.style.transition = '';
    } else {
      root.style.left = x + 'px';
      root.style.top = y + 'px';
    }
    root.classList.toggle('whale-left', state.h === 'left');
  }

  function settleAfterDrag(rect) {
    var vp = viewport();
    var r = rect || root.getBoundingClientRect();
    var w = r.width || 250;
    var h = r.height || 250;
    var cx = r.left + w / 2;
    var cy = r.top + h / 2;

    state.h = cx < vp.w / 4 ? 'left' : (cx > vp.w * 3 / 4 ? 'right' : null);
    state.v = cy < vp.h / 4 ? 'top' : (cy > vp.h * 3 / 4 ? 'bottom' : null);
    if (state.h === null) state.x = clamp(r.left, 0, Math.max(0, vp.w - w));
    if (state.v === null) state.y = clamp(r.top, 0, Math.max(0, vp.h - h));

    root.style.transition = '';
    applyAnchor(true);
    saveState();
  }

  function setScale(value, persist) {
    state.scale = clamp(value, 0.6, 2);
    root.style.setProperty('--whale-scale', String(state.scale));
    var pct = menu.querySelector('.whale-pct');
    if (pct) pct.textContent = Math.round(state.scale * 100) + '%';
    var range = menu.querySelector('.whale-range');
    if (range && Math.round(Number(range.value)) !== Math.round(state.scale * 100)) {
      range.value = String(Math.round(state.scale * 100));
    }
    applyAnchor(false);
    if (persist) saveState();
  }

  // ---------- 气泡 ----------
  function greetingPage() {
    var d = new Date();
    return {
      label: greetWord(d.getHours()),
      big: pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
      hint: (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayCN(d) + ' · ' + moodText()
    };
  }

  function quotePage() {
    return { label: '小鲸鱼说', quote: pickQuote(), hint: '再点一下换一句' };
  }

  function navPage() {
    return { label: '想去哪儿看看？', links: LINKS, hint: '点 ☰ 可以调大小、隐藏我' };
  }

  function pageHTML(data) {
    if (data.links) {
      return '<div class="whale-label">' + data.label + '</div>' +
        '<div class="whale-links">' + data.links.map(function (item) {
          return '<a href="' + item.h + '">' + item.t + '</a>';
        }).join('') + '</div>' +
        '<div class="whale-hint">' + data.hint + '</div>';
    }
    if (data.quote) {
      return '<div class="whale-label">' + data.label + '</div>' +
        '<div class="whale-quote">' + data.quote + '</div>' +
        '<div class="whale-hint">' + data.hint + '</div>';
    }
    return '<div class="whale-label">' + data.label + '</div>' +
      '<div class="whale-amount">' + data.big + '</div>' +
      '<div class="whale-hint">' + data.hint + '</div>';
  }

  function renderPage(index, immediate) {
    page = index;
    var data = index === 0 ? greetingPage() : (index === 1 ? quotePage() : navPage());
    var html = pageHTML(data);

    if (immediate) {
      renderToken++;
      copy.style.transition = '';
      copy.style.opacity = '';
      copy.innerHTML = html;
      return;
    }

    var token = ++renderToken;
    copy.style.transition = 'opacity .12s ease';
    copy.style.opacity = '0';
    setTimeout(function () {
      if (token !== renderToken) return;
      copy.innerHTML = html;
      copy.style.opacity = '1';
      setTimeout(function () {
        if (token !== renderToken) return;
        copy.style.transition = '';
        copy.style.opacity = '';
      }, 150);
    }, 120);
  }

  function openBubble() {
    closeMenu();
    bubbleOpen = true;
    bubble.classList.add('whale-bubble-open');
    bubble.setAttribute('aria-hidden', 'false');
    renderPage(0, true);
    armClose();
    startClock();
  }

  function closeBubble() {
    if (!bubbleOpen) return;
    bubbleOpen = false;
    clearTimeout(closeTimer);
    stopClock();
    renderToken++;
    bubble.classList.remove('whale-bubble-open');
    bubble.setAttribute('aria-hidden', 'true');
    copy.style.transition = '';
    copy.style.opacity = '';
    setTimeout(function () {
      if (!bubbleOpen) copy.innerHTML = '';
    }, 420);
  }

  function advanceBubble() {
    if (!bubbleOpen) {
      openBubble();
      return;
    }
    if (page >= PAGE_COUNT - 1) {
      closeBubble();
      return;
    }
    renderPage(page + 1, false);
    armClose();
  }

  function armClose() {
    clearTimeout(closeTimer);
    var wait = AUTO_CLOSE[page] || 7000;
    closeTimer = setTimeout(function () {
      if (bubbleOpen) closeBubble();
    }, wait);
  }

  function startClock() {
    stopClock();
    clockTimer = setInterval(function () {
      if (!bubbleOpen || page !== 0) return;
      var el = copy.querySelector('.whale-amount');
      if (!el) return;
      var d = new Date();
      el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }, 20000);
  }

  function stopClock() {
    clearInterval(clockTimer);
    clockTimer = 0;
  }

  // ---------- 菜单 ----------
  function openMenu() {
    closeBubble();
    menuOpen = true;
    menu.classList.add('whale-menu-open');
    menu.setAttribute('aria-hidden', 'false');
    positionMenu();
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('whale-menu-open');
    menu.setAttribute('aria-hidden', 'true');
  }

  function positionMenu() {
    var br = menuBtn.getBoundingClientRect();
    var vp = viewport();
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var left = clamp(br.right - mw, 8, Math.max(8, vp.w - mw - 8));
    var top = br.top - mh - 8;
    if (top < 8) top = clamp(br.bottom + 8, 8, Math.max(8, vp.h - mh - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  // ---------- 音效 ----------
  // 首次按压本身就是用户手势，这时再创建并加载音频，
  // 避免每次进页面都预先请求 mp3；关闭音效时不加载。
  function ensureAudio(kind) {
    var audio = kind === 'press' ? pressAudio : releaseAudio;
    if (audio) return audio;
    try {
      audio = new Audio(kind === 'press' ? SOUND_PRESS : SOUND_RELEASE);
      audio.preload = 'auto';
      audio.volume = kind === 'press' ? 0.28 : 0.22;
    } catch (err) {
      audio = null;
    }
    if (kind === 'press') pressAudio = audio;
    else releaseAudio = audio;
    return audio;
  }

  function playSound(kind) {
    if (!state.sound) return;
    var audio = ensureAudio(kind);
    if (!audio) return;
    try {
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
  }

  function stopSounds() {
    [pressAudio, releaseAudio].forEach(function (audio) {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (err) {}
    });
  }

  // ---------- 提示 ----------
  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'whale-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('whale-toast-on');
    });
    setTimeout(function () {
      toast.classList.remove('whale-toast-on');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 260);
    }, 2600);
  }

  // ---------- 状态 ----------
  function readState() {
    var merged = { scale: DEFAULT_STATE.scale, sound: DEFAULT_STATE.sound, h: DEFAULT_STATE.h, v: DEFAULT_STATE.v, x: null, y: null };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return merged;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return merged;
      var scale = Number(saved.scale);
      if (isFinite(scale)) merged.scale = clamp(scale, 0.6, 2);
      if (typeof saved.sound === 'boolean') merged.sound = saved.sound;
      if (saved.h === 'left' || saved.h === 'right') merged.h = saved.h;
      else if (saved.h === null) merged.h = null;
      if (saved.v === 'top' || saved.v === 'bottom') merged.v = saved.v;
      else if (saved.v === null) merged.v = null;
      if (isFinite(Number(saved.x))) merged.x = Number(saved.x);
      if (isFinite(Number(saved.y))) merged.y = Number(saved.y);
    } catch (err) {}
    return merged;
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        scale: state.scale,
        sound: state.sound,
        h: state.h,
        v: state.v,
        x: state.x,
        y: state.y
      }));
    } catch (err) {}
  }

  // ---------- 小工具 ----------
  function clamp(value, min, max) {
    if (!isFinite(value)) value = min;
    return Math.max(min, Math.min(max, value));
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function weekdayCN(d) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }

  function greetWord(hour) {
    if (hour < 6) return '夜深了';
    if (hour < 9) return '早上好呀';
    if (hour < 12) return '上午好呀';
    if (hour < 14) return '中午好呀';
    if (hour < 18) return '下午好呀';
    if (hour < 23) return '晚上好呀';
    return '夜深了';
  }

  function moodText() {
    var path = location.pathname;
    if (/^\/\d{4}\//.test(path)) return '读累了就歇一会儿';
    if (path.indexOf('/travel') === 0) return '海风正好，出发吧';
    if (path.indexOf('/fun/music') === 0) return '要不要一起听首歌';
    if (path.indexOf('/showcase') === 0) return '这里是我的小小展览';
    if (path.indexOf('/finance') === 0) return '今天也要理性交易';
    if (path.indexOf('/about-site') === 0) return '谢谢你愿意了解这里';
    if (path.indexOf('/fun') === 0) return '玩一会儿再继续吧';
    return '欢迎来到 Mu An 的小站';
  }

  function pickQuote() {
    var index;
    do {
      index = Math.floor(Math.random() * QUOTES.length);
    } while (QUOTES.length > 1 && index === lastQuote);
    lastQuote = index;
    return QUOTES[index];
  }
})();
