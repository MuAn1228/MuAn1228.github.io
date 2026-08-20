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
    arch: 0,             // 纵向拱形高度(px，0=平直，避免行间空隙过大/重叠)
    speed: 1,            // 输入倍率
    speedVariance: 0.6,  // 各条速度差异
    autoScroll: 24,      // 每秒自动漂移 px
    inertia: 0.92,       // 惯性保持
    dragSensitivity: 1.6,
    wheelSensitivity: 1.0,
    radius: 0,           // 照片圆角(0=标准直角矩形，更有胶片感)
    grayscale: 0.5,      // 静止灰度(0-1)
    focusRadius: 220,    // 聚焦范围
    focusStrength: 0.85, // 聚焦恢复强度
    dim: 0.35,           // 外侧条变暗
    taper: 0.12,         // 外侧条缩放
    preloadTimeout: 4000 // 预加载最长等待(ms)，超时也继续渲染
  };

  var stage, rect, viewW, viewH;
  var pointer = { x: -9999, y: -9999, active: false };
  var userOffset = 0;          // 用户输入累计
  var dragX = null;
  var reels = [];              // 每条：{ el, plates[], w, speed, row, mid, centers[] }
  var running = false;
  var lastT = 0;

  // 根据真实宽高比 + 目标高度，得出块宽（竖图窄、横图宽）
  function aspectW(meta, h) {
    var ratio = meta && meta.w && meta.h ? meta.w / meta.h : 1.3;
    var w = h * Math.min(2.0, Math.max(0.6, ratio));
    return Math.round(w);
  }

  function build(metas) {
    stage = document.createElement('div');
    stage.className = 'travel-reel-stage';
    container.appendChild(stage);

    var n = metas.length;
    if (!n) { stage.innerHTML = ''; return; }

    measure();

    // 此刻视口已有内容，先显示淡入容器（避免半图感）
    container.classList.add('travel-reel-ready');

    var tiltEl = document.createElement('div');
    tiltEl.className = 'travel-reel-tilt';
    stage.appendChild(tiltEl);

    var mid = (CFG.rows - 1) / 2;

    // 校准行高：让整堆在标题横幅内纵向铺满而非溢出
    var maxH = container.offsetHeight || viewH;
    var stackH = CFG.rows * CFG.rowHeight + (CFG.rows - 1) * CFG.rowGap;
    if (stackH > maxH * 0.95) {
      CFG._scale = maxH * 0.9 / stackH;
    } else {
      CFG._scale = 1;
    }
    // 行高/行距随缩放同步 -> 行间间距始终均匀，不重叠不过疏
    CFG._rowH = Math.round(CFG.rowHeight * CFG._scale);
    CFG._gap = Math.max(6, Math.round(CFG.rowGap * CFG._scale));
    CFG._stackH = CFG.rows * CFG._rowH + (CFG.rows - 1) * CFG._gap;

    for (var r = 0; r < CFG.rows; r++) {
      var reel = buildReel(metas, r, mid);
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

  function buildReel(metas, row, mid) {
    var el = document.createElement('div');
    el.className = 'travel-reel-row';
    var rowH = CFG._rowH;
    el.style.height = rowH + 'px';
    el.style.top = (row * (rowH + CFG._gap)) + 'px';

    // 每条按行波动随机打乱图片顺序
    var shuffled = metas.slice();
    var seed = row * 97 % 31;
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = (i * 7 + seed * 13 + Math.floor(Math.random() * (i + 1))) % (i + 1);
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }

    var speed = CFG.speed * (1 + ((row - mid) / mid || 0) * CFG.speedVariance * 2);

    var plates = [];
    var totalW = 0;

    // 逐块添加：铺到约 3 倍视口宽，配合 translateX 取模 + 边缘淡出实现无缝无限循环
    var target = viewW * 3;
    var guard = 0;
    while (totalW < target && guard++ < 150) {
      var meta = shuffled[(guard - 1) % shuffled.length];
      var img = new Image();
      img.className = 'travel-reel-plate';
      img.src = meta.src;
      img.decoding = 'async';   // 异步解码，先出结构再填充像素，加快首屏
      img.draggable = false;
      img.style.borderRadius = CFG.radius + 'px';
      img.style.height = '100%';
      var w = aspectW(meta, rowH);
      img.style.width = w + 'px';
      img.style.transform = 'rotate(' + (Math.random() * 2 - 1) * CFG.randTilt + 'deg)';
      el.appendChild(img);
      plates.push(img);
      totalW += w + CFG.itemGap;
    }

    el.style.width = totalW + 'px';
    el.style.left = (-totalW / 2) + 'px';

    return { el: el, plates: plates, w: totalW, speed: speed, row: row, mid: mid, rowH: rowH, centers: [] };
  }

  function platesCenters() {
    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      r.centers = [];
      var cx = -r.w / 2;
      for (var j = 0; j < r.plates.length; j++) {
        r.centers.push(cx + parseFloat(r.plates[j].style.width) / 2);
        cx += parseFloat(r.plates[j].style.width) + CFG.itemGap;
      }
    }
  }

  function measure() {
    viewW = container.offsetWidth || window.innerWidth;
    viewH = container.offsetHeight || 360;
  }

  function bindEvents() {
    // 滚轮绑定在容器上：仅当指针悬停在画廊内时接管滚轮（up/down 双向浏览胶片），
    // 离开画廊则不做处理，交给页面正常上下滚动。
    container.addEventListener('wheel', onWheel, { passive: false });
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
    // 指针没在画廊内：不拦截，页面正常滚动（浏览画廊下方的旅行内容）
    if (!pointer.active) return;
    // 指针在画廊内：阻止页面滚动，双向滚轮都用来微调胶片偏移
    e.preventDefault();
    userOffset += e.deltaY * CFG.wheelSensitivity * CFG.speed;
  }
  function onDown(e) {
    dragX = e.clientX;
  }
  function onMove(e) {
    if (dragX === null) return;
    var dx = e.clientX - dragX;
    dragX = e.clientX;
    userOffset += dx * CFG.dragSensitivity;
  }
  function onUp() { dragX = null; }
  function onResize() {
    measure();
    rect = container.getBoundingClientRect();
  }

  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);

    var elapsed = now / 1000;
    var base = -elapsed * CFG.autoScroll + userOffset;

    var tiltEl = stage.querySelector('.travel-reel-tilt');
    tiltEl.style.transform = 'translateZ(0) rotate(' + (-CFG.tilt) + 'deg)';
    tiltEl.style.height = (CFG._stackH || reels.length * (CFG.rowHeight + CFG.rowGap)) + 'px';

    var mouseLocal = null;
    if (pointer.active) {
      mouseLocal = { x: pointer.x - rect.left, y: pointer.y - rect.top };
    }

    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      // 按行宽取模实现无缝循环
      var off = ((base * r.speed) % r.w + r.w) % r.w - r.w / 2;
      var rowOff = (r.row - r.mid) / (r.mid || 1);
      var arch = rowOff * rowOff * CFG.arch;
      var dim = 1 - Math.abs(rowOff) * CFG.dim;
      var taper = 1 - Math.abs(rowOff) * CFG.taper;

      r.el.style.opacity = dim;
      r.el.style.transform =
        'translateX(' + off + 'px)' +
        'scale(' + taper + ')';

      // 灰度聚焦：仅在指针位于该行附近时更新各块，否则统一应用静态灰度
      var centerOnScreen = off + viewW / 2;
      var rowCenterY = r.row * (r.rowH + (CFG._gap || CFG.rowGap)) + r.rowH / 2;

      if (mouseLocal) {
        var near = Math.abs(mouseLocal.y - (arch + rowCenterY)) < CFG.focusRadius;
        for (var j = 0; j < r.plates.length; j++) {
          var g = CFG.grayscale;
          var bri = 1;
          if (near) {
            var px = centerOnScreen + r.centers[j];
            var dy = arch - mouseLocal.y + rowCenterY;
            var dist = Math.sqrt(Math.pow(px - mouseLocal.x, 2) + dy * dy);
            if (dist < CFG.focusRadius) {
              var k = 1 - (dist / CFG.focusRadius) * CFG.focusStrength;
              g = CFG.grayscale * (1 - k);
              bri = 1 + k * 0.12;
            }
          }
          var f = 'grayscale(' + g.toFixed(2) + ') brightness(' + bri.toFixed(2) + ')';
          if (r.plates[j]._f !== f) {
            r.plates[j].style.filter = f;
            r.plates[j]._f = f;
          }
        }
      } else {
        var cg = 'grayscale(' + CFG.grayscale + ') brightness(1)';
        for (var j2 = 0; j2 < r.plates.length; j2++) {
          if (r.plates[j2]._f !== cg) {
            r.plates[j2].style.filter = cg;
            r.plates[j2]._f = cg;
          }
        }
      }
    }
  }

  function init() {
    fetch(IMG_JSON)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        // JSON 已内置每张图片的 w/h，可直接布局，无需再阻塞等待全部图片下载
        var metas = d.images || [];
        if (!metas.length) return;
        build(metas);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();