// ===== 粒子文字 + 鼠标几何放射 hover（通用）=====
// 用法：给任意元素加 class="particle-text" data-text="文字"（可选 data-color 颜色、data-font 字号）
// 也可对普通元素（如 h1）加 class，脚本会自动把它替换成 canvas
// 站点标题 #site-title 自动应用（白色，适配深色头部）
(function () {
  var STEP = 3, DOT = 1.5, RADIUS = 15, FORCE = 55;
  var SAMPLE_SCALE = 3;
  var FONT = 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", "SimSun", serif';

  function makeParticleText(el, opts) {
    opts = opts || {};
    var text = opts.text || el.getAttribute('data-text') || el.textContent.trim();
    var color = opts.color || el.getAttribute('data-color') || '#8e6bb5';
    var fontSize = opts.font || parseInt(el.getAttribute('data-font')) || 48;
    // 离屏高分采样：以 3 倍字号渲染，宋体细笔画也能被完整采到
    var off = document.createElement('canvas');
    var offCtx = off.getContext('2d');
    var sampleSize = fontSize * SAMPLE_SCALE;
    var sampleFont = '600 ' + sampleSize + 'px ' + FONT;
    offCtx.font = sampleFont;
    var twHigh = Math.ceil(offCtx.measureText(text).width);
    var thHigh = Math.ceil(sampleSize * 1.6);
    off.width = twHigh;
    off.height = thHigh;
    offCtx.font = sampleFont;
    offCtx.textBaseline = 'top';
    offCtx.fillStyle = '#000';
    offCtx.fillText(text, 0, sampleSize * 0.15);

    var data = offCtx.getImageData(0, 0, twHigh, thHigh).data;
    var tw = Math.max(1, Math.round(twHigh / SAMPLE_SCALE));
    var th = Math.max(1, Math.round(thHigh / SAMPLE_SCALE));

    var particles = [];
    for (var y = 0; y < thHigh; y += STEP) {
      for (var x = 0; x < twHigh; x += STEP) {
        if (data[(y * twHigh + x) * 4 + 3] > 128) {
          var px = x / SAMPLE_SCALE, py = y / SAMPLE_SCALE;
          particles.push({ hx: px, hy: py, x: px, y: py, vx: 0, vy: 0 });
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
    // 展示页顶部由黑洞(blackhole.js)取代，不再做粒子标题
    if (/\/showcase\/?($|\?|#)/.test(window.location.pathname)) return;
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
