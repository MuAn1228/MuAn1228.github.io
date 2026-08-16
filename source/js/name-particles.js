// ===== 展示页名字：Canvas 粒子文字 + 鼠标几何放射 hover =====
(function () {
  var TEXT = 'Li Bohang';
  var COLOR = '#8e6bb5';
  var FONT_SIZE = 48;
  var FONT = '600 ' + FONT_SIZE + 'px Georgia, "Times New Roman", "Songti SC", serif';
  var STEP = 3;      // 采样步长（越小粒子越密）
  var DOT = 2;       // 粒子大小
  var RADIUS = 70;   // 鼠标作用半径
  var FORCE = 55;    // 排斥力

  function init() {
    var canvas = document.getElementById('showcase-name');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // 离屏 canvas 采样文字像素
    var off = document.createElement('canvas');
    var offCtx = off.getContext('2d');
    offCtx.font = FONT;
    var tw = Math.ceil(offCtx.measureText(TEXT).width);
    var th = Math.ceil(FONT_SIZE * 1.6);
    off.width = tw;
    off.height = th;
    offCtx.font = FONT;
    offCtx.textBaseline = 'top';
    offCtx.fillStyle = '#000';
    offCtx.fillText(TEXT, 0, FONT_SIZE * 0.15);

    // 采样粒子（从文字像素里取点）
    var data = offCtx.getImageData(0, 0, tw, th).data;
    var particles = [];
    for (var y = 0; y < th; y += STEP) {
      for (var x = 0; x < tw; x += STEP) {
        if (data[(y * tw + x) * 4 + 3] > 128) {
          particles.push({ hx: x, hy: y, x: x, y: y, vx: 0, vy: 0 });
        }
      }
    }

    canvas.width = tw;
    canvas.height = th;
    canvas.style.width = tw + 'px';
    canvas.style.height = th + 'px';

    var mouse = { x: -9999, y: -9999, on: false };
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * (tw / r.width);
      mouse.y = (e.clientY - r.top) * (th / r.height);
      mouse.on = true;
    });
    canvas.addEventListener('mouseleave', function () {
      mouse.on = false;
      mouse.x = -9999;
      mouse.y = -9999;
    });

    function frame() {
      ctx.clearRect(0, 0, tw, th);
      ctx.fillStyle = COLOR;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var d2 = dx * dx + dy * dy;
        // 鼠标附近：向外排斥（几何放射）
        if (mouse.on && d2 < RADIUS * RADIUS && d2 > 0.1) {
          var d = Math.sqrt(d2);
          var f = (RADIUS - d) / RADIUS * FORCE;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        // 弹簧回位
        p.vx += (p.hx - p.x) * 0.06;
        p.vy += (p.hy - p.y) * 0.06;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillRect(p.x, p.y, DOT, DOT);
      }
      requestAnimationFrame(frame);
    }
    frame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
