// ===== 首页挂绳 Lanyard（reactbits.dev Lanyard 的 vanilla 移植）=====
// 挂在首页「Mu An's Blog」标题右侧：金属胸卡（正反面照片）+ 挂绳带。
// Verlet 绳摆物理模拟摆动，卡片可拖拽。依赖 /lib/three.min.js、/lib/GLTFLoader.js（需先加载）。
(function () {
  'use strict';

  // 仅首页生效
  var p = window.location.pathname;
  if (p.replace(/\/index\.html?$/, '') !== '/' && p !== '/') return;
  if (!window.THREE) return;

  var title = document.getElementById('site-title');
  var info = document.getElementById('site-info');
  if (!title || !info) return;

  // 1) 用 flex 包裹标题 + 挂绳容器（标题在左、挂绳在右）
  var wrap = document.createElement('div');
  wrap.id = 'site-title-wrap';
  info.insertBefore(wrap, title);
  wrap.appendChild(title);

  var host = document.createElement('div');
  host.id = 'lanyard';
  wrap.appendChild(host);
  var canvas = document.createElement('canvas');
  host.appendChild(canvas);

  var PARAMS = {
    cameraZ: 11,
    fov: 26,
    gravity: 42,
    bandWidth: 0.15,
    cardScale: 0.85,
    anchorY: 2.05,
    segLen: 0.62,
    cardLen: 0.95,
    repeat: 4
  };

  var renderer, scene, camera;
  var anchor, j1, j2, j3, card;
  var chain = [], restDist = [];
  var cardGroup, cardMesh, bandMesh;
  var curve, curvePts;
  var dragging = false, grabOff = new THREE.Vector3();
  var target = new THREE.Vector3();
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var lastT = 0, accT = 0;
  var FIXED_DT = 1 / 60;
  var started = false, cardLoaded = false;
  window.__ly = { t: 'init' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function setSRGB(t) { if (t && t.encoding !== undefined && THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding; }

  // ============ 场景 / 灯光 ============
  function initScene() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(PARAMS.fov, 1, 0.1, 100);
    camera.position.set(0, 0, PARAMS.cameraZ);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2, 4, 6);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xc3b0ff, 0.55);
    fill.position.set(-3, -1, 4);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(0, -3, 3);
    scene.add(rim);

    // 简易环境光反射（替代原版 Environment / Lightformer）
    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = new THREE.Scene();
    addLF(env, 4, 0.4, [0, 3, 6], 0, 0xffffff, 2.4);
    addLF(env, 0.4, 4, [-4, 0, 4], 1.3, 0xa18cd1, 2.6);
    addLF(env, 0.4, 4, [4, 0, 4], -1.3, 0x8ec5ff, 2.6);
    addLF(env, 6, 6, [0, -7, -3], 0, 0x1a1a2e, 1.2);
    scene.environment = pmrem.fromScene(env, 0.08).texture;
    env.traverse(function (o) { if (o.isMesh) { o.material.dispose(); o.geometry.dispose(); } });
  }
  function addLF(s, w, h, pos, ry, color, inten) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(inten) })
    );
    m.position.fromArray(pos);
    m.rotation.y = ry;
    s.add(m);
  }

  // ============ 物理（Verlet 绳摆）============
  function makePoint(x, y, z, fixed) {
    return { x: x, y: y, z: z, px: x, py: y, pz: z, fixed: !!fixed };
  }
  function initPhysics() {
    var a = PARAMS.anchorY, s = PARAMS.segLen;
    anchor = makePoint(0, a, 0, true);
    j1 = makePoint(0.12, a - s, 0);
    j2 = makePoint(0.22, a - 2 * s, 0);
    j3 = makePoint(0.3, a - 3 * s, 0);
    card = makePoint(0.34, a - 3 * s - PARAMS.cardLen, 0);
    chain = [anchor, j1, j2, j3, card];
    restDist = [s, s, s, PARAMS.cardLen];
  }
  function solve(a, b, rest) {
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    var diff = (d - rest) / d;
    var ox = dx * diff * 0.5, oy = dy * diff * 0.5, oz = dz * diff * 0.5;
    if (!a.fixed) { a.x += ox; a.y += oy; a.z += oz; }
    if (!b.fixed) { b.x -= ox; b.y -= oy; b.z -= oz; }
  }
  function stepPhysics(dt, t) {
    var g = PARAMS.gravity * dt * dt;
    var damp = 0.995;
    // 轻微环境摆风，让挂绳保持灵动
    var wind = dragging ? 0 : Math.sin(t * 0.9) * 0.28 * dt * dt;
    for (var i = 1; i < chain.length; i++) {
      var pt = chain[i];
      var vx = (pt.x - pt.px) * damp;
      var vy = (pt.y - pt.py) * damp;
      var vz = (pt.z - pt.pz) * damp;
      pt.px = pt.x; pt.py = pt.y; pt.pz = pt.z;
      pt.x += vx + wind;
      pt.y += vy - g;
      pt.z += vz;
    }
    for (var k = 0; k < restDist.length; k++) solve(chain[k], chain[k + 1], restDist[k]);
    if (dragging) {
      // 卡片被拖到目标点后，把绳子拉紧几轮再钉住卡片
      for (var n = 0; n < 4; n++) {
        solve(chain[3], chain[4], restDist[3]);
        solve(chain[2], chain[3], restDist[2]);
        solve(chain[1], chain[2], restDist[1]);
        solve(chain[0], chain[1], restDist[0]);
      }
      card.x = target.x + grabOff.x;
      card.y = target.y + grabOff.y;
      card.z = target.z + grabOff.z;
      card.px = card.x; card.py = card.y; card.pz = card.z;
    }
  }

  // ============ 卡片 ============
  var FRONT_UV = { x: 0, y: 0, w: 0.5, h: 0.755 };
  var BACK_UV = { x: 0.5, y: 0, w: 0.5, h: 0.757 };

  function drawFit(ctx, img, r, W, H) {
    if (!img) return;
    var rx = r.x * W, ry = r.y * H, rw = r.w * W, rh = r.h * H;
    var scale = Math.max(rw / img.width, rh / img.height);
    var dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.drawImage(img, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh);
    ctx.restore();
  }
  function makeCardMap(baseMap, f, b) {
    var W = 1024, H = 1024;
    if (baseMap && baseMap.image && baseMap.image.width) { W = baseMap.image.width; H = baseMap.image.height; }
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    if (baseMap && baseMap.image) ctx.drawImage(baseMap.image, 0, 0, W, H);
    drawFit(ctx, f.image, FRONT_UV, W, H);
    drawFit(ctx, b.image, BACK_UV, W, H);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.flipY = baseMap ? baseMap.flipY : true;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    return tex;
  }
  function setupCard(gltf) {
    var nodes = {}, first = null;
    gltf.scene.traverse(function (o) {
      if (o.isMesh) { nodes[o.name] = o; if (!first) first = o; }
    });
    var geo = nodes.card ? nodes.card.geometry : first.geometry;
    var baseMat = gltf.materials && gltf.materials.base;
    var baseMap = baseMat && baseMat.map ? baseMat.map : null;
    var metal = (gltf.materials && gltf.materials.metal) ||
      new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 });
    var frontTex = null, backTex = null;

    function tryBuild() {
      if (!frontTex || !backTex || !geo) { window.__ly.t = 'tryBuild-wait'; return; }
      window.__ly.built = 'yes';
      var map = makeCardMap(baseMap, frontTex, backTex);
      cardGroup = new THREE.Group();
      cardGroup.scale.setScalar(PARAMS.cardScale);
      cardMesh = new THREE.Mesh(geo.clone(), new THREE.MeshPhysicalMaterial({
        map: map,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
        roughness: 0.9,
        metalness: 0.8
      }));
      cardGroup.add(cardMesh);
      if (nodes.clip) cardGroup.add(new THREE.Mesh(nodes.clip.geometry.clone(), metal));
      if (nodes.clamp) cardGroup.add(new THREE.Mesh(nodes.clamp.geometry.clone(), metal));
      scene.add(cardGroup);
      cardLoaded = true;
      maybeStart();
    }
    new THREE.TextureLoader().load('/img/lanyard/front.jpg', function (t) { window.__ly.front = 'ok'; setSRGB(t); frontTex = t; tryBuild(); });
    new THREE.TextureLoader().load('/img/lanyard/back.jpg', function (t) { window.__ly.back = 'ok'; setSRGB(t); backTex = t; tryBuild(); });
  }

  var _xAxis = new THREE.Vector3(), _yAxis = new THREE.Vector3(), _zAxis = new THREE.Vector3();
  var _m4 = new THREE.Matrix4();
  var _pivot = new THREE.Vector3(), _qYaw = new THREE.Quaternion(), _qBasis = new THREE.Quaternion();
  var _UP = new THREE.Vector3(0, 1, 0);
  function updateCard(now) {
    // 缓慢自转展示正反面（绕卡片顶部挂点旋转），拖拽时停止自转
    var yaw = dragging ? 0 : Math.sin(now * 0.00032) * 2.4;
    var center = _pivot.copy(card).clone();
    var pivot = _pivot.copy(j3);
    var up = _yAxis.copy(pivot).sub(center).normalize();

    // 绕「顶部挂点」的竖直轴旋转中心点（保持与挂点距离不变）
    _qYaw.setFromAxisAngle(_UP, yaw);
    var vc = center.sub(pivot).applyQuaternion(_qYaw).add(pivot);
    cardGroup.position.copy(vc);

    // 姿态：正面(+Z)朝相机，顶部(+Y)朝挂点，再叠加 yaw
    _zAxis.set(0, 0, 1);
    _xAxis.crossVectors(up, _zAxis).normalize();
    if (_xAxis.lengthSq() < 1e-6) _xAxis.set(1, 0, 0);
    _yAxis.crossVectors(_zAxis, _xAxis).normalize();
    _qBasis.setFromRotationMatrix(_m4.makeBasis(_xAxis, _yAxis, _zAxis));
    cardGroup.quaternion.copy(_qYaw.multiply(_qBasis));

    // 微小速度摇摆，更生动
    cardGroup.rotateX(clamp((card.z - card.pz) * 0.05, -0.2, 0.2));
    cardGroup.rotateZ(clamp(-(card.x - card.px) * 0.06, -0.25, 0.25));
  }

  // ============ 挂绳带（面向相机的丝带）============
  var BAND_SEGS = 20;
  function initBand() {
    var n = (BAND_SEGS + 1) * 2;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    var idx = [];
    for (var i = 0; i < BAND_SEGS; i++) {
      var a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    var tex = new THREE.TextureLoader().load('/lib/lanyard/lanyard.png');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    bandMesh = new THREE.Mesh(geo, mat);
    bandMesh.frustumCulled = false;
    scene.add(bandMesh);
  }
  function updateBand() {
    if (!curve) {
      curvePts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      curve = new THREE.CatmullRomCurve3(curvePts);
      curve.curveType = 'chordal';
    }
    curvePts[0].set(j3.x, j3.y, j3.z);
    curvePts[1].set(j2.x, j2.y, j2.z);
    curvePts[2].set(j1.x, j1.y, j1.z);
    curvePts[3].set(anchor.x, anchor.y, anchor.z);
    var pts = curve.getPoints(BAND_SEGS);
    var pos = bandMesh.geometry.attributes.position.array;
    var uv = bandMesh.geometry.attributes.uv.array;
    var half = PARAMS.bandWidth / 2;
    var view = _zAxis;
    var dir = _yAxis, right = _xAxis;
    for (var i = 0; i <= BAND_SEGS; i++) {
      if (i < BAND_SEGS) dir.copy(pts[i + 1]).sub(pts[i]).normalize();
      else dir.copy(pts[i]).sub(pts[i - 1]).normalize();
      right.crossVectors(dir, view).normalize();
      var o = i * 6, uo = i * 4;
      var p = pts[i];
      pos[o] = p.x + right.x * half; pos[o + 1] = p.y + right.y * half; pos[o + 2] = p.z + right.z * half;
      pos[o + 3] = p.x - right.x * half; pos[o + 4] = p.y - right.y * half; pos[o + 5] = p.z - right.z * half;
      uv[uo] = i / BAND_SEGS * PARAMS.repeat; uv[uo + 1] = 0;
      uv[uo + 2] = i / BAND_SEGS * PARAMS.repeat; uv[uo + 3] = 1;
    }
    bandMesh.geometry.attributes.position.needsUpdate = true;
    bandMesh.geometry.attributes.uv.needsUpdate = true;
    bandMesh.geometry.computeBoundingSphere();
  }

  // ============ 拖拽交互 ============
  function toNDC(e) {
    var r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function computeTarget(e) {
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    var v = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, v);
    if (v) target.copy(v);
    target.x = clamp(target.x, -2.7, 2.7);
    target.y = clamp(target.y, -2.2, 2.0);
    target.z = 0;
  }
  function onDown(e) {
    if (!cardLoaded) return;
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(cardGroup.children, true);
    if (!hits.length) return;
    dragging = true;
    computeTarget(e);
    grabOff.set(card.x - target.x, card.y - target.y, 0);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  }
  function onMove(e) { if (dragging) computeTarget(e); }
  function onUp(e) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  }

  // ============ 尺寸 / 主循环 ============
  function resize() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function maybeStart() {
    if (started || !cardLoaded || !bandMesh) return;
    started = true;
    window.__ly.started = 1;
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    lastT = performance.now();
    requestAnimationFrame(animate);
  }
  function animate(now) {
    window.__ly.frames = (window.__ly.frames || 0) + 1;
    requestAnimationFrame(animate);
    var dt = now - lastT;
    lastT = now;
    if (dt > 100) dt = 100;
    accT += dt / 1000;
    var n = 0;
    while (accT >= FIXED_DT && n < 6) {
      stepPhysics(FIXED_DT, now / 1000);
      accT -= FIXED_DT;
      n++;
    }
    if (cardLoaded) updateCard();
    updateBand();
    renderer.render(scene, camera);
  }

  // ============ 启动 ============
  initScene();
  window.__ly.t = 'scene-ok';
  initPhysics();
  window.__ly.t = 'physics-ok';
  initBand();
  window.__ly.t = 'band-ok';
  new THREE.GLTFLoader().load('/lib/lanyard/card.glb', function (g) { window.__ly.gltf = 'ok'; setupCard(g); }, undefined, function (e) {
    window.__ly.gltf = 'fail:' + (e && e.message);
    console.warn('lanyard: card.glb 加载失败', e);
  });
  window.__ly.t = 'load-issued';
})();
