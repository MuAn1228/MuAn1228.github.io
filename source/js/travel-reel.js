// ===== 胶片画廊 ReelGallery（React Bits Pro 复刻为原生 JS）=====
// 仅 /travel/ 生效：多条倾斜胶片条铺在标题横幅背景，随滚动/拖拽/漂移滑行，
// 带拱形、灰度、鼠标聚焦彩圈、边缘淡出与外排变暗缩放。
(function () {
  if (!/\/travel\/?($|\?|#)/.test(window.location.pathname)) return;

  var container = document.getElementById('travel-reel');
  if (!container) return;

  // 移入页面标题横幅（#page-header）作为背景层（与 pixel-snow 同法）
  var header = document.getElementById('page-header');
  if (header && header !== container.parentNode) {
    header.appendChild(container);
  }

  var IMG_JSON = '/data/travel-gallery.json';

  // ---- 参数（对照 Reel Gallery 默认值）----
  var CFG = {
    rows: 5,             // 胶片条数量
    rowHeight: 80,       // 每块照片高度
    rowGap: 18,          // 条竖向间距
    itemGap: 14,         // 块水平间距
    randTilt: 0.55,      // 每块随机旋转幅度(deg)，模拟胶片错落
    tilt: 5,             // 整堆倾斜角(deg)
    arch: 46,            // 拱形高度(px)
    speed: 1,            // 输入倍率
    speedVariance: 0.6,  // 各条速度差异
    autoScroll: 24,      // 每秒自动漂移 px
    inertia: 0.92,       // 惯性保持
    damping: 0.1,        // 追平输入收敛
    dragSensitivity: 1.6,
    wheelSensitivity: 1.0,
    radius: 8,           // 照片圆角
    grayscale: 0.5,      // 静止灰度(0-1)
    focusRadius: 220,    // 聚焦范围
    focusStrength: 0.85, // 聚焦恢复强度
    dim: 0.45,           // 外侧条变暗
    taper: 0.18,         // 外侧条缩放
    fade: 0.14           // 左右边缘淡出
  };

  var stage, rect, viewW, viewH;
  var pointer = { x: -9999, y: -9999, active: false };
  var userOffset = 0;          // 用户输入累计
  var velocity = 0;            // 惯性速度
  var dragX = null, dragMoved = false;
  var reels = [];              // 每条：{ el, plates[], w, speed, row, dir }
  var running = false;
  var lastT = 0;

  function loadImages(cb) {
    fetch(IMG_JSON)
      .then(function (r) { return r.json(); })
      .then(function (d) { cb(d.images || []); })
      .catch(function () { cb([]); });
  }

  function build(images) {
    stage = document.createElement('div');
    stage.className = 'travel-reel-stage';
    container.appendChild(stage);

    var n = images.length;
    if (!n) { stage.innerHTML = ''; return; }

    measure();

    var tiltEl = document.createElement('div');
    tiltEl.className = 'travel-reel-tilt';
    stage.appendChild(tiltEl);

    // 外排缩放系数
    var mid = (CFG.rows - 1) / 2;

    for (var r = 0; r < CFG.rows; r++) {
      var reel = buildReel(images, n, r, mid);
      tiltEl.appendChild(reel.el);
      reels.push(reel);
    }

    rect = container.getBoundingClientRect();
    platesCenters();
    bindEvents();
    running = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function buildReel(images, n, row, mid) {
    var el = document.createElement('div');
    el.className = 'travel-reel-row';
    el.style.height = CFG.rowHeight + 'px';
    el.style.top = (row * (CFG.rowHeight + CFG.rowGap)) + 'px';

    // 每条随机取一组序列（可复用图片），铺到足够长为止
    var seq = [];
    for (var i = 0; i < 14; i++) {
      seq.push(images[Math.floor(Math.random() * n)]);
    }

    // 速度：中间快(1)，两侧按 speedVariance 偏移
    var speed = CFG.speed * (1 + ((row - mid) / mid || 0) * CFG.speedVariance * 2);

    var plates = [];
    var totalW = 0;

    function addPlates() {
      for (var i = 0; i < seq.length; i++) {
        var img = new Image();
        img.className = 'travel-reel-plate';
        img.src = seq[i];
        img.draggable = false;
        img.style.borderRadius = CFG.radius + 'px';
        img.style.height = '100%';
        // 随机宽高比（minAspect~maxAspect）
        var aspect = 0.6 + Math.random() * 1.4;
        img.style.width = Math.round(CFG.rowHeight * aspect) + 'px';
        img.style.transform = 'rotate(' + (Math.random() * 2 - 1) * CFG.randTilt + 'deg)';
        el.appendChild(img);
        plates.push(img);
        totalW += CFG.rowHeight * aspect + CFG.itemGap;
      }
    }

    addPlates();
    // 确保铺满 2.2 倍视口宽（滚动循环）
    var target = viewW * 2.2;
    var guard = 0;
    while (totalW < target && guard++ < 12) addPlates();

    el.style.width = totalW + 'px';
    el.style.left = (-totalW / 2) + 'px';

    return { el: el, plates: plates, w: totalW, speed: speed, row: row, mid: mid };
  }

  // 每个 item 相对条中心 x（用于灰度聚焦计算，在 tick 中增量更新）
  function platesCenters() {
    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      r.centerXArr = [];
      var cx = -r.w / 2;
      for (var j = 0; j < r.plates.length; j++) {
        r.centerXArr.push(cx + parseFloat(r.plates[j].style.width) / 2);
        cx += parseFloat(r.plates[j].style.width) + CFG.itemGap;
      }
    }
  }

  function measure() {
    viewW = container.offsetWidth || window.innerWidth;
    viewH = container.offsetHeight || 360;
  }

  function bindEvents() {
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', onResize);

    container.addEventListener('pointerenter', function () { pointer.active = true; });
    container.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    container.addEventListener('pointerleave', function () {
      pointer.active = false; pointer.x = -9999; pointer.y = -9999;
    });
  }

  function onWheel(e) {
    // 不阻止页面滚动，滚轮微调胶片偏移
    userOffset += e.deltaY * CFG.wheelSensitivity * CFG.speed;
  }

  function onDown(e) {
    dragX = e.clientX; dragMoved = false; velocity = 0;
  }
  function onMove(e) {
    if (dragX === null) return;
    var dx = e.clientX - dragX;
    if (Math.abs(dx) > 3) dragMoved = true;
    dragX = e.clientX;
    userOffset += dx * CFG.dragSensitivity;
  }
  function onUp() { dragX = null; }
  function onResize() {
    measure(); platesCenters();
    rect = container.getBoundingClientRect();
  }

  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);

    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // 惯性
    velocity *= CFG.inertia;
    userOffset += velocity * dt * CFG.speed;

    // 自动漂移
    var elapsed = now / 1000;
    var base = -elapsed * CFG.autoScroll + userOffset;

    var tiltEl = stage.querySelector('.travel-reel-tilt');
    tiltEl.style.transform = 'translateZ(0) rotate(' + (-CFG.tilt) + 'deg)';
    tiltEl.style.height = (reels.length * (CFG.rowHeight + CFG.rowGap)) + 'px';

    // 拱形基线：每行居中上移 CFG.arch，两侧下移
    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      // 按行宽取模实现无缝循环（中心相对 + 半宽为基准）
      var off = ((base * r.speed) % r.w + r.w) % r.w - r.w / 2;
      var rowOff = (r.row - r.mid) / (r.mid || 1);
      var arch = rowOff * rowOff * CFG.arch;
      var dim = 1 - Math.abs(rowOff) * CFG.dim;
      var taper = 1 - Math.abs(rowOff) * CFG.taper;

      r.el.style.opacity = dim;
      r.el.style.transform =
        'translateX(' + off + 'px)' +
        'translateY(' + arch + 'px)' +
        'scale(' + taper + ')';

      // 灰度聚焦：更新每块
      var g = CFG.grayscale;
      var bri = 1;
      // 条中心在视口中的水平位置 = off + viewW/2（含 left=-w/2 的居中）
      var centerOnScreen = off + viewW / 2;
      if (pointer.active && r.centerXArr) {
        var prx = pointer.x - rect.left;
        var pry = pointer.y - rect.top;
        // 行中心纵向位置：行 top + 行高一半
        var rowCenterY = r.row * (CFG.rowHeight + CFG.rowGap) + CFG.rowHeight / 2;
        for (var j = 0; j < r.plates.length; j++) {
          var px = centerOnScreen + r.centerXArr[j];
          var dxp = px - prx;
          var dyp = arch - pry + rowCenterY;
          var dist = Math.sqrt(dxp * dxp + dyp * dyp);
          if (dist < CFG.focusRadius) {
            var k = 1 - (dist / CFG.focusRadius) * CFG.focusStrength;
            g = CFG.grayscale * (1 - k);
            bri = 1 + k * 0.12;
          }
          var rt = r.plates[j];
          rt.style.filter = 'grayscale(' + g.toFixed(2) + ') brightness(' + bri.toFixed(2) + ')';
        }
      } else {
        for (var j2 = 0; j2 < r.plates.length; j2++) {
          var rp = r.plates[j2];
          var cg = 'grayscale(' + CFG.grayscale + ')';
          if (rp._g !== cg) { rp.style.filter = cg + ' brightness(1)'; rp._g = cg; }
        }
      }
    }
  }

  function init() {
    loadImages(function (images) {
      if (images.length) build(images);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();