// ===== 游戏模块顶部横幅「球池」Game Ballpit（reactbits.dev Ballpit 的 vanilla 移植）=====
// 把 /data/games.json 里的游戏封面映射成 3D 球体，做重力、碰撞、跟随光标的球池效果。
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
    gravity: 8,
    friction: 0.985,      // 每帧衰减（按 60fps 归一）
    wallBounce: 0.6,
    maxVelocity: 6,
    minSize: 1.0,
    maxSize: 1.55,
    spin: 0.35,           // 自转速度
    cursorRadius: 3.4,   // 光标推挤半径（世界单位）
    cursorForce: 3.2,     // 光标推挤力度
    cameraZ: 15
  };

  var renderer, scene, camera;
  var balls = [];
  var maxX = 6, maxY = 6, maxZ = 2.2;
  var running = false;
  var lastT = 0;
  var raf = null;
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 4, 8);
    scene.add(key);
    var rim = new THREE.PointLight(0xa18cd1, 1.6, 60);
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
    renderer.setPixelRatio(window.__gGuard ? window.__gGuard.pixelRatio(2) : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    computeWorld();
  }

  // 随机球体
  function spawnBall(tex) {
    var size = CFG.minSize + Math.random() * (CFG.maxSize - CFG.minSize);
    var geo = new THREE.SphereGeometry(size, 32, 24);
    var mat;
    if (tex) {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.12, color: 0xffffff });
    } else {
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.5, 0.55), roughness: 0.4, metalness: 0.2 });
    }
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

    // 头部尺寸变化（如字体加载、布局调整、横竖屏）也重算画布
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
        var vis = typeof document !== 'undefined' && document.visibilityState !== 'hidden';
        entries[0].isIntersecting && vis ? start() : stop();
      }, { threshold: 0 });
      io.observe(header);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') stop();
        else if (io) start(); // 重新可见时恢复
      });
    } else {
      start();
    }
  }

  function buildBalls(games) {
    var urls = games.map(function (g) { return g.img; }).filter(Boolean);
    if (!urls.length) { for (var i = 0; i < 30; i++) spawnBall(null); return; }

    var target = Math.min(56, Math.max(30, urls.length * 2));
    var ready = [];      // 已加载完成、等待生成球体的封面贴图
    var spawned = 0;

    // 每就绪一张封面就立即生成一个「真实封面球」；球池随加载逐渐铺满，
    // 从头到尾都是封面贴图球，无纯色占位球，也不用等全部加载完才出现。
    function pump() {
      while (ready.length && spawned < target) {
        spawnBall(ready.shift());
        spawned++;
      }
    }

    urls.forEach(function (u) {
      new THREE.TextureLoader().load(u, function (t) {
        setColorSpace(t);
        ready.push(t);
        pump();
      }, undefined, function () { /* 个别封面加载失败则忽略 */ });
    });
  }

  function init() {
    initThree();
    resize();
    setupEvents();
    fetch('/data/games.json')
      .then(function (r) { return r.json(); })
      .then(buildBalls)
      .catch(function () {
        for (var i = 0; i < 30; i++) spawnBall(null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();