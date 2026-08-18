// ===== 游戏模块顶部横幅「球池」Game Ballpit（reactbits.dev Ballpit 的 vanilla 移植）=====
// 用 2D canvas 程序化生成篮球/足球/乒乓球/台球/排球/网球/高尔夫球贴图，
// 做成带重力、球-球碰撞、边界反弹、周期性激励与跟随光标推挤的 3D 球池。
// 仅在「游戏」页自动初始化（其它页面不生效）。
(function () {
  'use strict';

  if (!/\/fun\/games\/?($|\?|#)/.test(window.location.pathname)) return;

  var header = document.getElementById('page-header');
  if (!header) return;

  header.classList.add('ballpit-host');

  var wrap = document.createElement('div');
  wrap.className = 'ballpit-canvas-wrap';
  header.appendChild(wrap);

  var canvas = document.createElement('canvas');
  canvas.className = 'ballpit-canvas';
  wrap.appendChild(canvas);

  // ===== 可调参数 =====
  var CFG = {
    gravity: 5,
    friction: 0.99,       // 每帧衰减（按 60fps 归一），越大越少阻尼
    wallBounce: 0.82,
    maxVelocity: 6,
    spin: 0.5,
    cursorRadius: 3.0,
    cursorForce: 3.5,
    cameraZ: 15,
    kickInterval: 2.4,    // 周期性激励间隔（秒），让球池持续弹跳
    kickStrength: 2.2
  };

  var renderer, scene, camera;
  var balls = [];
  var maxX = 6, maxY = 6, maxZ = 2.2;
  var running = false;
  var lastT = 0;
  var raf = null;
  var kickTimer = 0;
  var cursor = { x: 99999, y: 99999, active: false };

  function setColorSpace(tex) {
    if (!tex) return;
    if (tex.colorSpace !== undefined && THREE.SRGBColorSpace !== undefined) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if (tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) {
      tex.encoding = THREE.sRGBEncoding;
    }
  }

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    if (renderer.outputColorSpace !== undefined && THREE.SRGBColorSpace !== undefined) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, CFG.cameraZ);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    var key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2, 4, 8);
    scene.add(key);
    var rim = new THREE.PointLight(0xa18cd1, 1.5, 60);
    rim.position.set(-4, -2, 5);
    scene.add(rim);
  }

  function computeWorld() {
    var vFov = camera.fov * Math.PI / 180;
    var wHeight = 2 * Math.tan(vFov / 2) * camera.position.length();
    var wWidth = wHeight * camera.aspect;
    maxX = wWidth / 2;
    maxY = wHeight / 2;
    maxZ = 2.2;
  }

  function resize() {
    var w = header.clientWidth || window.innerWidth;
    var h = header.clientHeight || 320;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    computeWorld();
  }

  // ===== 程序化球体贴图（2D canvas → THREE.CanvasTexture）=====
  function makeTexture(draw) {
    var S = 256;
    var cvs = document.createElement('canvas');
    cvs.width = S;
    cvs.height = S;
    draw(cvs.getContext('2d'), S);
    var tex = new THREE.CanvasTexture(cvs);
    setColorSpace(tex);
    tex.anisotropy = 4;
    return tex;
  }

  function pentagon(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      var x = cx + r * Math.cos(a);
      var y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawBasketball(ctx, S) {
    ctx.fillStyle = '#e8791f';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = S * 0.018;
    ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, S / 2, S * 0.30, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(S, S / 2, S * 0.30, Math.PI / 2, -Math.PI / 2); ctx.stroke();
  }

  function drawSoccer(ctx, S) {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#161616';
    var spots = [
      [0.5, 0.18, 0.14], [0.3, 0.30, 0.11], [0.7, 0.30, 0.11],
      [0.18, 0.52, 0.12], [0.82, 0.52, 0.12], [0.5, 0.62, 0.13],
      [0.3, 0.82, 0.11], [0.7, 0.82, 0.11], [0.5, 0.42, 0.07],
      [0.36, 0.10, 0.06], [0.64, 0.10, 0.06], [0.5, 0.94, 0.08]
    ];
    for (var i = 0; i < spots.length; i++) {
      pentagon(ctx, spots[i][0] * S, spots[i][1] * S, spots[i][2] * S);
    }
  }

  function drawPingPong(ctx, S) {
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(0, 0, S, S);
  }

  function drawBilliard(ctx, S) {
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#fdfdfd';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold ' + Math.round(S * 0.34) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('3', S / 2, S / 2 + S * 0.02);
  }

  function drawVolleyball(ctx, S) {
    ctx.fillStyle = '#f6f6f6';
    ctx.fillRect(0, 0, S, S);
    ctx.lineWidth = S * 0.12;
    ctx.strokeStyle = '#2b7de0';
    ctx.beginPath();
    ctx.moveTo(S * 0.3, 0);
    ctx.bezierCurveTo(S * 0.6, S * 0.33, S * 0.1, S * 0.66, S * 0.35, S);
    ctx.stroke();
    ctx.strokeStyle = '#f5c518';
    ctx.beginPath();
    ctx.moveTo(S * 0.7, 0);
    ctx.bezierCurveTo(S * 0.4, S * 0.33, S * 0.9, S * 0.66, S * 0.65, S);
    ctx.stroke();
    ctx.strokeStyle = '#e2492f';
    ctx.beginPath();
    ctx.moveTo(0, S * 0.45);
    ctx.bezierCurveTo(S * 0.33, S * 0.25, S * 0.66, S * 0.75, S, S * 0.55);
    ctx.stroke();
  }

  function drawTennis(ctx, S) {
    ctx.fillStyle = '#d7f03c';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = S * 0.06;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.08);
    ctx.bezierCurveTo(S * 0.75, S * 0.35, S * 0.25, S * 0.65, S * 0.5, S * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.08);
    ctx.bezierCurveTo(S * 0.25, S * 0.35, S * 0.75, S * 0.65, S * 0.5, S * 0.92);
    ctx.stroke();
  }

  function drawGolf(ctx, S) {
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#d5d5d5';
    var step = S / 16;
    for (var y = step / 2; y < S; y += step) {
      for (var x = step / 2; x < S; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, step * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function ballTypes() {
    // 各球类按真实相对大小给尺寸（越大越接近真实占比）
    return [
      { tex: makeTexture(drawBasketball), size: 0.95 },
      { tex: makeTexture(drawSoccer), size: 0.85 },
      { tex: makeTexture(drawVolleyball), size: 0.85 },
      { tex: makeTexture(drawTennis), size: 0.62 },
      { tex: makeTexture(drawBilliard), size: 0.55 },
      { tex: makeTexture(drawPingPong), size: 0.45 },
      { tex: makeTexture(drawGolf), size: 0.45 }
    ];
  }

  function spawnBall(type) {
    var size = type.size * (0.9 + Math.random() * 0.25);
    var geo = new THREE.SphereGeometry(size, 32, 24);
    var mat = type.tex
      ? new THREE.MeshStandardMaterial({ map: type.tex, roughness: 0.42, metalness: 0.0, color: 0xffffff })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.5, 0.55), roughness: 0.4, metalness: 0.0 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() * 2 - 1) * maxX * 0.85,
      (Math.random() * 2 - 1) * maxY * 0.7,
      (Math.random() * 2 - 1) * maxZ * 0.7
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(mesh);

    balls.push({
      mesh: mesh,
      size: size,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      vz: (Math.random() - 0.5) * 1.5,
      spinY: (Math.random() - 0.5) * 2 * CFG.spin
    });
  }

  function updatePhysics(dt) {
    var i, j, b, o, p;
    var fr = Math.pow(CFG.friction, dt * 60);
    var floorY = maxY * 0.92;
    var ceilY = maxY * 0.94;

    // 周期性激励：让球池持续弹跳而不是逐渐沉寂
    kickTimer += dt;
    if (kickTimer >= CFG.kickInterval) {
      kickTimer = 0;
      for (i = 0; i < balls.length; i++) {
        b = balls[i];
        b.vy += CFG.kickStrength * (0.5 + Math.random());
        b.vx += (Math.random() - 0.5) * CFG.kickStrength * 0.6;
        b.vz += (Math.random() - 0.5) * CFG.kickStrength * 0.6;
      }
    }

    // 重力 + 摩擦 + 位置积分
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      b.vy -= dt * CFG.gravity * b.size;
      b.vx *= fr; b.vy *= fr; b.vz *= fr;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      if (sp > CFG.maxVelocity) { var k = CFG.maxVelocity / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
    }

    // 边界碰撞（地板 / 天花板 / 左右 / 前后）
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      p = b.mesh.position;
      var r = b.size;
      if (p.y - r < -floorY) { p.y = -floorY + r; b.vy = Math.abs(b.vy) * CFG.wallBounce; }
      if (p.y + r > ceilY) { p.y = ceilY - r; b.vy = -Math.abs(b.vy) * CFG.wallBounce; }
      if (Math.abs(p.x) + r > maxX) { p.x = Math.sign(p.x) * (maxX - r); b.vx = -b.vx * CFG.wallBounce; }
      if (Math.abs(p.z) + r > maxZ) { p.z = Math.sign(p.z) * (maxZ - r); b.vz = -b.vz * CFG.wallBounce; }
    }

    // 球-球碰撞
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      for (j = i + 1; j < balls.length; j++) {
        o = balls[j];
        var dx = o.mesh.position.x - b.mesh.position.x;
        var dy = o.mesh.position.y - b.mesh.position.y;
        var dz = o.mesh.position.z - b.mesh.position.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var min = b.size + o.size;
        if (dist < min && dist > 0.0001) {
          var nx = dx / dist, ny = dy / dist, nz = dz / dist;
          var overlap = (min - dist) * 0.5;
          b.mesh.position.x -= nx * overlap; b.mesh.position.y -= ny * overlap; b.mesh.position.z -= nz * overlap;
          o.mesh.position.x += nx * overlap; o.mesh.position.y += ny * overlap; o.mesh.position.z += nz * overlap;
          var vn1 = b.vx * nx + b.vy * ny + b.vz * nz;
          var vn2 = o.vx * nx + o.vy * ny + o.vz * nz;
          if (vn1 - vn2 > 0) {
            var imp = (vn1 - vn2) * 0.5;
            b.vx -= nx * imp; b.vy -= ny * imp; b.vz -= nz * imp;
            o.vx += nx * imp; o.vy += ny * imp; o.vz += nz * imp;
          }
        }
      }
    }

    // 光标推挤
    if (cursor.active) {
      var R = CFG.cursorRadius;
      for (i = 0; i < balls.length; i++) {
        b = balls[i];
        var ex = b.mesh.position.x - cursor.x;
        var ey = b.mesh.position.y - cursor.y;
        var ez = b.mesh.position.z;
        var d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < R * R && d2 > 0.0001) {
          var d = Math.sqrt(d2);
          var f = (1 - d / R) * CFG.cursorForce * dt;
          b.mesh.position.x += (ex / d) * f;
          b.mesh.position.y += (ey / d) * f;
          b.mesh.position.z += (ez / d) * f;
        }
      }
    }

    // 自转
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      b.mesh.rotation.y += b.spinY * dt;
    }
  }

  function animate(t) {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    updatePhysics(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function setupEvents() {
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(resize).observe(header);
    }

    wrap.addEventListener('pointermove', function (e) {
      var rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var ndcX = (e.clientX - rect.left) / rect.width * 2 - 1;
      var ndcY = -((e.clientY - rect.top) / rect.height * 2 - 1);
      cursor.x = ndcX * maxX;
      cursor.y = ndcY * maxY;
      cursor.active = true;
    });
    wrap.addEventListener('pointerleave', function () {
      cursor.active = false;
    });

    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0 });
      io.observe(header);
    } else {
      start();
    }
  }

  function buildBalls() {
    var types = ballTypes();
    var target = 46;
    for (var i = 0; i < target; i++) {
      spawnBall(types[Math.floor(Math.random() * types.length)]);
    }
  }

  function init() {
    initThree();
    resize();
    setupEvents();
    buildBalls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();