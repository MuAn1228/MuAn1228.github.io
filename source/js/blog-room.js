// ===== 博客小屋：按页加载，音乐状态只读，离页时释放监听与计时器 =====
(function () {
  'use strict';
  if (window.__blogRoom) { window.__blogRoom.boot(); return; }

  var objects = {
    music: { name: '唱片机', tag: '01 / MUSIC', description: '给日常留一点背景音乐。这里连着同一台播放器，房间里的唱片也会跟着正在播放的歌转动。', href: '/fun/music/', action: '去听音乐' },
    arcade: { name: '游戏机', tag: '02 / PLAY', description: '写代码之外，也给自己留一点玩的时间。去音乐街区飞一会儿，转转魔方，或者走进自己做的地牢。', href: '/fun/arcade/', action: '去玩一会儿' },
    books: { name: '书架', tag: '03 / READ', description: '读过的书，是另一种走过的路。书架上放着故事、想法，以及还想继续翻下去的世界。', href: '/fun/books/', action: '去看看书' },
    travel: { name: '照片墙', tag: '04 / TRAVEL', description: '把走过的地方挂在墙上。西湖、上海、苏州、西安……每张照片背后，都有一段路和一篇旅行记录。', href: '/travel/', action: '去看看旅途' },
    work: { name: '电脑', tag: '05 / CREATE', description: '把脑海里的想法慢慢变成能运行的东西。这里通向我的个人介绍、技术栈和作品。', href: '/showcase/', action: '去看看作品' }
  };
  var current = null;
  var art = null;
  var artRequest = null;

  function loadArt() {
    if (art) return Promise.resolve(art);
    if (artRequest) return artRequest;
    artRequest = fetch('/img/room/room.svg').then(function (response) {
      if (!response.ok) throw new Error('room-art-unavailable');
      return response.text();
    }).then(function (text) {
      var xml = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new Error('room-art-invalid');
      art = xml.documentElement;
      artRequest = null;
      return art;
    }).catch(function (error) { artRequest = null; throw error; });
    return artRequest;
  }

  function boot() {
    var root = document.getElementById('blog-room');
    if (current && current.root === root) return;
    dispose();
    if (!root) return;

    var session = { root: root, timer: null, off: [], selected: null, lastControl: null, disposed: false };
    current = session;
    var controls = root.querySelectorAll('[data-object]');
    var title = root.querySelector('#br-detail-title');
    var description = root.querySelector('#br-detail-description');
    var tag = root.querySelector('#br-detail-tag');
    var enter = root.querySelector('#br-enter');
    var close = root.querySelector('#br-close');
    var musicStatus = root.querySelector('#br-music-status');
    var status = root.querySelector('#br-art-status');
    var retry = root.querySelector('#br-retry');
    var announcement = root.querySelector('#br-selection-status');

    function on(target, type, handler) {
      target.addEventListener(type, handler);
      session.off.push(function () { target.removeEventListener(type, handler); });
    }
    function live() { return !session.disposed && root.isConnected; }
    function syncMusic(event) {
      if (!live()) return;
      var state = event && event.detail;
      if (!state) {
        try { state = window.__blogMusic && window.__blogMusic.getState(); } catch (e) { state = null; }
      }
      root.classList.toggle('br-playing', !!(state && state.playing));
      root.classList.toggle('br-hidden', document.hidden);
      var text = state && state.playing ? '正在播放：' + (state.name || '音乐') + (state.artist ? ' · ' + state.artist : '') : '唱片机安静地等着下一首歌。';
      if (musicStatus.textContent !== text) musicStatus.textContent = text;
    }
    function syncClock() {
      clearTimeout(session.timer);
      session.timer = null;
      if (!live()) return;
      root.classList.toggle('br-hidden', document.hidden);
      if (document.hidden) return;
      var now = new Date();
      // 固定 UTC+8，不受设备时区影响；无需时区库或外部时间接口。
      var hour = (now.getUTCHours() + 8) % 24;
      var minute = now.getUTCMinutes();
      var period = hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
      root.dataset.period = period;
      root.querySelector('#br-period').textContent = { day: '日光正好', dusk: '黄昏慢慢落下来', night: '台灯亮着，夜还很长' }[period];
      var time = root.querySelector('#br-time');
      time.textContent = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      time.dateTime = now.toISOString();
      session.timer = setTimeout(syncClock, 60000 - now.getTime() % 60000);
    }
    function select(key, control) {
      var item = objects[key];
      if (!item) return;
      session.selected = key;
      session.lastControl = control;
      root.dataset.selected = key;
      title.textContent = item.name;
      tag.textContent = item.tag;
      description.textContent = item.description;
      enter.setAttribute('href', item.href);
      enter.replaceChildren(document.createTextNode(item.action + ' ↗'));
      enter.hidden = false;
      close.hidden = false;
      musicStatus.hidden = key !== 'music';
      controls.forEach(function (button) {
        var selected = button.dataset.object === key;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-expanded', String(selected));
      });
      announcement.textContent = item.name + '。' + item.description;
    }
    function reset() {
      if (!session.selected) return;
      session.selected = null;
      delete root.dataset.selected;
      title.textContent = '欢迎，随便坐坐。';
      tag.textContent = 'MAKE YOURSELF AT HOME';
      description.textContent = '选一件物品，看看它背后的故事。这里的每扇小门，都通向博客里的一角。';
      enter.hidden = true;
      enter.removeAttribute('href');
      close.hidden = true;
      musicStatus.hidden = false;
      controls.forEach(function (button) { button.classList.remove('is-selected'); button.setAttribute('aria-expanded', 'false'); });
      announcement.textContent = '已收起物件介绍。';
      if (session.lastControl && session.lastControl.isConnected) session.lastControl.focus({ preventScroll: true });
    }
    function renderArt() {
      retry.hidden = true;
      status.textContent = '正在打开小屋…';
      loadArt().then(function (svg) {
        if (!live()) return;
        root.querySelector('#br-art').replaceChildren(document.importNode(svg, true));
        status.textContent = '';
      }).catch(function () {
        if (!live()) return;
        status.textContent = '小屋插画暂时未能加载，仍可使用下方物件入口。';
        retry.hidden = false;
      });
    }

    controls.forEach(function (control) {
      if (control.tagName === 'BUTTON') control.hidden = false;
      control.setAttribute('aria-expanded', 'false');
      on(control, 'click', function (event) {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
        event.preventDefault();
        select(control.dataset.object, control);
      });
    });
    on(close, 'click', reset);
    on(retry, 'click', renderArt);
    on(root, 'keydown', function (event) {
      if (event.key === 'Escape' && session.selected) { event.preventDefault(); reset(); }
    });
    on(document, 'blog-music-statechange', syncMusic);
    on(document, 'visibilitychange', function () { syncClock(); syncMusic(); });
    on(window, 'pageshow', function () { syncClock(); syncMusic(); });
    syncClock();
    syncMusic();
    renderArt();
  }

  function dispose() {
    if (!current) return;
    current.disposed = true;
    current.root.classList.add('br-hidden');
    clearTimeout(current.timer);
    current.off.forEach(function (off) { off(); });
    current = null;
  }
  window.__blogRoom = { boot: boot };
  document.addEventListener('pjax:send', dispose);
  document.addEventListener('pjax:complete', boot);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
