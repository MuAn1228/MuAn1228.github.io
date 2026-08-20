// ===== 书籍页标题横幅：ASCIIText（React Bits 移植为原生 JS，依赖 CDN 远程 IBM Plex Mono 失败时自动回退等宽字体）=====
// 用 Three.js 把「阅读」二字渲染成 3D 平面，再经 AsciiFilter 转成 ASCII 字符，随鼠标 hue 变化。
// 仅 /fun/books/ 生效。
(function () {
  'use strict';

  if (!/\/fun\/books\/?($|\?|#)/.test(window.location.pathname)) return;
  if (!window.THREE) return;

  var CONTAINER_ID = 'book-ascii-title';
  var container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  // 移入页面标题横幅（#page-header）作为背景层
  var header = document.getElementById('page-header');
  if (header && header !== container.parentNode) {
    header.appendChild(container);
  }

  var THREE = window.THREE;

  Math.map = function (n, start, stop, start2, stop2) {
    return ((n - start) / (stop - start)) * (stop2 - start2) + start2;
  };

  var PX_RATIO = window.devicePixelRatio || 1;

  var vertexShader = [
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform float mouse;',
    'uniform float uEnableWaves;',
    '',
    'void main() {',
    '    vUv = uv;',
    '    float time = uTime * 5.;',
    '',
    '    float waveFactor = uEnableWaves;',
    '',
    '    vec3 transformed = position;',
    '',
    '    transformed.x += sin(time + position.y) * 0.5 * waveFactor;',
    '    transformed.y += cos(time + position.z) * 0.15 * waveFactor;',
    '    transformed.z += sin(time + position.x) * waveFactor;',
    '',
    '    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);',
    '}'
  ].join('\n');

  var fragmentShader = [
    'varying vec2 vUv;',
    'uniform float mouse;',
    'uniform float uTime;',
    'uniform sampler2D uTexture;',
    '',
    'void main() {',
    '    float time = uTime;',
    '    vec2 pos = vUv;',
    '',
    '    float move = sin(time + mouse) * 0.01;',
    '    float r = texture2D(uTexture, pos + cos(time * 2. - time + pos.x) * .01).r;',
    '    float g = texture2D(uTexture, pos + tan(time * .5 + pos.x - time) * .01).g;',
    '    float b = texture2D(uTexture, pos - cos(time * 2. + time + pos.y) * .01).b;',
    '    float a = texture2D(uTexture, pos).a;',
    '    gl_FragColor = vec4(r, g, b, a);',
    '}'
  ].join('\n');

  function AsciiFilter(renderer, opts) {
    opts = opts || {};
    this.renderer = renderer;
    this.domElement = document.createElement('div');
    this.domElement.style.position = 'absolute';
    this.domElement.style.top = '0';
    this.domElement.style.left = '0';
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';

    this.pre = document.createElement('pre');
    this.domElement.appendChild(this.pre);
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.domElement.appendChild(this.canvas);

    this.deg = 0;
    this.invert = opts.invert !== undefined ? opts.invert : true;
    this.fontSize = opts.fontSize || 8;
    this.fontFamily = opts.fontFamily || "monospace";
    this.charset = opts.charset || ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

    this.context.webkitImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.imageSmoothingEnabled = false;

    this.onMouseMove = this.onMouseMove.bind(this);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  AsciiFilter.prototype.setSize = function (width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.reset();
    this.center = { x: width / 2, y: height / 2 };
    this.mouse = { x: this.center.x, y: this.center.y };
  };

  AsciiFilter.prototype.reset = function () {
    this.context.font = this.fontSize + 'px ' + this.fontFamily;
    var charWidth = this.context.measureText('A').width;

    this.cols = Math.floor(this.width / (this.fontSize * (charWidth / this.fontSize)));
    this.rows = Math.floor(this.height / this.fontSize);

    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.pre.style.fontFamily = this.fontFamily;
    this.pre.style.fontSize = this.fontSize + 'px';
    this.pre.style.margin = '0';
    this.pre.style.padding = '0';
    this.pre.style.lineHeight = '1em';
    this.pre.style.position = 'absolute';
    this.pre.style.left = '0';
    this.pre.style.top = '0';
    this.pre.style.zIndex = '9';
    this.pre.style.backgroundAttachment = 'fixed';
    this.pre.style.mixBlendMode = 'difference';
  };

  AsciiFilter.prototype.render = function (scene, camera) {
    this.renderer.render(scene, camera);

    var w = this.canvas.width;
    var h = this.canvas.height;
    this.context.clearRect(0, 0, w, h);
    if (this.context && w && h) {
      this.context.drawImage(this.renderer.domElement, 0, 0, w, h);
    }
    this.asciify(this.context, w, h);
    this.hue();
  };

  AsciiFilter.prototype.onMouseMove = function (e) {
    this.mouse = { x: e.clientX * PX_RATIO, y: e.clientY * PX_RATIO };
  };

  AsciiFilter.prototype.hue = function () {
    var deg = (Math.atan2(this.dy, this.dx) * 180) / Math.PI;
    this.deg += (deg - this.deg) * 0.075;
    this.domElement.style.filter = 'hue-rotate(' + this.deg.toFixed(1) + 'deg)';
  };

  Object.defineProperty(AsciiFilter.prototype, 'dx', {
    get: function () { return this.mouse.x - this.center.x; }
  });
  Object.defineProperty(AsciiFilter.prototype, 'dy', {
    get: function () { return this.mouse.y - this.center.y; }
  });

  AsciiFilter.prototype.asciify = function (ctx, w, h) {
    if (!(w && h)) return;
    var imgData = ctx.getImageData(0, 0, w, h).data;
    var str = '';
    var charset = this.charset;
    var len = charset.length;
    var invert = this.invert;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = x * 4 + y * 4 * w;
        var r = imgData[i];
        var g = imgData[i + 1];
        var b = imgData[i + 2];
        var a = imgData[i + 3];
        if (a === 0) { str += ' '; continue; }
        var gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
        var idx = Math.floor((1 - gray) * (len - 1));
        if (invert) idx = len - idx - 1;
        str += charset[idx];
      }
      str += '\n';
    }
    this.pre.innerHTML = str;
  };

  AsciiFilter.prototype.dispose = function () {
    document.removeEventListener('mousemove', this.onMouseMove);
  };

  function CanvasTxt(txt, opts) {
    opts = opts || {};
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.txt = txt;
    this.fontSize = opts.fontSize || 200;
    this.fontFamily = opts.fontFamily || 'monospace';
    this.color = opts.color || '#fdf9f3';
    this.font = '600 ' + this.fontSize + 'px ' + this.fontFamily;
  }

  CanvasTxt.prototype.resize = function () {
    this.context.font = this.font;
    var metrics = this.context.measureText(this.txt);
    var textWidth = Math.ceil(metrics.width) + 20;
    var textHeight = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 20;
    this.canvas.width = textWidth;
    this.canvas.height = textHeight;
  };

  CanvasTxt.prototype.render = function () {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = this.color;
    this.context.font = this.font;
    var metrics = this.context.measureText(this.txt);
    var yPos = 10 + metrics.actualBoundingBoxAscent;
    this.context.fillText(this.txt, 10, yPos);
  };

  Object.defineProperty(CanvasTxt.prototype, 'width', {
    get: function () { return this.canvas.width; }
  });
  Object.defineProperty(CanvasTxt.prototype, 'height', {
    get: function () { return this.canvas.height; }
  });
  Object.defineProperty(CanvasTxt.prototype, 'texture', {
    get: function () { return this.canvas; }
  });

  function CanvAscii(cfg, containerElem, width, height) {
    this.textString = cfg.text;
    this.asciiFontSize = cfg.asciiFontSize;
    this.textFontSize = cfg.textFontSize;
    this.textColor = cfg.textColor;
    this.planeBaseHeight = cfg.planeBaseHeight;
    this.enableWaves = cfg.enableWaves;

    this.container = containerElem;
    this.width = width;
    this.height = height;

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 1000);
    this.camera.position.z = 30;

    this.scene = new THREE.Scene();
    this.mouse = { x: this.width / 2, y: this.height / 2 };

    this.onMouseMove = this.onMouseMove.bind(this);
  }

  CanvAscii.prototype.init = function () {
    var self = this;
    // 文字用系统等宽字体，无需等待整页远程字体（document.fonts.ready 可能被 CDN 字体挂起），
    // 直接同步渲染，标题特效瞬时出现。
    self.setMesh();
    self.setRenderer();
    return Promise.resolve();
  };

  CanvAscii.prototype.setMesh = function () {
    this.textCanvas = new CanvasTxt(this.textString, {
      fontSize: this.textFontSize,
      fontFamily: 'monospace',
      color: this.textColor
    });
    this.textCanvas.resize();
    this.textCanvas.render();

    this.texture = new THREE.CanvasTexture(this.textCanvas.texture);
    this.texture.minFilter = THREE.NearestFilter;

    var textAspect = this.textCanvas.width / this.textCanvas.height;
    var baseH = this.planeBaseHeight;
    var planeW = baseH * textAspect;
    var planeH = baseH;

    this.geometry = new THREE.PlaneGeometry(planeW, planeH, 36, 36);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        mouse: { value: 1.0 },
        uTexture: { value: this.texture },
        uEnableWaves: { value: this.enableWaves ? 1.0 : 0.0 }
      }
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  };

  CanvAscii.prototype.setRenderer = function () {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.filter = new AsciiFilter(this.renderer, {
      fontFamily: 'monospace',
      fontSize: this.asciiFontSize,
      invert: true
    });

    this.container.appendChild(this.filter.domElement);
    this.setSize(this.width, this.height);

    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('touchmove', this.onMouseMove);
  };

  CanvAscii.prototype.setSize = function (w, h) {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.filter.setSize(w, h);
    this.center = { x: w / 2, y: h / 2 };
  };

  CanvAscii.prototype.load = function () {
    this.animate();
  };

  CanvAscii.prototype.onMouseMove = function (evt) {
    var e = evt.touches ? evt.touches[0] : evt;
    var bounds = this.container.getBoundingClientRect();
    var x = e.clientX - bounds.left;
    var y = e.clientY - bounds.top;
    this.mouse = { x: x, y: y };
  };

  CanvAscii.prototype.animate = function () {
    var self = this;
    var animateFrame = function () {
      self.animationFrameId = requestAnimationFrame(animateFrame);
      if (document.visibilityState === 'hidden') return; // 后台暂停
      self.render();
    };
    animateFrame();
  };

  CanvAscii.prototype.render = function () {
    var time = new Date().getTime() * 0.001;

    this.textCanvas.render();
    this.texture.needsUpdate = true;

    this.mesh.material.uniforms.uTime.value = Math.sin(time);

    this.updateRotation();
    this.filter.render(this.scene, this.camera);
  };

  CanvAscii.prototype.updateRotation = function () {
    var x = Math.map(this.mouse.y, 0, this.height, 0.5, -0.5);
    var y = Math.map(this.mouse.x, 0, this.width, -0.5, 0.5);
    this.mesh.rotation.x += (x - this.mesh.rotation.x) * 0.05;
    this.mesh.rotation.y += (y - this.mesh.rotation.y) * 0.05;
  };

  CanvAscii.prototype.clear = function () {
    this.scene.traverse(function (obj) {
      if (obj.isMesh && typeof obj.material === 'object' && obj.material !== null) {
        Object.keys(obj.material).forEach(function (key) {
          var matProp = obj.material[key];
          if (matProp !== null && typeof matProp === 'object' && typeof matProp.dispose === 'function') {
            matProp.dispose();
          }
        });
        obj.material.dispose();
        obj.geometry.dispose();
      }
    });
    this.scene.clear();
  };

  CanvAscii.prototype.dispose = function () {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.filter) {
      this.filter.dispose();
      if (this.filter.domElement.parentNode) {
        this.container.removeChild(this.filter.domElement);
      }
    }
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('touchmove', this.onMouseMove);
    this.clear();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  };

  function begin() {
    var w = container.offsetWidth;
    var h = container.offsetHeight;
    if (!w || !h) {
      var ro0 = new ResizeObserver(function (entries) {
        var entry = entries[0];
        if (!entry) return;
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          ro0.disconnect();
          begin();
        }
      });
      ro0.observe(container);
      return;
    }

    var instance = new CanvAscii(
      {
        text: '阅读',
        asciiFontSize: 8,
        textFontSize: 200,
        textColor: '#fdf9f3',
        planeBaseHeight: 8,
        enableWaves: false
      },
      container,
      w,
      h
    );

    instance.init().then(function () {
      instance.load();
    });

    var ro = new ResizeObserver(function (entries) {
      var entry = entries[0];
      if (!entry) return;
      var ww = entry.contentRect.width;
      var hh = entry.contentRect.height;
      if (ww > 0 && hh > 0) instance.setSize(ww, hh);
    });
    ro.observe(container);
  }

  begin();
})();