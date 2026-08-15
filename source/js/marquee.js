// ===== 图片滚动展示墙（横向无限滚动 + 左右按钮 + 点击放大） =====
(function () {
  var images = [];
  for (var i = 1; i <= 47; i++) {
    images.push('/img/blog/img' + (i < 10 ? '0' + i : i) + '.jpg');
  }

  var SPEED = 0.8;          // 自动滚动速度（px/帧）
  var STEP = 260;           // 按钮点击滚动距离
  var RESUME_DELAY = 4000;  // 无操作 4 秒后恢复自动滚动

  var track, offset = 0, playing = true, timer = null;

  // 灯箱（点击放大）
  var overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = '<img class="lightbox-img" src="" alt="图片"><span class="lightbox-close">&times;</span>';
  document.body.appendChild(overlay);
  function openLightbox(src) { overlay.querySelector('.lightbox-img').src = src; overlay.classList.add('active'); }
  function closeLightbox() { overlay.classList.remove('active'); }
  overlay.addEventListener('click', closeLightbox);
  overlay.querySelector('.lightbox-close').addEventListener('click', function (e) { e.stopPropagation(); closeLightbox(); });

  function halfWidth() { return track.scrollWidth / 2; }

  function loop() {
    if (playing) {
      offset -= SPEED;
      if (-offset >= halfWidth()) offset += halfWidth();
      track.style.transform = 'translateX(' + offset + 'px)';
    }
    requestAnimationFrame(loop);
  }

  function manual(dir) {
    playing = false;
    offset += dir * STEP;
    if (offset > 0) offset -= halfWidth();
    if (-offset >= halfWidth()) offset += halfWidth();
    track.style.transition = 'transform 0.4s ease';
    track.style.transform = 'translateX(' + offset + 'px)';
    setTimeout(function () { track.style.transition = 'none'; }, 400);
    clearTimeout(timer);
    timer = setTimeout(function () { playing = true; }, RESUME_DELAY);
  }

  function init() {
    var header = document.querySelector('#page-header.full_page');
    var content = document.querySelector('#content-inner');
    if (!header || !content) return;
    if (document.getElementById('marquee-wall')) return;

    var wrap = document.createElement('div');
    wrap.className = 'marquee-wrap';
    wrap.id = 'marquee-wall';

    var btnLeft = document.createElement('button');
    btnLeft.className = 'marquee-btn marquee-btn-left';
    btnLeft.innerHTML = '&#8249;';
    btnLeft.title = '向左浏览';
    var btnRight = document.createElement('button');
    btnRight.className = 'marquee-btn marquee-btn-right';
    btnRight.innerHTML = '&#8250;';
    btnRight.title = '向右浏览';

    track = document.createElement('div');
    track.className = 'marquee-track';
    var item = images.map(function (src) {
      return '<img src="' + src + '" alt="图片" loading="lazy">';
    }).join('');
    track.innerHTML = item + item; // 两份图片实现无缝循环

    track.addEventListener('click', function (e) {
      var img = e.target.closest('img');
      if (img) openLightbox(img.src);
    });

    btnLeft.addEventListener('click', function () { manual(1); });
    btnRight.addEventListener('click', function () { manual(-1); });

    wrap.appendChild(btnLeft);
    wrap.appendChild(btnRight);

    var viewport = document.createElement('div');
    viewport.className = 'marquee-viewport';
    viewport.appendChild(track);
    wrap.appendChild(viewport);
    header.after(wrap);

    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
