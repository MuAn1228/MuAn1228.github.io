// ===== 音乐模块页面：专辑网格（滚动懒加载） =====
(function () {
  function init() {
    var gridEl = document.getElementById('music-grid');
    if (!gridEl) return;

    var PAGE = 50;
    var allSongs = [];
    var index = 0;
    var loading = false;

    function renderCard(s) {
      var q = encodeURIComponent(s.title + ' ' + s.author);
      return '<a class="music-card" href="https://music.163.com/#/search/m/?s=' + q + '&type=1" target="_blank" rel="noopener">' +
        '<img src="' + s.cover + '" alt="' + s.title + '" loading="lazy">' +
        '<span class="music-title">' + s.title + '</span>' +
        '<span class="music-author">' + s.author + '</span>' +
        '</a>';
    }

    function loadMore() {
      if (loading || index >= allSongs.length) return;
      loading = true;
      var batch = allSongs.slice(index, index + PAGE);
      gridEl.insertAdjacentHTML('beforeend', batch.map(renderCard).join(''));
      index += batch.length;
      loading = false;
      // 更新 sentinel 位置
      sentinel.style.display = index >= allSongs.length ? 'none' : '';
    }

    // 创建底部哨兵
    var sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;';
    gridEl.after(sentinel);

    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    observer.observe(sentinel);

    fetch('/data/music.json')
      .then(function (r) { return r.json(); })
      .then(function (songs) {
        allSongs = songs;
        index = 0;
        gridEl.innerHTML = '';
        loadMore();
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