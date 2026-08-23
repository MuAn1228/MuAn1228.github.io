// ===== 音乐模块页面：播放器 + 网格（读取 /data/music.json） =====
(function () {
  function init() {
    var playerEl = document.getElementById('music-module-player');
    var gridEl = document.getElementById('music-grid');
    if (!playerEl && !gridEl) return;

    fetch('/data/music.json')
      .then(function (r) { return r.json(); })
      .then(function (songs) {
        // ---- 1. 渲染播放器 ----
        if (playerEl && window.APlayer) {
          var metingApi = 'https://api.injahow.cn/meting/?server=netease&type=song&id=';
          var fallback = 'https://music.163.com/song/media/outer/url?id=';

          Promise.all(songs.map(function (s) {
            if (s.local) {
              return Promise.resolve({
                name: s.title, artist: s.author,
                url: '/music/' + s.id + '.mp3',
                cover: s.cover, lrc: ''
              });
            }
            return fetch(metingApi + s.id)
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var url = d && d[0] && d[0].url;
                return url || (fallback + s.id + '.mp3');
              })
              .catch(function () { return fallback + s.id + '.mp3'; })
              .then(function (url) {
                return { name: s.title, artist: s.author, url: url, cover: s.cover, lrc: '' };
              });
          })).then(function (list) {
            new APlayer({
              container: playerEl,
              fixed: false,
              mini: false,
              autoplay: false,
              preload: 'auto',
              theme: '#a18cd1',
              lrcType: 3,
              mutex: true,
              order: 'list',
              listFolded: false,
              listMaxHeight: '200px',
              audio: list
            });
          });
        }

        // ---- 2. 渲染网格 ----
        if (gridEl) {
          gridEl.innerHTML = songs.map(function (s) {
            var q = encodeURIComponent(s.title + ' ' + s.author);
            return '<a class="music-card" href="https://music.163.com/#/search/m/?s=' + q + '&type=1" target="_blank" rel="noopener">' +
              '<img src="' + s.cover + '" alt="' + s.title + '" loading="lazy">' +
              '<span class="music-title">' + s.title + '</span>' +
              '<span class="music-author">' + s.author + '</span>' +
              '</a>';
          }).join('');
        }
      })
      .catch(function () {
        if (gridEl) gridEl.innerHTML = '<p style="color:#999;text-align:center;">音乐加载失败</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();