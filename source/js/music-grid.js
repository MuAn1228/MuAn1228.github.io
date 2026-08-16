// ===== 音乐网格渲染（读取 /data/music.json） =====
(function () {
  function init() {
    var mount = document.getElementById('music-grid');
    if (!mount) return;
    fetch('/data/music.json')
      .then(function (r) { return r.json(); })
      .then(function (songs) {
        mount.innerHTML = songs.map(function (s) {
          var q = encodeURIComponent(s.title + ' ' + s.author);
          return '<a class="music-card" href="https://music.163.com/#/search/m/?s=' + q + '&type=1" target="_blank" rel="noopener">' +
            '<img src="' + s.cover + '" alt="' + s.title + '" loading="lazy">' +
            '<span class="music-title">' + s.title + '</span>' +
            '<span class="music-author">' + s.author + '</span>' +
            '</a>';
        }).join('');
      })
      .catch(function () {
        mount.innerHTML = '<p style="color:#999;text-align:center;">音乐加载失败</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
