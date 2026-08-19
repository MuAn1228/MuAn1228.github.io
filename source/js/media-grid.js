// ===== 电影/游戏/书籍网格渲染（读取 /data/movies.json、/data/games.json、/data/books.json）=====
(function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function render(mountId, dataUrl) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    fetch(dataUrl)
      .then(function (r) { return r.json(); })
      .then(function (items) {
        mount.innerHTML = items.map(function (item) {
          var name = item.name, sub = item.sub, img = item.img, note = item.note || '';
          var attrs = 'data-name="' + escapeHtml(name) + '" data-sub="' + escapeHtml(sub) + '" data-note="' + escapeHtml(note) + '"';
          if (img) {
            return '<div class="media-card" ' + attrs + '>' +
              '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(name) + '" loading="lazy">' +
              '<span class="media-name">' + escapeHtml(name) + '</span>' +
              '<span class="media-sub">' + escapeHtml(sub) + '</span>' +
              '</div>';
          }
          return '<div class="media-card media-noimg" ' + attrs + '>' +
            '<div class="media-placeholder"><i class="fas fa-image"></i></div>' +
            '<span class="media-name">' + escapeHtml(name) + '</span>' +
            '<span class="media-sub">' + escapeHtml(sub) + '</span>' +
            '</div>';
        }).join('');
        bindGridTip(mount);
      })
      .catch(function () {
        mount.innerHTML = '<p style="color:#999;text-align:center;">加载失败</p>';
      });
  }

  function createGridTip() {
    var tip = document.createElement('div');
    tip.className = 'media-grid-tip';
    tip.innerHTML =
      '<div class="mgt-title"></div>' +
      '<div class="mgt-sub"></div>' +
      '<div class="mgt-note"></div>';
    document.body.appendChild(tip);
    return {
      el: tip,
      title: tip.querySelector('.mgt-title'),
      sub: tip.querySelector('.mgt-sub'),
      note: tip.querySelector('.mgt-note')
    };
  }

  var gridTip = createGridTip();
  var gridTipId = null;

  function positionGridTip(x, y) {
    var tw = gridTip.el.offsetWidth;
    var th = gridTip.el.offsetHeight;
    var left = x + 16;
    var top = y + 16;
    if (left + tw > window.innerWidth - 10) left = x - tw - 16;
    if (top + th > window.innerHeight - 10) top = y - th - 16;
    left = Math.max(10, left);
    top = Math.max(10, top);
    gridTip.el.style.left = left + 'px';
    gridTip.el.style.top = top + 'px';
  }

  function showGridTip(item, x, y) {
    gridTip.title.textContent = item.name || '';
    gridTip.sub.textContent = item.sub || '';
    if (item.note) {
      gridTip.note.textContent = item.note;
      gridTip.note.classList.remove('is-empty');
    } else {
      gridTip.note.textContent = '理解待补充…';
      gridTip.note.classList.add('is-empty');
    }
    gridTip.el.classList.add('show');
    positionGridTip(x, y);
  }

  function hideGridTip() {
    gridTipId = null;
    gridTip.el.classList.remove('show');
  }

  function bindGridTip(mount) {
    var cards = mount.querySelectorAll('.media-card');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener('mouseenter', function (e) {
          gridTipId = card;
          showGridTip({
            name: card.dataset.name,
            sub: card.dataset.sub,
            note: card.dataset.note
          }, e.clientX, e.clientY);
        });
        card.addEventListener('mousemove', function (e) {
          if (gridTipId !== card) return;
          positionGridTip(e.clientX, e.clientY);
        });
        card.addEventListener('mouseleave', function () {
          if (gridTipId !== card) return;
          hideGridTip();
        });
      })(cards[i]);
    }
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
