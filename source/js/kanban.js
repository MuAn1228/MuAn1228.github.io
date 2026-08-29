/*!
 * 轻量看板娘 - 替换 Live2D (~385KB) → 静态立牌 + CSS 动画 (~12KB)
 * 图片在 #kanban-card 内，CSS 浮动 + 点击语录 + 拖拽
 */
(function () {
  'use strict';

  // ----- 语录 -----
  var QUOTES = [
    '欢迎来到 MuAn 的小站~',
    '今天也要加油鸭！',
    '代码写完了吗？',
    '要记得按时吃饭哦~',
    '点击我可以说说话~',
    '你来的正好，我正无聊呢~',
    '要不要看看我的旅行照片？',
    '好想出去玩啊...',
    '你知道怎样让代码没有 bug 吗？',
    '晚安，好梦~',
    '早安，新的一天！',
    '要听首歌吗？',
    '这里有很多有趣的文章哦~',
    '你是我见过最可爱的访客~',
    '嘿嘿，又被你发现了~',
    '要不要来杯咖啡？',
    '学习使我快乐！真的吗？',
    '今天也是元气满满的一天！',
    '嘘，我在听音乐~',
    '这个博客的主人很厉害哦！',
    '你发现了隐藏的看板娘！',
    '好想被摸摸头~',
    '你知道吗，GitHub 是全世界最大的程序员交友网站',
    '代码如诗，生活如歌~',
    '愿你今天也有好心情！',
  ];

  // ----- 创建 DOM -----
  function createKanban() {
    var el = document.createElement('div');
    el.id = 'kanban';
    el.innerHTML =
      '<div id="kanban-card">' +
        '<img id="kanban-img" src="/img/kanban/character.webp" alt="看板娘" draggable="false">' +
        '<div id="kanban-bubble" class="kb-hidden">' +
          '<span id="kanban-text"></span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  // ----- 语录弹窗 -----
  var hideTimer = null;

  function showQuote(e) {
    e.stopPropagation();
    var bubble = document.getElementById('kanban-bubble');
    var text = document.getElementById('kanban-text');
    if (!bubble || !text) return;
    text.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    bubble.classList.remove('kb-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      bubble.classList.add('kb-hidden');
    }, 5000);
  }

  function hideQuote() {
    var bubble = document.getElementById('kanban-bubble');
    if (bubble) bubble.classList.add('kb-hidden');
    clearTimeout(hideTimer);
  }

  // ----- 拖拽（保持位置在可见区域内） -----
  function initDrag(card) {
    var isDragging = false;
    var startX, startY, origLeft, origTop;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function onStart(e) {
      isDragging = true;
      var t = e.touches ? e.touches[0] : e;
      startX = t.clientX;
      startY = t.clientY;
      var rect = card.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      card.style.transition = 'none';
      card.style.cursor = 'grabbing';
    }

    function onMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var w = window.innerWidth;
      var h = window.innerHeight;
      var cw = card.offsetWidth;
      var ch = card.offsetHeight;
      card.style.left = clamp(origLeft + dx, 0, w - cw) + 'px';
      card.style.top = clamp(origTop + dy, 0, h - ch) + 'px';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = '';
      card.style.cursor = 'grab';
    }

    card.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    card.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ----- 启动 -----
  function boot() {
    var card = createKanban();

    // 点击立牌 → 语录
    card.addEventListener('click', showQuote);

    // 点击外部 → 关闭语录
    document.addEventListener('click', function (e) {
      var bubble = document.getElementById('kanban-bubble');
      if (bubble && !bubble.classList.contains('kb-hidden') && !e.target.closest('#kanban-card')) {
        hideQuote();
      }
    });

    // 拖拽
    initDrag(card);
  }

  // 空闲调度，不抢首屏
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(boot, { timeout: 2000 });
    } else {
      setTimeout(boot, 600);
    }
  } else {
    window.addEventListener('DOMContentLoaded', function () {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(boot, { timeout: 2000 });
      } else {
        setTimeout(boot, 600);
      }
    });
  }
})();