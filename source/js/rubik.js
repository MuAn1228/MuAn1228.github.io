// ===== 3D 魔方（three.js，鼠标拖拽转层、拖空白转视角、可打乱） =====
// 挂载于 /fun/arcade/ 小游戏模块的 #arcade-rubik 容器
(function () {
  if (!window.THREE) return;
  var el = document.getElementById('arcade-rubik');
  if (!el) return;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:264px;margin:0 auto;cursor:grab;';
  el.appendChild(wrap);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(5, 5, 7);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(264, 264);
  renderer.setPixelRatio(window.__gGuard ? window.__gGuard.pixelRatio(2) : Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.display = 'block';
  wrap.appendChild(renderer.domElement);

  var COLORS = {
    px: 0xc41e3a, nx: 0xff5800,
    py: 0xffffff, ny: 0xffd500,
    pz: 0x0051ba, nz: 0x009e60
  };
  var INNER = 0x1a1a2e;

  var cubeGroup = new THREE.Group();
  cubeGroup.scale.set(1.2, 1.2, 1.2);
  scene.add(cubeGroup);

  var cubies = [];
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      for (var z = -1; z <= 1; z++) {
        var mats = [
          (x === 1 ? COLORS.px : INNER), (x === -1 ? COLORS.nx : INNER),
          (y === 1 ? COLORS.py : INNER), (y === -1 ? COLORS.ny : INNER),
          (z === 1 ? COLORS.pz : INNER), (z === -1 ? COLORS.nz : INNER)
        ].map(function (c) { return new THREE.MeshLambertMaterial({ color: c }); });
        var cubie = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mats);
        cubie.position.set(x, y, z);
        cubie.userData = { originPos: new THREE.Vector3(x, y, z), originQuat: cubie.quaternion.clone() };
        cubeGroup.add(cubie);
        cubies.push(cubie);
      }
    }
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dl = new THREE.DirectionalLight(0xffffff, 0.7);
  dl.position.set(5, 10, 7);
  scene.add(dl);

  var rotating = false;
  var FLIP = 1; // 若拖拽方向反了，改成 -1

  function rotateLayer(move) {
    if (rotating) return;
    rotating = true;
    var axis = move.axis, layer = move.layer, angle = move.angle;
    var layerCubies = cubies.filter(function (c) {
      var v = axis === 'x' ? c.position.x : axis === 'y' ? c.position.y : c.position.z;
      return Math.round(v) === layer;
    });
    var pivot = new THREE.Group();
    cubeGroup.add(pivot);
    layerCubies.forEach(function (c) { pivot.attach(c); });

    var duration = 220;
    var start = performance.now();
    function step(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      pivot.rotation[axis] = angle * eased;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        layerCubies.forEach(function (c) {
          cubeGroup.attach(c);
          c.position.x = Math.round(c.position.x);
          c.position.y = Math.round(c.position.y);
          c.position.z = Math.round(c.position.z);
        });
        cubeGroup.remove(pivot);
        rotating = false;
      }
    }
    requestAnimationFrame(step);
  }

  function scramble() {
    var axes = ['x', 'y', 'z'];
    var seq = [];
    for (var i = 0; i < 22; i++) seq.push({ axis: axes[(Math.random() * 3) | 0], layer: [-1, 0, 1][(Math.random() * 3) | 0], angle: (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 });
    var idx = 0;
    (function run() {
      if (idx >= seq.length) return;
      var s = seq[idx++];
      rotateLayer(s);
      setTimeout(run, 240);
    })();
  }

  function resetCube() {
    if (rotating) return;
    cubeGroup.quaternion.set(0, 0, 0, 1);
    cubies.forEach(function (c) {
      c.position.copy(c.userData.originPos);
      c.quaternion.copy(c.userData.originQuat);
    });
  }

  // ===== 鼠标交互：射线检测选层 =====
  var raycaster = new THREE.Raycaster();
  var interaction = null;

  function ndc(clientX, clientY) {
    var r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
  }

  function onDown(clientX, clientY, isRight) {
    // 右键（或双指）固定为旋转视角
    if (isRight) {
      interaction = { mode: 'orbit', lx: clientX, ly: clientY };
      return;
    }
    raycaster.setFromCamera(ndc(clientX, clientY), camera);
    var hits = raycaster.intersectObjects(cubies);
    if (hits.length > 0) {
      var hit = hits[0];
      var cubie = hit.object;
      var hitPoint = cubeGroup.worldToLocal(hit.point.clone());
      var normal = hit.face.normal.clone().applyQuaternion(cubie.quaternion);
      interaction = { mode: 'layer', hitPoint: hitPoint, normal: normal, sx: clientX, sy: clientY, done: false };
    } else {
      interaction = { mode: 'orbit', lx: clientX, ly: clientY };
    }
  }

  function onMove(clientX, clientY) {
    if (!interaction) return;
    if (interaction.mode === 'orbit') {
      var dx = clientX - interaction.lx, dy = clientY - interaction.ly;
      interaction.lx = clientX; interaction.ly = clientY;

      var m = camera.matrixWorld.elements;
      var right = new THREE.Vector3(m[0], m[1], m[2]);
      var up = new THREE.Vector3(m[4], m[5], m[6]);

      var qy = new THREE.Quaternion().setFromAxisAngle(up, dx * 0.008);
      var qx = new THREE.Quaternion().setFromAxisAngle(right, dy * 0.008);

      cubeGroup.quaternion.premultiply(qy);
      cubeGroup.quaternion.premultiply(qx);
    } else if (interaction.mode === 'layer' && !interaction.done) {
      var dx2 = clientX - interaction.sx, dy2 = clientY - interaction.sy;
      if (Math.abs(dx2) < 15 && Math.abs(dy2) < 15) return;
      interaction.done = true;

      // 相机右/上向量 → 拖拽的 3D 世界方向
      var m = camera.matrixWorld.elements;
      var right = new THREE.Vector3(m[0], m[1], m[2]);
      var up = new THREE.Vector3(m[4], m[5], m[6]);
      var dragWorld = right.multiplyScalar(dx2).add(up.multiplyScalar(-dy2));

      // 转到 cubeGroup 局部（用逆矩阵的旋转部分）
      var invMatrix = new THREE.Matrix4().getInverse(cubeGroup.matrixWorld);
      var dragLocal = dragWorld.clone().transformDirection(invMatrix);

      // 旋转轴 = normal × dragLocal
      var n = interaction.normal;
      var crossVec = new THREE.Vector3().crossVectors(n, dragLocal);
      var normalAxis = Math.abs(n.x) > 0.5 ? 'x' : Math.abs(n.y) > 0.5 ? 'y' : 'z';
      var axes = ['x', 'y', 'z'].filter(function (a) { return a !== normalAxis; });
      var rotAxis = Math.abs(crossVec[axes[0]]) >= Math.abs(crossVec[axes[1]]) ? axes[0] : axes[1];
      var layer = Math.round(interaction.hitPoint[rotAxis]);
      var sign = crossVec[rotAxis] >= 0 ? 1 : -1;

      rotateLayer({ axis: rotAxis, layer: layer, angle: Math.PI / 2 * sign * FLIP });
    }
  }

  function onUp() { interaction = null; }

  wrap.addEventListener('mousedown', function (e) { onDown(e.clientX, e.clientY, e.button === 2); });
  wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', onUp);
  wrap.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { onDown(e.touches[0].clientX, e.touches[0].clientY, true); } else if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  wrap.addEventListener('touchmove', function (e) { if (e.touches.length === 1) { onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
  wrap.addEventListener('touchend', onUp);

  // 打乱 + 还原按钮 + 提示
  var btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:8px;';

  var scrambleBtn = document.createElement('button');
  scrambleBtn.textContent = '打乱';
  scrambleBtn.style.cssText = 'padding:4px 16px;border:none;border-radius:12px;background:rgba(107,91,149,0.85);color:#fff;font-size:13px;cursor:pointer;';
  scrambleBtn.addEventListener('click', scramble);
  btnWrap.appendChild(scrambleBtn);

  var resetBtn = document.createElement('button');
  resetBtn.textContent = '还原';
  resetBtn.style.cssText = 'padding:4px 16px;border:none;border-radius:12px;background:rgba(142,107,181,0.85);color:#fff;font-size:13px;cursor:pointer;';
  resetBtn.addEventListener('click', resetCube);
  btnWrap.appendChild(resetBtn);

  wrap.appendChild(btnWrap);

  var hint = document.createElement('div');
  hint.textContent = '拖拽表面转层 · 右键/双指拖拽旋转视角';
  hint.style.cssText = 'margin-top:6px;font-size:11px;color:rgba(80,80,100,0.75);text-align:center;pointer-events:none;';
  wrap.appendChild(hint);

  // 初始慢速自转展示（按可见帧计时，面板隐藏或后台时暂停）
  var spinFrames = 180;
  function render() {
    if (wrap.offsetParent !== null && document.visibilityState !== 'hidden') {
      if (spinFrames > 0 && !interaction) {
        spinFrames--;
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.006);
        cubeGroup.quaternion.premultiply(q);
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  window.addEventListener('resize', function () {
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  });
})();
