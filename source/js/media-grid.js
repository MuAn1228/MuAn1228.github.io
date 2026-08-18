// ===== 电影/游戏网格渲染（读取 /data/movies.json、/data/games.json）=====
(function () {
  function render(mountId, dataUrl) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    fetch(dataUrl)
      .then(function (r) { return r.json(); })
      .then(function (items) {
        mount.innerHTML = items.map(function (item) {
          var name = item.name, sub = item.sub, img = item.img;
          if (img) {
            return '<div class="media-card">' +
              '<img src="' + img + '" alt="' + name + '" loading="lazy">' +
              '<span class="media-name">' + name + '</span>' +
              '<span class="media-sub">' + sub + '</span>' +
              '</div>';
          }
          return '<div class="media-card media-noimg">' +
            '<div class="media-placeholder"><i class="fas fa-image"></i></div>' +
            '<span class="media-name">' + name + '</span>' +
            '<span class="media-sub">' + sub + '</span>' +
            '</div>';
        }).join('');
      })
      .catch(function () {
        mount.innerHTML = '<p style="color:#999;text-align:center;">加载失败</p>';
      });
  }

  function initBookToggle() {
    var btn = document.getElementById('book-toggle');
    var wall = document.getElementById('book-driftwall');
    var grid = document.getElementById('book-grid');
    if (!btn || !wall || !grid) return;
    function show(mode) {
      var isGrid = mode === 'grid';
      wall.style.display = isGrid ? 'none' : '';
      grid.style.display = isGrid ? '' : 'none';
      btn.textContent = isGrid ? '切换到漂移墙' : '切换到规整视图';
    }
    btn.addEventListener('click', function () {
      var isGridNow = grid.style.display !== 'none';
      show(isGridNow ? 'wall' : 'grid');
    });
  }

  function init() {
    render('movie-grid', '/data/movies.json');
    render('game-grid', '/data/games.json');
    render('book-grid', '/data/books.json');
    initBookToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
