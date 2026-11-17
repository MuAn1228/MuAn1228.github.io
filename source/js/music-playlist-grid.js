// ===== 音乐页顶部紫色横幅：自绘网易云「我喜欢的音乐」大播放器 =====
// 读取 /data/music-playlist.json（网易云公开歌单 2793973232，394 首），
// 渲染为占满顶部空间的紫色播放器：歌单信息 + 现在播放条 + 可滚动歌曲列表。
// 播放引擎复用全站唯一的固定迷你播放器（window.__blogMusic），因此：
//  - 在本页点击播放后切到其它页面，声音继续（迷你播放器恢复同一曲目）
//  - 回到本页自动镜像引擎状态；只在点击暂停按钮时才会真正停止
(function () {
  // 只在音乐页渲染紫色播放器，避免误渲染到游戏/电影等其它子页面
  if (!/\/fun\/music\/?($|\?|#)/.test(window.location.pathname)) return;
  var header = document.getElementById('page-header');
  var info = document.getElementById('page-site-info');
  if (!header || !info || info.querySelector('.music-favs')) return;

  var songs = [];
  var current = -1;
  var engine = null;
  var playlistRegistered = false;
  var playlistLoading = false;
  var playlistFailed = false;
  var disposed = false;
  var toastTimer = null;
  var pendingIndex = -1;
  var rows = [];
  var renderedIndex = -1;
  var renderedState = '';
  var PLAYLIST_ID = 2793973232;
  var COVER = 'https://p1.music.126.net/xPbF9DU762nUv1drpF5d9A==/109951172557075457.jpg';

  function el(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = el('mf-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function paintRow(index, selected) {
    var row = rows[index];
    if (!row) return;
    var failed = row.classList.contains('mf-err');
    var active = !failed && index === selected;
    if (row.classList.contains('mf-active') !== active) row.classList.toggle('mf-active', active);
    var icon = failed ? 'fas fa-lock mf-st' : active
      ? (pendingIndex === index ? 'fas fa-spinner fa-spin mf-st' : 'fas fa-volume-up mf-st')
      : 'fas mf-st';
    var status = row.querySelector('.mf-st');
    if (status.className !== icon) status.className = icon;
  }

  function setState(playing) {
    var toggle = el('mf-toggle');
    if (disposed || !toggle) return;
    var selected = pendingIndex >= 0 ? pendingIndex : current;
    var key = selected + ':' + !!playing + ':' + pendingIndex;
    if (renderedState === key) return;
    renderedState = key;
    var icon = toggle.querySelector('i');
    var nextIcon = playing || pendingIndex >= 0 ? 'fas fa-pause' : 'fas fa-play';
    if (icon.className !== nextIcon) icon.className = nextIcon;
    paintRow(renderedIndex, selected);
    if (selected !== renderedIndex) paintRow(selected, selected);
    renderedIndex = selected;
  }

  function play(i) {
    if (disposed || i < 0 || (songs.length && i >= songs.length)) return;
    var row = rows[i];
    if (row) row.classList.remove('mf-err');
    if (!engine || !playlistRegistered) {
      // 加载期间保留最后一次选择；再点同一首或暂停按钮可取消。
      pendingIndex = pendingIndex === i ? -1 : i;
      syncState();
      if (pendingIndex >= 0) {
        loadPlaylist();
        document.dispatchEvent(new CustomEvent('blog-music-load'));
        connectEngine();
      }
      return;
    }
    // 同一首再次点击：暂停 / 继续
    var state = engine && engine.getState();
    if (state && state.owner === 'big' && state.index === i && state.playing) {
      engine.pause();
      return;
    }
    engine.select(i, true);
  }

  function step(d) {
    if (disposed) return;
    if (!engine || !playlistRegistered) {
      var target = pendingIndex < 0 || !songs.length ? 0 : (pendingIndex + d + songs.length) % songs.length;
      if (target !== pendingIndex) play(target);
      return;
    }
    if (songs.length === 0) return;
    var state = engine.getState();
    if (!state || state.owner !== 'big') engine.select(0, true);
    else if (d < 0) engine.previous();
    else engine.next();
  }

  function syncState() {
    var text = el('mf-now-text');
    if (disposed || !text) return;
    var state = engine && engine.getState();
    current = state && state.owner === 'big' && songs[state.index] ? state.index : -1;
    var requested = songs[pendingIndex];
    var label = pendingIndex >= 0 ? (requested ? requested.name + ' - ' + requested.artist + ' · 正在加载…' : '正在加载歌单…')
      : state ? state.name + ' - ' + state.artist : playlistFailed ? '歌单加载失败，点播放重试' : '点击下方歌曲开始播放';
    if (text.textContent !== label) text.textContent = label;
    setState(state && state.playing);
  }

  function showError(event) {
    var failed = event.detail;
    if (disposed || !failed || failed.owner !== 'big' || !songs[failed.index]) return;
    var row = rows[failed.index];
    if (row) {
      row.classList.add('mf-err');
      paintRow(failed.index, pendingIndex >= 0 ? pendingIndex : current);
    }
    toast('「' + failed.name + '」暂时无法播放，再点一次可去网易云收听');
  }

  function connectEngine() {
    if (disposed || !window.__blogMusic || !window.__blogMusic.ap) return;
    engine = window.__blogMusic;
    if (songs.length && !playlistRegistered) {
      engine.registerPlaylist(songs);
      playlistRegistered = true;
    }
    if (playlistRegistered && pendingIndex >= 0) {
      var index = pendingIndex;
      pendingIndex = -1;
      engine.select(index, true);
    }
    syncState();
  }

  function loadError() {
    if (disposed) return;
    pendingIndex = -1;
    syncState();
    toast('播放器加载失败，请再点一次重试');
  }

  function dispose() {
    disposed = true;
    pendingIndex = -1;
    clearTimeout(toastTimer);
    document.removeEventListener('blog-music-ready', connectEngine);
    document.removeEventListener('blog-music-statechange', syncState);
    document.removeEventListener('blog-music-error', showError);
    document.removeEventListener('blog-music-load-error', loadError);
    document.removeEventListener('pjax:send', dispose);
    var toastEl = el('mf-toast');
    if (toastEl) toastEl.remove();
  }

  // 先同步构建播放器骨架（歌单信息 + 播放条），避免进入时短暂停留旧布局；
  // 歌曲列表数据通过 fetch 异步填充。
  function buildSkeleton() {
    var box = document.createElement('div');
    box.className = 'music-favs';
    box.innerHTML =
      '<div class="mf-head">' +
        '<img class="mf-plcover" src="' + COVER + '" alt="">' +
        '<div class="mf-plinfo">' +
          '<div class="mf-plname">落别恨喜欢的音乐</div>' +
          '<div class="mf-pldesc" id="mf-pldesc">我喜欢的音乐 · 加载中…</div>' +
        '</div>' +
        '<a class="mf-open" href="https://music.163.com/#/playlist?id=' + PLAYLIST_ID + '" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 打开网易云</a>' +
      '</div>' +
      '<div class="mf-now">' +
        '<i class="fas fa-music mf-now-icon"></i>' +
        '<span class="mf-now-text" id="mf-now-text">点击下方歌曲开始播放</span>' +
        '<div class="mf-now-ctrl">' +
          '<button class="mf-btn" id="mf-prev" title="上一首"><i class="fas fa-step-backward"></i></button>' +
          '<button class="mf-btn mf-play" id="mf-toggle" title="播放 / 暂停"><i class="fas fa-play"></i></button>' +
          '<button class="mf-btn" id="mf-next" title="下一首"><i class="fas fa-step-forward"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="mf-list" id="mf-list"></div>';
    info.appendChild(box);
    header.classList.add('music-favs-host');

    // toast 挂到 body，避免被 .music-favs 的 overflow:hidden 裁剪
    var toast = document.createElement('div');
    toast.className = 'mf-toast';
    toast.id = 'mf-toast';
    document.body.appendChild(toast);

    el('mf-toggle').addEventListener('click', function () {
      if (pendingIndex >= 0) { pendingIndex = -1; syncState(); return; }
      if (current < 0) { play(0); return; }
      if (!engine) { toast('播放器加载中，请稍候…'); return; }
      engine.toggle();
    });
    el('mf-prev').addEventListener('click', function () { step(-1); });
    el('mf-next').addEventListener('click', function () { step(1); });
  }

  function populateList(list) {
    if (disposed) return;
    songs = list;
    el('mf-pldesc').textContent = '我喜欢的音乐 · 共 ' + list.length + ' 首';

    var listEl = el('mf-list');
    listEl.innerHTML = list.map(function (s, i) {
      return '<div class="mf-row" data-i="' + i + '">' +
        '<span class="mf-idx">' + (i + 1) + '</span>' +
        '<img class="mf-cov" src="' + s.cover + '" loading="lazy" alt="">' +
        '<span class="mf-ti" title="' + s.name + '">' + s.name + '</span>' +
        '<span class="mf-ar">' + s.artist + '</span>' +
        '<i class="fas mf-st"></i>' +
        '</div>';
    }).join('');
    rows = Array.prototype.slice.call(listEl.querySelectorAll('.mf-row'));
    renderedState = '';

    listEl.addEventListener('click', function (e) {
      var row = e.target.closest('.mf-row');
      if (!row) return;
      var i = parseInt(row.getAttribute('data-i'), 10);
      if (row.classList.contains('mf-err')) {
        toast('「' + songs[i].name + '」暂时无法播放，为你打开网易云收听');
        window.open('https://music.163.com/#/song?id=' + songs[i].id, '_blank');
        return;
      }
      play(i);
    });

    connectEngine();
  }

  function loadPlaylist() {
    if (disposed || playlistLoading || songs.length) return;
    playlistLoading = true;
    playlistFailed = false;
    el('mf-pldesc').textContent = '我喜欢的音乐 · 加载中…';
    fetch('/data/music-playlist.json')
      .then(function (response) {
        if (!response.ok) throw new Error('playlist-http-' + response.status);
        return response.json();
      })
      .then(function (list) {
        if (!Array.isArray(list)) throw new Error('playlist-invalid');
        playlistLoading = false;
        populateList(list);
      })
      .catch(function () {
        playlistLoading = false;
        if (disposed) return;
        playlistFailed = true;
        pendingIndex = -1;
        syncState();
        el('mf-pldesc').textContent = '歌单加载失败，点播放重试';
        toast('歌单加载失败，点播放重试');
      });
  }

  buildSkeleton();
  document.addEventListener('blog-music-ready', connectEngine);
  document.addEventListener('blog-music-statechange', syncState);
  document.addEventListener('blog-music-error', showError);
  document.addEventListener('blog-music-load-error', loadError);
  document.addEventListener('pjax:send', dispose);
  connectEngine();
  document.dispatchEvent(new CustomEvent('blog-music-load'));
  loadPlaylist();
})();
