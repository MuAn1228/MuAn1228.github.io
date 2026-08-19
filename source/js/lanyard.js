// ===== 导航栏挂绳 Lanyard（reactbits.dev Lanyard 的 vanilla 移植）=====
// 挂在导航栏左上角站点名右侧：3:4 照片胸卡（正反面占满整卡）+ 挂绳带 + 顶部金属夹。
// 卡片为程序化 3:4 圆角平面，正反面各贴一张图片（front.jpg / back.jpg），缓慢自转交替展示。
// 依赖 /lib/three.min.js、/lib/GLTFLoader.js（需先加载）。
(function () {
  'use strict';

  if (!window.THREE) return;
  var siteName = document.querySelector('#blog-info .site-name');
  if (!siteName) return;

  // 1) 在站点名右侧插入挂绳容器
  var info = siteName.closest('#blog-info') || siteName.parentNode;
  var host = document.createElement('div');
  host.id = 'lanyard';
  info.appendChild(host);
  var canvas = document.createElement('canvas');
  host.appendChild(canvas);

  var PARAMS = {
    cameraZ: 3.0,
    fov: 30,
    camY: 0,
    gravity: 26,
    bandWidth: 0.1,
    anchorY: 0.8, // 挂点高度（世界坐标；相机可见区 y 上限约 +0.80）
    strapFrac: 0.12, // 顶部挂绳带占容器可见高度的比例，其余高度全部给卡片
    fill: 0.98, // 卡片高占「可见高 - 挂绳带」的比例，尽量铺满容器
    cardRatio: 4 / 3, // 卡片高宽比（照片 3:4 竖版，铺满整卡）
    repeat: 3,
    spinSpeed: 0.0005
  };
  var CARD_W = 0.8, CARD_H = 1.067; // 实际卡片尺寸，由 computeCardSize() 按容器比例计算

  function visibleHeight() {
    return 2 * Math.tan(PARAMS.fov * Math.PI / 360) * PARAMS.cameraZ;
  }

  var renderer, scene, camera;
  var anchor, j1, j2, card;
  var chain = [], restDist = [];
  var cardGroup, frontMesh, backMesh, bandMesh;
  var curve, curvePts;
  var dragging = false, grabOff = new THREE.Vector3();
  var target = new THREE.Vector3();
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var lastT = 0, accT = 0;
  var FIXED_DT = 1 / 60;
  var started = false, cardLoaded = false;
  var frontTex = null, backTex = null;
  window.__ly = { t: 'init', v: 3 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ============ 场景 / 灯光 ============
  function initScene() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(PARAMS.fov, 1, 0.1, 100);
    camera.position.set(0, PARAMS.camY, PARAMS.cameraZ);
    camera.lookAt(0, PARAMS.camY, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 6);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xc3b0ff, 0.5);
    fill.position.set(-3, -1, 4);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(0, -3, 3);
    scene.add(rim);

    // 简易环境光反射
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
    var hv = visibleHeight();
    var strapLen = hv * PARAMS.strapFrac; // 挂绳带总长（世界单位）
    var s = strapLen / 2; // 分为两段（anchor-j1、j1-j2）
    var a = PARAMS.anchorY;
    anchor = makePoint(0, a, 0, true);
    j1 = makePoint(0.02, a - s, 0);
    j2 = makePoint(0.04, a - 2 * s, 0);
    // card 表示卡片上沿（挂点），卡片几何体从该点向下延伸
    card = makePoint(0.05, a - 2 * s, 0);
    chain = [anchor, j1, j2, card];
    restDist = [s, s, 0];
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
    var wind = dragging ? 0 : Math.sin(t * 0.9) * 0.12 * dt * dt;
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
      for (var n = 0; n < 4; n++) {
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

  // ============ 卡片（3:4 圆角平面，正反面各一图）============
  // mirror=true 时水平镜像（背面平面绕 Y 旋转 π 后从背面看方向正确）
  function makeCardTex(img, mirror) {
    var W = img.width || img.naturalWidth, H = img.height || img.naturalHeight;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, 0, 0, W, H);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    return tex;
  }
  // 3:4 圆角卡片平面（raw BufferGeometry，兼容 three r121 旧 Geometry 无 .attributes 的问题）
  // 局部原点 = 卡片上沿中心，卡片向下延伸；UV 线性映射，照片正立铺满整卡
  function roundedRectBufferGeometry(w, h, r, seg) {
    var n = seg, rows = n + 1, cols = n + 1;
    var positions = [], uvs = [], normals = [], idx = [];
    var halfW = w / 2, innerL = -halfW + r, innerR = halfW - r, innerT = -r, innerB = -h + r;
    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var u = rx / n, v = ry / n;
        var x = -halfW + u * w;
        var y = -v * h;
        var cx = clamp(x, innerL, innerR);
        var cy = clamp(y, innerB, innerT);
        var dx = x - cx, dy = y - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1e-5) { x = cx + dx / d * r; y = cy + dy / d * r; }
        else { x = cx; y = cy; }
        positions.push(x, y, 0);
        // u 左0右1；v 顶部1底部0（配合 flipY=true 让照片正立）
        uvs.push(u, 1 - v);
        normals.push(0, 0, 1);
      }
    }
    for (var ry2 = 0; ry2 < n; ry2++) {
      for (var rx2 = 0; rx2 < n; rx2++) {
        var a = ry2 * cols + rx2;
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    g.setIndex(idx);
    return g;
  }
  // 程序化金属夹：卡片上沿银色夹条 + 挂环（raw 六面盒，无需外部 glb）
  function makeBox(w, h, d) {
    var x = w / 2, y = h / 2, z = d / 2;
    var p = [
      -x, -y, z,  x, -y, z,  x, y, z,  -x, y, z,
      x, -y, -z,  -x, -y, -z,  -x, y, -z,  x, y, -z,
      -x, y, z,  x, y, z,  x, y, -z,  -x, y, -z,
      -x, -y, -z,  x, -y, -z,  x, -y, z,  -x, -y, z,
      x, -y, z,  x, -y, -z,  x, y, -z,  x, y, z,
      -x, -y, -z,  -x, -y, z,  -x, y, z,  -x, y, -z
    ];
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    g.computeVertexNormals();
    return g;
  }
  // 按容器实际宽高比计算卡片世界尺寸：卡片高度铺满「可见高 - 挂绳带」，宽按 3:4
  function computeCardSize() {
    var hv = visibleHeight();
    var strapLen = hv * PARAMS.strapFrac;
    var cardH = (hv - strapLen) * PARAMS.fill;
    var cardW = cardH / PARAMS.cardRatio; // H/W = cardRatio → W = H / cardRatio
    return { cardW: cardW, cardH: cardH };
  }
  function addMetalClip() {
    var metal = new THREE.MeshStandardMaterial({ color: 0xaeb4bd, metalness: 0.9, roughness: 0.3 });
    var cw = CARD_W;
    var bar = new THREE.Mesh(makeBox(cw * 0.9, cw * 0.13, cw * 0.09), metal);
    bar.position.set(0, -cw * 0.065, 0.012);
    cardGroup.add(bar);
    var eye = new THREE.Mesh(makeBox(cw * 0.1, cw * 0.11, cw * 0.09), metal);
    eye.position.set(0, cw * 0.01, 0.012);
    cardGroup.add(eye);
    window.__ly.metal = 'procedural';
  }
  function buildCard() {
    try {
      var sz = computeCardSize();
      CARD_W = sz.cardW; CARD_H = sz.cardH;
      cardGroup = new THREE.Group();
      var geo = roundedRectBufferGeometry(CARD_W, CARD_H, CARD_W * 0.1, 12);

      var mFront = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.75, metalness: 0.15 });
      var mBack = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.75, metalness: 0.15 });
      frontMesh = new THREE.Mesh(geo, mFront);
      frontMesh.position.z = 0.006;
      frontMesh.frustumCulled = false;
      backMesh = new THREE.Mesh(geo, mBack);
      backMesh.rotation.y = Math.PI;
      backMesh.position.z = -0.006;
      backMesh.frustumCulled = false;
      cardGroup.add(frontMesh);
      cardGroup.add(backMesh);

      addMetalClip();

      scene.add(cardGroup);
      cardLoaded = true;
      window.__ly.scene = scene;
      window.__ly.camera = camera;
      window.__ly.renderer = renderer;
      window.__ly.cardGroup = cardGroup;
      window.__ly.bandMesh = bandMesh;
      maybeStart();
    } catch (e) {
      window.__ly.buildErr = (e && e.message ? e.message : String(e)) + '\n' + (e && e.stack ? e.stack : '');
      cardLoaded = true;
      maybeStart();
    }
  }

  var _xAxis = new THREE.Vector3(), _yAxis = new THREE.Vector3(), _zAxis = new THREE.Vector3();
  var _m4 = new THREE.Matrix4();
  var _pivot = new THREE.Vector3(), _center = new THREE.Vector3();
  var _qSpin = new THREE.Quaternion(), _qBasis = new THREE.Quaternion();
  function updateCard(now) {
    // 卡片绕挂绳方向（up）持续缓慢自转，正反面交替可见
    var spin = dragging ? 0 : now * PARAMS.spinSpeed;
    var center = _center.copy(card);
    var pivot = _pivot.copy(j2);
    var up = _yAxis.copy(pivot).sub(center).normalize();
    cardGroup.position.copy(center);

    _zAxis.set(0, 0, 1);
    _xAxis.crossVectors(up, _zAxis).normalize();
    if (_xAxis.lengthSq() < 1e-6) _xAxis.set(1, 0, 0);
    _yAxis.crossVectors(_zAxis, _xAxis).normalize();
    _qBasis.setFromRotationMatrix(_m4.makeBasis(_xAxis, _yAxis, _zAxis));
    _qSpin.setFromAxisAngle(up, spin);
    cardGroup.quaternion.copy(_qSpin.multiply(_qBasis));

    cardGroup.rotateX(clamp((card.z - card.pz) * 0.05, -0.2, 0.2));
    cardGroup.rotateZ(clamp(-(card.x - card.px) * 0.06, -0.25, 0.25));
  }

  // ============ 挂绳带（面向相机的丝带）============
  var BAND_SEGS = 16;
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
    curvePts[0].set(card.x, card.y, card.z);
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
    target.x = clamp(target.x, -0.42, 0.42);
    target.y = clamp(target.y, 0.0, 1.2);
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
    requestAnimationFrame(animate);
    var dt = now - lastT;
    lastT = now;
    if (dt > 100) dt = 100;
    accT += dt / 1000;
    try {
      var n = 0;
      while (accT >= FIXED_DT && n < 6) {
        stepPhysics(FIXED_DT, now / 1000);
        accT -= FIXED_DT;
        n++;
      }
      if (cardLoaded) updateCard(now);
      updateBand();
      renderer.render(scene, camera);
    } catch (e) {
      window.__ly.err = (window.__ly.err || 0) + 1 + ':' + e.message;
      if ((window.__ly.errs = (window.__ly.errs || 0)) < 5) console.error('lanyard animate', e);
    }
  }

  // ============ 启动 ============
  initScene();
  window.__ly.t = 'scene-ok';
  initPhysics();
  window.__ly.t = 'physics-ok';
  initBand();
  window.__ly.t = 'band-ok';
  loadImage('/img/lanyard/front.jpg', function (img) { window.__ly.front = 'ok'; frontTex = makeCardTex(img, false); tryBuild(); });
  loadImage('/img/lanyard/back.jpg', function (img) { window.__ly.back = 'ok'; backTex = makeCardTex(img, true); tryBuild(); });
  function loadImage(url, onLoad) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { onLoad(img); };
    img.onerror = function () { window.__ly.err = (window.__ly.err || '') + ' load fail: ' + url; };
    img.src = url;
  }
  function tryBuild() {
    if (frontTex && backTex) { window.__ly.built = 'yes'; buildCard(); }
  }
  window.__ly.t = 'load-issued';
  // 调试钩子：后台标签页 RAF 不触发时，可手动驱动渲染一帧（正式环境不影响）
  window.__ly.step = function () { animate(performance.now()); };
})();
