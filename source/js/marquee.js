// ===== 图片滚动展示墙（横向无限循环 + 左右按钮 + 点击放大 + 移动端滑动） =====
(function () {
  var images = [];
  for (var i = 1; i <= 47; i++) {
    images.push('/img/blog/img' + (i < 10 ? '0' + i : i) + '.jpg');
  }

  var SPEED = 0.8;          // 自动滚动速度（px/帧）
  var STEP = 260;           // 按钮/滑动滚动距离
  var RESUME_DELAY = 4000;  // 无操作 4 秒后恢复自动滚动

  var track, offset = 0, playing = true, timer = null, transitionTimer = null, halfW = 0;

  // 灯箱（点击放大）
  var overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = '<img class="lightbox-img" src="" alt="图片"><span class="lightbox-close">&times;</span>';
  document.body.appendChild(overlay);
  function openLightbox(src) { overlay.querySelector('.lightbox-img').src = src; overlay.classList.add('active'); }
  function closeLightbox() { overlay.classList.remove('active'); }
  overlay.addEventListener('click', closeLightbox);
  overlay.querySelector('.lightbox-close').addEventListener('click', function (e) { e.stopPropagation(); closeLightbox(); });

  function loop() {
    // 灯箱打开时暂停自动滚动
    if (playing && !overlay.classList.contains('active')) {
      offset -= SPEED;
      if (-offset >= halfW) offset += halfW;
      track.style.transform = 'translate3d(' + offset + 'px, 0, 0)';
    }
    requestAnimationFrame(loop);
  }

  function manual(dir) {
    playing = false;
    var stepTarget = offset + dir * STEP;
    // 计算回绕后的等价位置
    var wrapped = stepTarget;
    if (wrapped > 0) wrapped -= halfW;
    if (-wrapped >= halfW) wrapped += halfW;

    // 阶段1：平滑过渡 STEP 距离
    track.style.transition = 'transform 0.4s cubic-bezier(.25, .1, .25, 1)';
    track.style.transform = 'translate3d(' + stepTarget + 'px, 0, 0)';
    offset = wrapped;

    // 阶段2：过渡结束后瞬间回绕（内容重复，视觉无缝，不再跳回初始）
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(function () {
      track.style.transition = 'none';
      track.style.transform = 'translate3d(' + wrapped + 'px, 0, 0)';
      void track.offsetWidth; // 强制 reflow，确保下次过渡正常
    }, 420);

    clearTimeout(timer);
    timer = setTimeout(function () { playing = true; }, RESUME_DELAY);
  }

  // 移动端触摸滑动
  var touchStartX = 0, touchStartY = 0, touching = false, swiped = false;
  function bindTouch(el) {
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touching = true;
      swiped = false;
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!touching) return;
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) swiped = true;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
      if (!touching) return;
      touching = false;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (swiped && Math.abs(dx) > 40) {
        manual(dx < 0 ? -1 : 1);
      }
    });
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
      return '<img src="' + src + '" alt="图片">';
    }).join('');
    track.innerHTML = item + item; // 两份图片实现无缝循环

    track.addEventListener('click', function (e) {
      if (swiped) { swiped = false; return; } // 滑动后忽略点击
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
    bindTouch(viewport);
    header.after(wrap);
    halfW = track.scrollWidth / 2; // 缓存半宽，避免每帧读取 scrollWidth 触发 reflow（需在 DOM 插入后读取）

    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
