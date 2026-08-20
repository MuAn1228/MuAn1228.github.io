// ===== 展示页顶部横幅「字母故障」LetterGlitch（reactbits.dev 的 vanilla 移植）=====
// 在容器内渲染一整屏不断随机打乱的字符网格，模拟字母故障效果。
// 仅在「展示」页自动初始化（其它页面不生效）。
(function () {
  'use strict';

  function hexToRgb(hex) {
    var shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthand, function (m, r, g, b) { return r + r + g + g + b + b; });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : null;
  }

  function interpolateColor(start, end, factor) {
    return 'rgb(' +
      Math.round(start.r + (end.r - start.r) * factor) + ',' +
      Math.round(start.g + (end.g - start.g) * factor) + ',' +
      Math.round(start.b + (end.b - start.b) * factor) + ')';
  }

  function LetterGlitch(el, opts) {
    opts = opts || {};
    this.el = el;
    this.colors = opts.colors || ['#2b4539', '#61dca3', '#61b3dc'];
    this.background = opts.background || '#000000';
    this.speed = opts.speed || 50;
    this.centerVignette = !!opts.centerVignette;
    this.outerVignette = opts.outerVignette !== false;
    this.smooth = opts.smooth !== false;
    this.characters = Array.from(opts.characters || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789');
    this.fontSize = opts.fontSize || 16;
    this.charWidth = opts.charWidth || 10;
    this.charHeight = opts.charHeight || 20;

    this.letters = [];
    this.grid = { columns: 0, rows: 0 };
    this.context = null;
    this.lastGlitchTime = Date.now();
    this.raf = null;

    this._build();
    this.resize();
    this.animate();
    this._watchResize();
  }

  LetterGlitch.prototype.randomChar = function () {
    return this.characters[Math.floor(Math.random() * this.characters.length)];
  };

  LetterGlitch.prototype.randomColor = function () {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  };

  LetterGlitch.prototype._vignette = function (type) {
    var d = document.createElement('div');
    d.style.position = 'absolute';
    d.style.top = '0';
    d.style.left = '0';
    d.style.width = '100%';
    d.style.height = '100%';
    d.style.pointerEvents = 'none';
    d.style.background = type === 'outer'
      ? 'radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)'
      : 'radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)';
    return d;
  };

  LetterGlitch.prototype._build = function () {
    this.wrap = document.createElement('div');
    this.wrap.style.position = 'absolute';
    this.wrap.style.top = '0';
    this.wrap.style.left = '0';
    this.wrap.style.width = '100%';
    this.wrap.style.height = '100%';
    this.wrap.style.zIndex = '0';
    this.wrap.style.background = this.background;
    this.wrap.style.overflow = 'hidden';
    this.el.appendChild(this.wrap);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.wrap.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');

    if (this.outerVignette) this.wrap.appendChild(this._vignette('outer'));
    if (this.centerVignette) this.wrap.appendChild(this._vignette('center'));
  };

  LetterGlitch.prototype.initLetters = function (columns, rows) {
    this.grid = { columns: columns, rows: rows };
    var total = columns * rows;
    this.letters = new Array(total);
    for (var i = 0; i < total; i++) {
      this.letters[i] = {
        char: this.randomChar(),
        color: this.randomColor(),
        targetColor: this.randomColor(),
        colorProgress: 1
      };
    }
  };

  LetterGlitch.prototype.resize = function () {
    var rect = this.wrap.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.initLetters(Math.ceil(w / this.charWidth), Math.ceil(h / this.charHeight));
    this.draw();
  };

  LetterGlitch.prototype.draw = function () {
    if (!this.context || !this.letters.length) return;
    var ctx = this.context;
    var rect = this.wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.font = this.fontSize + 'px monospace';
    ctx.textBaseline = 'top';
    for (var i = 0; i < this.letters.length; i++) {
      var letter = this.letters[i];
      var x = (i % this.grid.columns) * this.charWidth;
      var y = Math.floor(i / this.grid.columns) * this.charHeight;
      ctx.fillStyle = letter.color;
      ctx.fillText(letter.char, x, y);
    }
  };

  LetterGlitch.prototype.updateLetters = function () {
    if (!this.letters.length) return;
    var count = Math.max(1, Math.floor(this.letters.length * 0.05));
    for (var i = 0; i < count; i++) {
      var index = Math.floor(Math.random() * this.letters.length);
      var letter = this.letters[index];
      if (!letter) continue;
      letter.char = this.randomChar();
      letter.targetColor = this.randomColor();
      if (!this.smooth) {
        letter.color = letter.targetColor;
        letter.colorProgress = 1;
      } else {
        letter.colorProgress = 0;
      }
    }
  };

  LetterGlitch.prototype.handleSmooth = function () {
    var needsRedraw = false;
    for (var i = 0; i < this.letters.length; i++) {
      var letter = this.letters[i];
      if (letter.colorProgress < 1) {
        letter.colorProgress += 0.05;
        if (letter.colorProgress > 1) letter.colorProgress = 1;
        var start = hexToRgb(letter.color);
        var end = hexToRgb(letter.targetColor);
        if (start && end) {
          letter.color = interpolateColor(start, end, letter.colorProgress);
          needsRedraw = true;
        }
      }
    }
    if (needsRedraw) this.draw();
  };

  LetterGlitch.prototype.animate = function () {
    var self = this;
    var now = Date.now();
    if (document.visibilityState !== 'hidden') {
      if (now - this.lastGlitchTime >= this.speed) {
        this.updateLetters();
        this.draw();
        this.lastGlitchTime = now;
      }
      if (this.smooth) this.handleSmooth();
    }
    this.raf = requestAnimationFrame(function () { self.animate(); });
  };

  LetterGlitch.prototype._watchResize = function () {
    var self = this;
    var timeout;
    this._resizeHandler = function () {
      clearTimeout(timeout);
      timeout = setTimeout(function () { self.resize(); }, 100);
    };
    window.addEventListener('resize', this._resizeHandler);
  };

  LetterGlitch.prototype.destroy = function () {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resizeHandler);
    if (this.wrap && this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
  };

  window.LetterGlitch = LetterGlitch;

  // 仅在「展示」页的顶部横幅自动初始化
  function initShowcase() {
    // 展示页顶部特效已由黑洞(blackhole.js)取代，这里不再启用字母故障
    return;
    if (!/\/showcase\/?$/.test(window.location.pathname)) return;
    var header = document.getElementById('page-header');
    if (!header) return;
    header.classList.add('letterglitch-host');
    new LetterGlitch(header, {
      colors: ['#8e6bb5', '#a18cd1', '#6b5b95'],
      background: '#14101f',
      speed: 50,
      smooth: true,
      outerVignette: true,
      centerVignette: false
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShowcase);
  } else {
    initShowcase();
  }
})();