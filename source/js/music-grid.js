// ===== 音乐模块页面：专辑网格（读取 /data/music.json） =====
(function () {
  function init() {
    var gridEl = document.getElementById('music-grid');
    if (!gridEl) return;

    fetch('/data/music.json')
      .then(function (r) { return r.json(); })
      .then(function (songs) {
        // 渲染网格
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