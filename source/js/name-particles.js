// ===== 粒子文字 + 鼠标几何放射 hover（通用）=====
// 用法：给任意元素加 class="particle-text" data-text="文字"（可选 data-color 颜色、data-font 字号）
// 也可对普通元素（如 h1）加 class，脚本会自动把它替换成 canvas
// 站点标题 #site-title 自动应用（白色，适配深色头部）
(function () {
  var STEP = 3, DOT = 2, RADIUS = 70, FORCE = 55;
  var SERIF = 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", "SimSun", serif';

  function makeParticleText(el, opts) {
    opts = opts || {};
    var text = opts.text || el.getAttribute('data-text') || el.textContent.trim();
    var color = opts.color || el.getAttribute('data-color') || '#8e6bb5';
    var fontSize = opts.font || parseInt(el.getAttribute('data-font')) || 48;
    var font = '600 ' + fontSize + 'px ' + SERIF;

    // 离屏采样文字像素
    var off = document.createElement('canvas');
    var offCtx = off.getContext('2d');
    offCtx.font = font;
    var tw = Math.ceil(offCtx.measureText(text).width);
    var th = Math.ceil(fontSize * 1.6);
    off.width = tw;
    off.height = th;
    offCtx.font = font;
    offCtx.textBaseline = 'top';
    offCtx.fillStyle = '#000';
    offCtx.fillText(text, 0, fontSize * 0.15);

    var data = offCtx.getImageData(0, 0, tw, th).data;
    var particles = [];
    for (var y = 0; y < th; y += STEP) {
      for (var x = 0; x < tw; x += STEP) {
        if (data[(y * tw + x) * 4 + 3] > 128) {
          particles.push({ hx: x, hy: y, x: x, y: y, vx: 0, vy: 0 });
        }
      }
    }

    // 目标 canvas（若原元素已是 canvas 则复用，否则新建）
    var canvas = el.tagName === 'CANVAS' ? el : document.createElement('canvas');
    canvas.className = (canvas.className ? canvas.className + ' ' : '') + 'particle-text-canvas';
    canvas.setAttribute('aria-label', text);
    canvas.width = tw;
    canvas.height = th;
    canvas.style.width = tw + 'px';
    canvas.style.height = th + 'px';

    var ctx = canvas.getContext('2d');
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
      ctx.fillStyle = color;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var d2 = dx * dx + dy * dy;
        if (mouse.on && d2 < RADIUS * RADIUS && d2 > 0.1) {
          var d = Math.sqrt(d2);
          var f = (RADIUS - d) / RADIUS * FORCE;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
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

    if (canvas !== el) {
      el.parentNode.replaceChild(canvas, el);
    }
  }

  function init() {
    document.querySelectorAll('.particle-text').forEach(function (el) {
      makeParticleText(el);
    });

    // 站点标题（首页为站点名，内容页为页面标题）
    var siteTitle = document.getElementById('site-title');
    if (siteTitle) {
      makeParticleText(siteTitle, { color: '#ffffff', font: 52 });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
