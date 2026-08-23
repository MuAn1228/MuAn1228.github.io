// ===== 音乐页顶部紫色横幅：自绘网易云「我喜欢的音乐」大播放器 =====
// 读取 /data/music-playlist.json（网易云公开歌单 2793973232，394 首），
// 渲染为占满顶部空间的紫色播放器：歌单信息 + 现在播放条 + 可滚动歌曲列表。
// 点击歌曲通过网易云官方直链播放；版权受限的歌曲会提示不可播放，可点击跳转网易云。
(function () {
  // 只在音乐页渲染紫色播放器，避免误渲染到游戏/电影等其它子页面
  if (!/\/fun\/music\/?($|\?|#)/.test(window.location.pathname)) return;
  var header = document.getElementById('page-header');
  var info = document.getElementById('page-site-info');
  if (!header || !info) return;

  var songs = [];
  var current = -1;
  var audio = new Audio();
  var toastTimer = null;
  var localIds = null;
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

  function setState(playing) {
    var icon = el('mf-toggle').querySelector('i');
    icon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    document.querySelectorAll('.mf-row').forEach(function (r) {
      var i = parseInt(r.getAttribute('data-i'), 10);
      var st = r.querySelector('.mf-st');
      var active = i === current;
      if (r.classList.contains('mf-err')) {
        r.classList.toggle('mf-active', false);
        st.className = 'fas fa-lock mf-st'; // 版权受限：保持锁图标
        return;
      }
      r.classList.toggle('mf-active', active);
      st.className = active ? 'fas fa-volume-up mf-st' : 'fas mf-st';
    });
  }

  function play(i) {
    if (i < 0 || i >= songs.length) return;
    var row = document.querySelector('.mf-row[data-i="' + i + '"]');
    if (row) row.classList.remove('mf-err');
    if (current === i && !audio.paused) { audio.pause(); return; }
    current = i;
    el('mf-now-text').textContent = songs[i].name + ' - ' + songs[i].artist;
    // 有本地文件则用本地完整版，否则走网易云官方直链
    if (localIds && localIds.indexOf(songs[i].id) !== -1) {
      audio.src = '/music/' + songs[i].id + '.mp3';
    } else {
      audio.src = 'https://music.163.com/song/media/outer/url?id=' + songs[i].id + '.mp3';
    }
    audio.play();
  }

  function step(d) {
    if (songs.length === 0) return;
    play(current < 0 ? 0 : (current + d + songs.length) % songs.length);
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
      if (current < 0) { play(0); return; }
      if (audio.paused) audio.play(); else audio.pause();
    });
    el('mf-prev').addEventListener('click', function () { step(-1); });
    el('mf-next').addEventListener('click', function () { step(1); });

    audio.addEventListener('play', function () { setState(true); });
    audio.addEventListener('pause', function () { setState(false); });
    audio.addEventListener('ended', function () { step(1); });
    audio.addEventListener('error', function () {
      var listEl = el('mf-list');
      var row = listEl && listEl.querySelector('.mf-row[data-i="' + current + '"]');
      if (row) row.classList.add('mf-err');
      setState(false);
      toast('「' + songs[current].name + '」受版权限制无法播放，再点一次可去网易云收听');
    });
  }

  function populateList(list) {
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

    listEl.addEventListener('click', function (e) {
      var row = e.target.closest('.mf-row');
      if (!row) return;
      var i = parseInt(row.getAttribute('data-i'), 10);
      if (row.classList.contains('mf-err')) {
        // 版权/VIP 受限歌曲无法在此播放，直接带用户去网易云收听
        toast('「' + songs[i].name + '」受版权限制无法播放，为你打开网易云收听');
        window.open('https://music.163.com/#/song?id=' + songs[i].id, '_blank');
        return;
      }
      play(i);
    });
  }

  buildSkeleton();
  fetch('/data/music-playlist.json')
    .then(function (r) { return r.json(); })
    .then(populateList)
    .catch(function () {});
  // 加载本地歌曲 ID 列表
  fetch('/data/local-playlist-ids.json')
    .then(function (r) { return r.json(); })
    .then(function (ids) { localIds = ids; })
    .catch(function () { localIds = []; });
})();
