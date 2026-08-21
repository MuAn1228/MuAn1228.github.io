/* =============================================================
 * 手势粒子效果（摄像头追踪握拳/张开来聚拢/散开粒子云）
 * 在 /fun/arcade/ 的「光点地球」tab 面板内运行。
 * 形状：我爱杭州(文字) / Heart / 地球(粒子地球)
 * 文档来源：Obsidian《用摄像头捕捉手势实现酷炫的粒子效果!》
 * ============================================================= */
(function () {
  'use strict';

  // 仅在小游戏页生效
  if (!/\/fun\/arcade\/?($|\?|#)/.test(window.location.pathname)) return;

  var stage = document.getElementById('particle-stage');
  if (!stage) return;

  /* ---------------- 加载可能尚缺的外部依赖 ---------------- */
  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  /* ---------- 需要 three.min (主题以 defer 注入，延迟赋值) ---------- */
  var THREE = null;

  var dom = {
    wrap: null,
    canvas: null,       // 渲染 canvas
    video: null,        // 隐式摄像头
    preview: null,      // 摄像头预览
    ui: null,
    loading: null,
    loadingscript: null
  };

  /* ---------------- 容器：粒子渲染 + UI 都放这里 ---------------- */
  dom.wrap = document.createElement('div');
  dom.wrap.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';
  stage.appendChild(dom.wrap);

  var hands = null;
  var cameraUtils = null;
  var running = false;   // 当前是否激活（动画 + 摄像头）
  var started = false;   // 是否已初始化（THREE 就绪并建好 scene）
  var animating = false; // rAF 是否在跑

  // ===== 配置 =====
  var CONFIG = {
    particleCount: 26000,
    baseSize: 1.1,
    defaultColor: 0x40c9ff,
    cameraZ: 25,
    scatterRadius: 35
  };

  var STATE = {
    currentShape: 'text',
    targetPositions: null,
    randomOffsets: null,
    handOpenness: 1.0,
    handPosition: { x: 0.5, y: 0.5 },
    handDetected: false,
    time: 0,
    lastResultAt: 0   // 最近一次手部识别结果的时间戳（毫秒）
  };

  var scene, camera, renderer, shaderMaterial, particles, geometry;
  var particleColors;     // 逐粒子颜色 (aColor attribute)
  var earthTextureData;   // 地球纹理采样 (用于地球着色)
  var lastColor = 0x40c9ff; // 上次用户选色
  var previewVisible = false;

  /* ------------- 顶点/片元着色器 ------------- */
  var vshader = [
    'attribute float size;',
    'attribute float random;',
    'attribute vec3 aColor;',
    'uniform float time;',
    'uniform float pixelRatio;',
    'uniform float handOpenness;',
    'varying float vAlpha;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec3 pos = position;',
    '  float wave = sin(time * 2.0 + pos.x * 0.1) * 0.1 * handOpenness;',
    '  pos.y += wave;',
    '  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);',
    '  float dist = -mvPosition.z;',
    '  gl_PointSize = size * (0.8 + 0.4 * random) * pixelRatio * (280.0 / dist);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  float twinkle = sin(time * 1.5 + random * 10.0);',
    '  vAlpha = 0.55 + 0.45 * twinkle;',
    '  vColor = aColor;',
    '}'
  ].join('\n');
  var fshader = [
    'uniform vec3 color;',
    'varying float vAlpha;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec2 xy = gl_PointCoord.xy - vec2(0.5);',
    '  float r = length(xy);',
    '  if (r > 0.5) discard;',
    '  float edge = 1.0 - smoothstep(0.05, 0.08, r);',
    '  gl_FragColor = vec4(color * vColor, vAlpha * edge);',
    '}'
  ].join('\n');

  // ============ 中央控制器：初始化 Three.js 场景 ============
  function initThree() {
    THREE = window.THREE; // 延迟捕获（three.min.js 为 defer 加载）
    if (!THREE) return false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c14);
    scene.fog = new THREE.FogExp2(0x0a0c14, 0.012);

    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || 560;
    camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 200);
    camera.position.z = CONFIG.cameraZ;

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    var pr = Math.max(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(pr);
    dom.canvas = renderer.domElement;
    dom.canvas.style.display = 'block';
    dom.canvas.style.background = 'radial-gradient(ellipse at center,#141a2b 0%,#0a0c14 70%)';
    dom.wrap.appendChild(dom.canvas);

    shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(CONFIG.defaultColor) },
        pixelRatio: { value: pr },
        handOpenness: { value: 1.0 }
      },
      vertexShader: vshader,
      fragmentShader: fshader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    initParticleGeometry();
    STATE.randomOffsets = new Float32Array(CONFIG.particleCount * 3);
    STATE.targetPositions = generateTargetPositions(STATE.currentShape);
    prefillOffsets();

    buildUI();
    return true;
  }

  // 粒子几何一进入就建好；颜色默认纯白（让 color uniform 决定色），地球切到时再填
  function initParticleGeometry() {
    geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(CONFIG.particleCount * 3);
    var randoms = new Float32Array(CONFIG.particleCount);
    var sizes = new Float32Array(CONFIG.particleCount);
    particleColors = new Float32Array(CONFIG.particleCount * 3);

    for (var i = 0; i < CONFIG.particleCount; i++) {
      var r = CONFIG.scatterRadius * (0.5 + Math.random());
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i*3+2] = r * Math.cos(phi);
      randoms[i] = Math.random();
      sizes[i] = CONFIG.baseSize * (0.5 + Math.random());
      particleColors[i*3] = 1; particleColors[i*3+1] = 1; particleColors[i*3+2] = 1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(particleColors, 3));

    particles = new THREE.Points(geometry, shaderMaterial);
    scene.add(particles);
  }

  function prefillOffsets() {
    var pos = particles.geometry.attributes.position.array;
    for (var i = 0; i < CONFIG.particleCount; i++) {
      STATE.randomOffsets[i*3] = pos[i*3];
      STATE.randomOffsets[i*3+1] = pos[i*3+1];
      STATE.randomOffsets[i*3+2] = pos[i*3+2];
    }
  }

  /* ============ 形状生成 ============ */
  function getPointsFromText(textString, sizePx) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = 900;
    canvas.height = 220;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + (sizePx || 96) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textString, canvas.width / 2, canvas.height / 2);
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var pts = [];
    var step = 3;
    for (var y = 0; y < canvas.height; y += step) {
      for (var x = 0; x < canvas.width; x += step) {
        if (data[(y * canvas.width + x) * 4] > 50) {
          pts.push({ x: (x - canvas.width / 2) * 0.055, y: -(y - canvas.height / 2) * 0.055 });
        }
      }
    }
    return pts;
  }

  // 把某形状的粒子着色全设为白色（由 color uniform 控色）
  function fillColorWhite() {
    for (var i = 0; i < CONFIG.particleCount; i++) {
      particleColors[i*3] = 1; particleColors[i*3+1] = 1; particleColors[i*3+2] = 1;
    }
    geometry.attributes.aColor.needsUpdate = true;
  }

  // 生成地球纹理采样数据（海洋/陆地辨识），供地球形状着色
  function loadEarthData(cb) {
    if (earthTextureData) { cb(); return; }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      var cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      try { earthTextureData = cx.getImageData(0, 0, c.width, c.height).data; }
      catch (e) { earthTextureData = null; }
      cb();
    };
    img.onerror = function () { earthTextureData = null; cb(); };
    img.src = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg';
  }

  function generateTargetPositions(shapeType) {
    var count = CONFIG.particleCount;
    var targets = new Float32Array(count * 3);
    var textPoints = [];

    if (shapeType === 'text') {
      textPoints = getPointsFromText('我爱杭州');
    } else if (shapeType === 'heart') {
      textPoints = getPointsFromText('❤️');
    }

    for (var i = 0; i < count; i++) {
      var x, y, z, idx = i * 3;
      if (shapeType === 'heart') {
        if (textPoints.length) {
          var p = textPoints[i % textPoints.length];
          var s = 2.2;
          x = p.x * s; y = p.y * s - 2.2; z = (Math.random() - 0.5) * 3.4 * s;
        } else { x = y = z = 0; }
      } else if (shapeType === 'earth') {
        // 地球：斐波那契均匀球面点，略留一点随机厚度
        var rr = 6;
        var gy = 1 - (i / (count - 1)) * 2;
        var rad = Math.sqrt(1 - gy * gy);
        var th = Math.PI * (3 - Math.sqrt(5)) * i;
        x = Math.cos(th) * rad * rr;
        y = gy * rr;
        z = Math.sin(th) * rad * rr;
      } else if (shapeType === 'text') {
        if (textPoints.length) {
          var q = textPoints[i % textPoints.length];
          x = q.x; y = q.y; z = (Math.random() - 0.5) * 2.4;
        } else {
          x = (Math.random() - 0.5) * 20;
          y = (Math.random() - 0.5) * 20;
          z = (Math.random() - 0.5) * 20;
        }
      }
      targets[idx] = x; targets[idx+1] = y; targets[idx+2] = z;
    }
    return targets;
  }

  // 地球形状时按纹理采样给粒子着色（海=蓝，陆=黄/绿）
  function colorizeEarth() {
    if (!earthTextureData) { fillColorWhite(); return; }
    var tw = 2048, th = 1024;
    // 由球面坐标反推 uv（与生成时一致，gy/th）
    for (var i = 0; i < CONFIG.particleCount; i++) {
      var gy = 1 - (i / (CONFIG.particleCount - 1)) * 2;
      var lat = Math.asin(gy) * 180 / Math.PI;
      var thf = Math.PI * (3 - Math.sqrt(5)) * i;
      var lon = thf * 180 / Math.PI;
      lon = ((lon % 360) + 360) % 360;
      var u = Math.round(lon / 360 * (tw - 1));
      var v = Math.round((90 - lat) / 180 * (th - 1));
      var idxpx = (v * tw + u) * 4;
      var R = earthTextureData[idxpx], G = earthTextureData[idxpx+1], B = earthTextureData[idxpx+2];
      // 采样长宽可能与 2048/1024 不符，取实际尺寸的缓冲索引
      // (此处用固定 2048x1024 兜底；实际以 data 长度反推宽度)
      var R2 = R, G2 = G, B2 = B;
      // 粗略判别：天空是深蓝近黑，海洋偏蓝而暗，陆地偏黄/绿
      var brightness = 0.3 * R2 + 0.6 * G2 + 0.1 * B2;
      var r, g, b;
      if (brightness < 0.06) { r = 0.10; g = 0.20; b = 0.45; }         // 太空/暗部 → 蔚蓝
      else if (B2 > R2 && B2 > G2) {
        // 海洋：深浅蓝
        r = 0.06; g = 0.35; b = 0.85;
        var sh = 0.6 + 0.4 * Math.sin(thf); r += sh * 0.05; b += sh * 0.08;
      } else {
        // 陆地：绿黄
        r = 0.45; g = 0.78; b = 0.35;
        var sh2 = 0.5 + 0.5 * Math.sin(thf);
        r += sh2 * 0.12; g += sh2 * 0.05;
      }
      particleColors[i*3] = r; particleColors[i*3+1] = g; particleColors[i*3+2] = b;
    }
    geometry.attributes.aColor.needsUpdate = true;
    // 地球用本色，uniform 色置白
    shaderMaterial.uniforms.color.value.set(0xffffff);
    if (dom.colorCode) dom.colorCode.textContent = '#ffffff';
  }

  /* ============ UI ============ */
  function buildUI() {
    dom.ui = document.createElement('div');
    dom.ui.className = 'gp-panel';
    dom.ui.innerHTML =
      '<div class="gp-head">' +
        '<span class="gp-title">光点地球 · 手势粒子</span>' +
        '<span class="gp-dot" id="gp-dot"></span>' +
      '</div>' +
      '<div class="gp-row">' +
        '<span class="gp-label">形状</span>' +
        '<button class="gp-btn is-active" data-shape="text">我爱杭州</button>' +
        '<button class="gp-btn" data-shape="heart">爱❤️</button>' +
        '<button class="gp-btn" data-shape="earth">地球</button>' +
      '</div>' +
      '<div class="gp-row">' +
        '<span class="gp-label">颜色</span>' +
        '<span class="gp-code" id="gp-colorCode">#40c9ff</span>' +
        '<input type="color" id="gp-colorPicker" value="#40c9ff">' +
      '</div>' +
      '<div class="gp-row">' +
        '<span class="gp-label">镜头画面</span>' +
        '<label class="gp-switch"><input type="checkbox" id="gp-camToggle"><span></span></label>' +
      '</div>' +
      '<div class="gp-tip">握拳收拢粒子 · 张开散开粒子 · 移动手掌控制旋转</div>' +
      '<div class="gp-row gp-debug-row" style="display:none" id="gp-debug-row">' +
        '<span class="gp-label">手势</span>' +
        '<span class="gp-code" id="gp-debug-val">0.00</span>' +
      '</div>';
    dom.wrap.appendChild(dom.ui);

    dom.loading = document.createElement('div');
    dom.loading.className = 'gp-loading';
    dom.loading.innerHTML = '<div class="gp-spinner"></div><div>摄像头初始化中…</div>';
    dom.wrap.appendChild(dom.loading);

    // 摄像头超时回退：5 秒后自动隐藏 loading，粒子以自动旋转展示
    dom.loading._hideTimeout = setTimeout(function () {
      if (!dom.loading) return;
      if (dom.loading.style.display === 'none') return; // 摄像头已正常启动
      hideLoadingSpinner();
    }, 5000);

    bindUI();
  }

  // 隐藏 loading 提示（渐隐动画）
  var _hidingLoading = false;
  function hideLoadingSpinner() {
    if (_hidingLoading) return;
    _hidingLoading = true;
    if (!dom.loading || dom.loading.style.display === 'none') return;
    dom.loading.innerHTML = '<div class="gp-spinner" style="opacity:0.3"></div><div style="color:#8892b0">摄像头不可用，粒子以自动旋转模式展示<br><span style="font-size:12px">（点击「镜头画面」开关可查看摄像头状态）</span></div>';
    dom.loading.style.opacity = '0.7';
    setTimeout(function () {
      if (!dom.loading) return;
      dom.loading.style.transition = 'opacity 0.8s';
      dom.loading.style.opacity = '0';
      setTimeout(function () { if (dom.loading) dom.loading.style.display = 'none'; }, 800);
    }, 3000);
  }

  // 调试指示器：显示当前手势值
  function updateDebugValue() {
    var el = document.getElementById('gp-debug-val');
    if (!el) return;
    el.textContent = (STATE.handOpenness * 100).toFixed(0) + '%';
    // 根据值改变颜色：低值(收拢)蓝，高值(散开)绿
    var pct = STATE.handOpenness;
    if (pct < 0.3) el.style.color = '#40c9ff';
    else if (pct < 0.6) el.style.color = '#facc15';
    else el.style.color = '#22c55e';
  }

  function bindUI() {
    dom.ui.querySelectorAll('.gp-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var shape = btn.getAttribute('data-shape');
        switchShape(shape);
        dom.ui.querySelectorAll('.gp-btn').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      });
    });
    dom.colorCode = document.getElementById('gp-colorCode');
    var picker = document.getElementById('gp-colorPicker');
    picker.addEventListener('input', function (e) {
      var hex = e.target.value;
      lastColor = parseInt(hex.slice(1), 16);
      dom.colorCode.textContent = hex;
      if (STATE.currentShape !== 'earth') {
        shaderMaterial.uniforms.color.value.set(hex);
      }
    });
    document.getElementById('gp-camToggle').addEventListener('change', function (e) {
      previewVisible = e.target.checked;
      if (dom.preview) dom.preview.style.display = previewVisible ? 'block' : 'none';
    });
  }

  function switchShape(shape) {
    STATE.currentShape = shape;
    STATE.targetPositions = generateTargetPositions(shape);
    if (shape === 'earth') {
      // 需要纹理：已缓存则直接着色，否则先白态再异步补色
      fillColorWhite();
      loadEarthData(function () { colorizeEarth(); });
    } else {
      fillColorWhite();
      shaderMaterial.uniforms.color.value.set(lastColor);
      if (dom.colorCode) dom.colorCode.textContent = '#' + lastColor.toString(16).padStart(6, '0');
    }
  }

  /* ============ 手势识别（MediaPipe Hands） ============ */
  function setupHands() {
    var WM = window;
    if (!(WM.Hands && WM.Camera)) { return; }
    if (hands) return;

    dom.preview = document.createElement('canvas');
    dom.preview.id = 'gp-cam-preview';
    dom.preview.width = 200; dom.preview.height = 150;
    dom.preview.style.display = 'none';
    dom.wrap.appendChild(dom.preview);

    var videoElement = document.createElement('video');
    videoElement.id = 'gp-video-input';
    videoElement.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;width:320px;height:240px;transform:scaleX(-1);pointer-events:none;';
    dom.video = videoElement;
    dom.wrap.appendChild(videoElement);

    hands = new WM.Hands({ locateFile: function (file) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file; } });
    // 使用 lite 模型（modelComplexity:0）降低 CPU 开销
    hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(function onResults(results) {
      STATE.lastResultAt = Date.now();
      // 预览画布：直接绘制视频帧（用 video 元素代替 results.image 避免黑屏）
      try {
        if (dom.video && dom.video.readyState >= 2 && dom.preview) {
          var pctx = dom.preview.getContext('2d');
          pctx.save();
          pctx.clearRect(0, 0, dom.preview.width, dom.preview.height);
          pctx.translate(dom.preview.width, 0);
          pctx.scale(-1, 1);
          pctx.drawImage(dom.video, 0, 0, dom.preview.width, dom.preview.height);
          pctx.restore();
        }
      } catch (e) { /* 视频帧尚未就绪，跳过 */ }
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // 手势已检测到
        if (!STATE.handDetected) {
          STATE.handDetected = true;
          if (dom.loading) dom.loading.style.display = 'none';
          var debugRow = document.getElementById('gp-debug-row');
          if (debugRow) debugRow.style.display = 'flex';
          var dot = document.getElementById('gp-dot');
          if (dot) { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 8px #22c55e'; }
        }
        var lm = results.multiHandLandmarks[0];
        // 在预览画布上画骨架（重绘保留最新骨架）
        try {
          if (dom.preview && dom.video && dom.video.readyState >= 2) {
            var pctx2 = dom.preview.getContext('2d');
            pctx2.save();
            pctx2.translate(dom.preview.width, 0);
            pctx2.scale(-1, 1);
            if (WM.drawConnectors) WM.drawConnectors(pctx2, lm, WM.HAND_CONNECTIONS, { color: '#40c9ff', lineWidth: 1 });
            pctx2.restore();
          }
        } catch (e) { /* 骨架绘制跳过 */ }

        // ---- 握拳/张开检测（指尖到手腕距离） ----
        // 握拳 → 指尖离手腕近 → openness 小 → 粒子收拢
        // 张开 → 指尖离手腕远 → openness 大 → 粒子散开
        var wrist = lm[0];
        var tips = [4, 8, 12, 16, 20].map(function (i) { return lm[i]; });
        var dists = tips.map(function (t) { return Math.hypot(t.x - wrist.x, t.y - wrist.y); });
        var avg = dists.reduce(function (a, b) { return a + b; }, 0) / 5;
        var raw = Math.max(0, Math.min(1, (avg - 0.15) * 3.0));
        STATE.handOpenness += (raw - STATE.handOpenness) * 0.12;

        // 手掌中心位置 → 控制旋转
        var mid = lm[9];
        STATE.handPosition.x += ((wrist.x + mid.x) / 2 - STATE.handPosition.x) * 0.15;
        STATE.handPosition.y += ((wrist.y + mid.y) / 2 - STATE.handPosition.y) * 0.15;
      } else {
        STATE.handDetected = false;
        var dot2 = document.getElementById('gp-dot');
        if (dot2) { dot2.style.background = '#eab308'; dot2.style.boxShadow = '0 0 8px #eab308'; }
        // 不改变 openness——粒子状态保持当前值，不会自动收敛/散开
      }
      // 更新调试指示器
      updateDebugValue();
    });

    cameraUtils = new WM.Camera(videoElement, {
      onFrame: function () { if (hands) hands.send({ image: videoElement }); },
      width: 320, height: 240
    });
  }

  function startCamera() {
    if (!hands) setupHands();
    if (cameraUtils) cameraUtils.start();
  }
  function stopCamera() {
    if (cameraUtils) cameraUtils.stop();
  }

  /* ============ 动画 ============ */
  var _animFrameCount = 0;
  function animate() {
    if (!running) return;
    // 包 try-catch 防止任何异常阻止动画继续
    try { _animateTick(); } catch (e) { /* 静默 */ }
    requestAnimationFrame(animate);
  }
  function _animateTick() {
    // 安全兜底：动画跑了 240 帧（~4 秒）后不管摄像头状态都隐藏 loading
    _animFrameCount++;
    if (_animFrameCount === 240) {
      if (dom.loading && dom.loading.style.display !== 'none') {
        hideLoadingSpinner();
      }
    }
    STATE.time += 0.03;
    shaderMaterial.uniforms.time.value = STATE.time;
    shaderMaterial.uniforms.handOpenness.value = STATE.handOpenness;

    var pos = particles.geometry.attributes.position.array;
    var stale = (Date.now() - STATE.lastResultAt) > 1500;
    var handIsActive = STATE.handDetected && !stale;
    if (handIsActive) {
      var targetRotY = -(STATE.handPosition.x - 0.4) * 8.0;
      var targetRotX = (STATE.handPosition.y - 0.6) * 6.0;
      particles.rotation.y += (targetRotY - particles.rotation.y) * 0.1;
      particles.rotation.x += (targetRotX - particles.rotation.x) * 0.1;
    } else {
      particles.rotation.y += 0.0025;
      particles.rotation.x += (0 - particles.rotation.x) * 0.05;
    }

    // 只有手势检测到时才改变 openness（握拳/张开驱动），否则保持当前值
    // 这样粒子初始为四散状态，手不做动作就不会变化
    var openness = STATE.handOpenness;
    var lerp = 0.1;
    for (var i = 0; i < CONFIG.particleCount; i++) {
      var i3 = i * 3;
      var tx = STATE.targetPositions[i3], ty = STATE.targetPositions[i3+1], tz = STATE.targetPositions[i3+2];
      var rx = STATE.randomOffsets[i3] + Math.sin(STATE.time * 0.5 + i) * 2.0;
      var ry = STATE.randomOffsets[i3+1] + Math.cos(STATE.time * 0.3 + i) * 2.0;
      var rz = STATE.randomOffsets[i3+2];
      var mix = openness * openness;
      var dx = tx * (1 - mix) + rx * mix;
      var dy = ty * (1 - mix) + ry * mix;
      var dz = tz * (1 - mix) + rz * mix;
      pos[i3] += (dx - pos[i3]) * lerp;
      pos[i3+1] += (dy - pos[i3+1]) * lerp;
      pos[i3+2] += (dz - pos[i3+2]) * lerp;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function onResize() {
    if (!camera || !renderer) return;
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || 560;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    var np = Math.max(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(np);
    shaderMaterial.uniforms.pixelRatio.value = np;
  }

  /* ============ 生命周期：由 arcade tab 切换驱动 ============ */
  function requestVendorScriptsThen(cb) {
    var need = [];
    if (!window.Hands) need.push('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    if (!window.Camera) need.push('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    if (!need.length) { cb(); return; }
    var loaded = 0;
    need.forEach(function (src) {
      loadScript(src, function () {
        loaded++;
        if (loaded === need.length) cb();
      });
    });
  }

  function activate() {
    if (running) return;
    running = true;
    // 兜底：8 秒后强制隐藏 loading（不管摄像头状态）
    setTimeout(function () {
      if (dom.loading && dom.loading.style.display !== 'none') {
        dom.loading.style.transition = 'opacity 0.5s';
        dom.loading.style.opacity = '0';
        setTimeout(function () { if (dom.loading) dom.loading.style.display = 'none'; }, 500);
      }
    }, 8000);
    // 若 THREE 尚未就绪，先等它就绪（主题给的 three.min.js 是 defer 加载）
    ensureThreeReady(function () {
      // 面板此时已可见，同步一次尺寸
      onResize();
      requestVendorScriptsThen(function () {
        setupHands();
        startCamera();
      });
      if (!animating) { animating = true; requestAnimationFrame(animate); }
    });
  }

  function deactivate() {
    running = false;
    stopCamera();
  }

  // 监听 tab 切换（由 arcade.js 触发）
  window.addEventListener('arcade:switch', function (e) {
    if (e.detail && e.detail.game === 'particles') activate();
    else deactivate();
  });

  // 监听 resize
  window.addEventListener('resize', onResize);

  // 首次进入即触发（若默认 active，需手动先隐藏：容器初始 display:none）
  // 初始化 Three.js（需在容器可见后才有正确尺寸；但先建好，切到可见时再同步尺寸）
  // THREE 由主题以 defer 引入，这里等它就绪后再建 scene / geometry
  var threeCheckTimer = null;
  function ensureThreeReady(cb) {
    if (window.THREE) {
      if (!started) { initScenario(); }
      cb();
      return;
    }
    clearTimeout(threeCheckTimer);
    threeCheckTimer = setTimeout(function () { ensureThreeReady(cb); }, 60);
  }

  function initScenario() {
    if (started) return;
    if (!initThree()) return;
    started = true;
    // 颜色统一用白色粒子，由 uniform 决定（文字/心用用户色，地球用 aColor）
    fillColorWhite();
    loadEarthData(function () { /* 预缓存，供地球 tab 立即显示 */ });
  }

  // 若当前 tab 已经是 particles（直接返回该页时）则激活
  function checkActive() {
    var p = document.getElementById('arcade-panel-particles');
    if (p && getComputedStyle(p).display !== 'none') activate();
    else deactivate();
  }
  // 等到脚本注入完成、面板布局就绪后同步一次尺寸并判断当前是否激活
  setTimeout(function () {
    onResize();
    checkActive();
  }, 200);
})();