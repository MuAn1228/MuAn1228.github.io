// ===== 变形环面结（three.js TorusKnot，顶点波浪形变） =====
(function () {
  if (!window.THREE) return;
  if (window.innerWidth <= 768) return; // 移动端跳过
  var el = document.querySelector('#page-header.full_page');
  if (!el) return;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100);
  camera.position.z = 7;

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.setPixelRatio(window.__gGuard ? window.__gGuard.pixelRatio(2) : Math.min(window.devicePixelRatio, 2));
  var canvas = renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  el.appendChild(canvas);

  // 环面结（旧版 three.js 返回 Geometry，顶点在 vertices 数组）
  var geometry = new THREE.TorusKnotGeometry(0.68, 0.2, 160, 28);
  var baseVerts = geometry.vertices.map(function (v) { return v.clone(); });

  var material = new THREE.MeshStandardMaterial({
    color: 0xa18cd1,        // 淡紫
    emissive: 0x6b5b95,     // 紫发光
    emissiveIntensity: 0.55,
    metalness: 0.75,
    roughness: 0.22,
  });
  var knot = new THREE.Mesh(geometry, material);
  knot.position.set(2.55, 0.1, 0);
  knot.rotation.x = 0.3;
  scene.add(knot);

  // 外圈光环
  var ringGeo = new THREE.TorusGeometry(1.1, 0.02, 8, 120);
  var ringMat = new THREE.MeshBasicMaterial({ color: 0xf093fb, transparent: true, opacity: 0.5 });
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(knot.position);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  // 灯光
  var p1 = new THREE.PointLight(0xf093fb, 2.2, 30); p1.position.set(4, 3, 5); scene.add(p1);
  var p2 = new THREE.PointLight(0x4facfe, 1.8, 30); p2.position.set(-4, -2, 4); scene.add(p2);
  var p3 = new THREE.PointLight(0xffffff, 0.8, 30); p3.position.set(0, 4, -2); scene.add(p3);
  var amb = new THREE.AmbientLight(0xffffff, 0.35); scene.add(amb);

  // 鼠标视差
  var mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener('mousemove', function (e) {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  var start = performance.now();
  var hidden = false;
  var animating = false;
  function animate(now) {
    if (!animating) return;
    requestAnimationFrame(animate);
    if (document.visibilityState === 'hidden') return; // 后台暂停渲染，恢复回调生效
    var t = (now - start) / 1000;

    // 顶点波浪形变：径向波动 + 垂直波动，让表面明显起伏
    for (var i = 0; i < baseVerts.length; i++) {
      var v = baseVerts[i];
      var r = v.length() || 1;
      var radial = Math.sin(v.x * 2.2 + t * 1.8) * Math.sin(v.z * 2.0 + t * 1.5) * 0.28;
      var vert = Math.sin(v.y * 2.6 + t * 1.3) * 0.16;
      var f = 1 + radial / r;
      geometry.vertices[i].set(v.x * f, v.y * f + vert, v.z * f);
    }
    geometry.verticesNeedUpdate = true;

    // 旋转
    knot.rotation.x += 0.004;
    knot.rotation.y += 0.008;
    knot.rotation.z += 0.004;
    ring.rotation.z += 0.004;

    // 鼠标跟随
    tx += (mx - tx) * 0.05;
    ty += (my - ty) * 0.05;
    knot.position.x = 2.55 + tx * 0.3;
    knot.position.y = 0.1 - ty * 0.3;
    ring.position.copy(knot.position);

    renderer.render(scene, camera);
  }
  animating = true;
  requestAnimationFrame(animate);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { animating = false; }
    else if (!animating) { animating = true; requestAnimationFrame(animate); }
  });

  window.addEventListener('resize', function () {
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
  });
})();
