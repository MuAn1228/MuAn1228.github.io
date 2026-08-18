// ===== FPS 射击小游戏（Three.js，挂载于 /fun/arcade/ 的 #arcade-fps） =====
// 操作：点击画面锁定鼠标 → WASD 移动 · 鼠标瞄准 · 左键射击 · ESC 暂停
// 触屏/无 PointerLock 时降级为拖拽视角 + 点按射击
(function () {
  if (!window.THREE) return;
  var host = document.getElementById('arcade-fps');
  if (!host) return;

  var W = 800, H = 500;
  var ARENA = 24; // 场地半径（正方形半边长）
  var PLAYER_H = 1.6;

  // ===== 容器与画布 =====
  var wrap = document.createElement('div');
  wrap.className = 'fps-wrap';
  host.appendChild(wrap);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.domElement.className = 'fps-canvas';
  wrap.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 20, 60);

  var camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 200);
  camera.position.set(0, PLAYER_H, 0);

  // ===== 灯光 =====
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 40, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // ===== 场地 =====
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x2d3a4a, roughness: 0.9 });
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var grid = new THREE.GridHelper(ARENA * 2, ARENA, 0x4a5a7a, 0x3a4a6a);
  grid.position.y = 0.01;
  scene.add(grid);

  // 围墙
  var wallMat = new THREE.MeshStandardMaterial({ color: 0x3d4f6f, roughness: 0.8 });
  var wallH = 3;
  function addWall(x, z, w, d) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    m.position.set(x, wallH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  addWall(0, -ARENA, ARENA * 2 + 1, 1);
  addWall(0, ARENA, ARENA * 2 + 1, 1);
  addWall(-ARENA, 0, 1, ARENA * 2 + 1);
  addWall(ARENA, 0, 1, ARENA * 2 + 1);

  // 障碍物（带碰撞盒）
  var obstacles = [];
  var obstacleBoxes = [];
  function addObstacle(x, z, w, d, h, color) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })
    );
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    obstacles.push(m);
    obstacleBoxes.push(new THREE.Box3().setFromObject(m));
  }
  addObstacle(-10, -8, 3, 3, 2.2, 0x8e6bb5);
  addObstacle(11, 6, 2.5, 5, 1.8, 0xa18cd1);
  addObstacle(-7, 12, 4, 2.5, 1.5, 0x6b5b95);
  addObstacle(14, -11, 2.5, 2.5, 3, 0x8e6bb5);
  addObstacle(0, -14, 5, 2, 2, 0x5b4b85);

  // ===== HUD =====
  var hud = document.createElement('div');
  hud.className = 'fps-hud';
  hud.innerHTML =
    '<div class="fps-hud-left">' +
    '<span class="fps-hp-label">HP</span>' +
    '<div class="fps-hp-bar"><div class="fps-hp-fill"></div></div>' +
    '<span class="fps-hp-text">100</span>' +
    '</div>' +
    '<div class="fps-hud-right">得分 <b class="fps-score">0</b></div>';
  wrap.appendChild(hud);

  var crosshair = document.createElement('div');
  crosshair.className = 'fps-crosshair';
  wrap.appendChild(crosshair);

  var overlay = document.createElement('div');
  overlay.className = 'fps-overlay';
  wrap.appendChild(overlay);

  var hpFill = hud.querySelector('.fps-hp-fill');
  var hpText = hud.querySelector('.fps-hp-text');
  var scoreEl = hud.querySelector('.fps-score');

  // ===== 游戏状态 =====
  var state = 'idle'; // idle | play | pause | over
  var score = 0, health = 100;
  var best = 0;
  try { best = parseInt(localStorage.getItem('arcade-fps-best'), 10) || 0; } catch (e) { best = 0; }

  var yaw = 0, pitch = 0;
  var keys = { w: false, a: false, s: false, d: false };
  var velocity = new THREE.Vector3();
  var enemies = [];
  var enemyGroup = new THREE.Group();
  scene.add(enemyGroup);

  var hasPointerLock = 'pointerLockElement' in document;

  function updateHUD() {
    hpText.textContent = Math.max(0, Math.floor(health));
    var pct = Math.max(0, health);
    hpFill.style.width = pct + '%';
    hpFill.style.background = health > 50 ? '#4caf50' : health > 25 ? '#ffc107' : '#f44336';
    scoreEl.textContent = score;
  }

  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
  }
  function hideOverlay() { overlay.style.display = 'none'; }

  function showStart() {
    showOverlay(
      '<div class="fps-ov-title">FPS 射击</div>' +
      '<div class="fps-ov-sub">点击画面开始</div>' +
      '<div class="fps-ov-tip">WASD 移动 · 鼠标瞄准 · 左键射击 · ESC 暂停</div>' +
      (best > 0 ? '<div class="fps-ov-tip">最高分 ' + best + '</div>' : '')
    );
  }
  function showPause() {
    showOverlay(
      '<div class="fps-ov-title">已暂停</div>' +
      '<div class="fps-ov-sub">点击画面继续</div>'
    );
  }
  function showGameOver() {
    showOverlay(
      '<div class="fps-ov-title">游戏结束</div>' +
      '<div class="fps-ov-sub">得分 ' + score + (score >= best && score > 0 ? ' · 新纪录！' : '') + '</div>' +
      '<div class="fps-ov-tip">最高分 ' + best + '</div>' +
      '<div class="fps-ov-sub">点击画面重新开始</div>'
    );
  }

  // ===== 敌人 =====
  var enemyGeo = new THREE.SphereGeometry(0.55, 18, 18);
  function spawnEnemy() {
    var mat = new THREE.MeshStandardMaterial({
      color: 0xff4444, emissive: 0x661111, roughness: 0.4
    });
    var mesh = new THREE.Mesh(enemyGeo, mat);
    // 在远离玩家的边缘生成
    var angle = Math.random() * Math.PI * 2;
    var r = ARENA - 3;
    mesh.position.set(Math.cos(angle) * r, 0.55, Math.sin(angle) * r);
    mesh.castShadow = true;
    enemyGroup.add(mesh);
    enemies.push({
      mesh: mesh,
      speed: 2.2 + Math.random() * 1.6 + Math.min(score * 0.03, 2),
      lastAttack: 0,
      dead: false
    });
  }

  function clearEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      enemyGroup.remove(enemies[i].mesh);
      enemies[i].mesh.material.dispose();
    }
    enemies.length = 0;
  }

  function resetGame() {
    score = 0;
    health = 100;
    camera.position.set(0, PLAYER_H, 0);
    yaw = 0; pitch = 0;
    velocity.set(0, 0, 0);
    clearEnemies();
    for (var i = 0; i < 4; i++) spawnEnemy();
    updateHUD();
  }

  // ===== 射击 =====
  var raycaster = new THREE.Raycaster();
  var muzzleFlash = 0;

  function shoot() {
    if (state !== 'play') return;
    muzzleFlash = 4;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    var hits = raycaster.intersectObjects(enemyGroup.children);
    if (hits.length === 0) return;
    var target = hits[0].object;
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].mesh === target && !enemies[i].dead) {
        killEnemy(enemies[i]);
        return;
      }
    }
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    enemyGroup.remove(enemy.mesh);
    enemy.mesh.material.dispose();
    score += 10;
    updateHUD();
    // 补充敌人，保持节奏
    setTimeout(function () {
      if (state === 'play') spawnEnemy();
    }, 1200);
  }

  // ===== 输入 =====
  function onKeyDown(e) {
    if (wrap.offsetParent === null) return;
    var k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) { keys[k] = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    var k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  function startOrResume() {
    if (state === 'over' || state === 'idle') {
      resetGame();
      state = 'play';
      hideOverlay();
      if (hasPointerLock) {
        try { renderer.domElement.requestPointerLock(); } catch (e) {}
      }
    } else if (state === 'pause') {
      state = 'play';
      hideOverlay();
      if (hasPointerLock) {
        try { renderer.domElement.requestPointerLock(); } catch (e) {}
      }
    }
  }

  // 点击监听绑在 wrap 上：遮罩层（overlay）盖住画布时，点击也能冒泡到这里
  wrap.addEventListener('click', function () {
    if (state === 'play') {
      shoot();
    } else {
      startOrResume();
    }
  });

  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement !== renderer.domElement && state === 'play') {
      state = 'pause';
      showPause();
    }
  });

  // 切换标签时退出 pointer lock，避免鼠标被困住
  window.addEventListener('arcade:switch', function (e) {
    if (e.detail && e.detail.game !== 'fps') {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      if (state === 'play') {
        state = 'pause';
        showPause();
      }
    }
  });

  function onMouseMove(e) {
    if (state !== 'play') return;
    if (document.pointerLockElement === renderer.domElement) {
      yaw -= e.movementX * 0.0022;
      pitch -= e.movementY * 0.0022;
      pitch = Math.max(-1.4, Math.min(1.4, pitch));
    }
  }
  document.addEventListener('mousemove', onMouseMove);

  // 触屏/无 PointerLock 降级：拖拽视角
  var touchLook = null;
  renderer.domElement.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touchLook = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
    }
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', function (e) {
    if (touchLook && e.touches.length === 1 && state === 'play') {
      var dx = e.touches[0].clientX - touchLook.x;
      var dy = e.touches[0].clientY - touchLook.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) touchLook.moved = true;
      yaw -= dx * 0.005;
      pitch -= dy * 0.005;
      pitch = Math.max(-1.4, Math.min(1.4, pitch));
      touchLook.x = e.touches[0].clientX;
      touchLook.y = e.touches[0].clientY;
      e.preventDefault();
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', function () {
    if (touchLook && !touchLook.moved && state === 'play') shoot();
    touchLook = null;
  });

  // ===== 移动与碰撞 =====
  function tryMove(dx, dz) {
    var nx = camera.position.x + dx;
    var nz = camera.position.z + dz;
    nx = Math.max(-ARENA + 1, Math.min(ARENA - 1, nx));
    nz = Math.max(-ARENA + 1, Math.min(ARENA - 1, nz));
    // 障碍物碰撞（简单 AABB 推开）
    var pr = 0.5;
    for (var i = 0; i < obstacleBoxes.length; i++) {
      var b = obstacleBoxes[i];
      if (nx + pr > b.min.x && nx - pr < b.max.x &&
          nz + pr > b.min.z && nz - pr < b.max.z) {
        return; // 挡住，不移动
      }
    }
    camera.position.x = nx;
    camera.position.z = nz;
  }

  // ===== 主循环 =====
  var prevTime = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    if (wrap.offsetParent === null) return; // 面板隐藏时暂停

    var now = performance.now();
    var dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;

    if (state === 'play') {
      // 视角
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // 移动
      var speed = 8;
      var fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      var strafe = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      if (fwd !== 0 || strafe !== 0) {
        var len = Math.sqrt(fwd * fwd + strafe * strafe);
        fwd /= len; strafe /= len;
        var sin = Math.sin(yaw), cos = Math.cos(yaw);
        var dx = (strafe * cos - fwd * sin) * speed * dt;
        var dz = (-fwd * cos - strafe * sin) * speed * dt;
        tryMove(dx, dz);
      }

      // 敌人 AI
      for (var i = 0; i < enemies.length; i++) {
        var en = enemies[i];
        if (en.dead) continue;
        var pos = en.mesh.position;
        var toPlayer = new THREE.Vector3().subVectors(camera.position, pos);
        toPlayer.y = 0;
        var dist = toPlayer.length();
        toPlayer.normalize();
        pos.add(toPlayer.multiplyScalar(en.speed * dt));
        pos.y = 0.55;

        // 攻击
        if (dist < 1.3 && now - en.lastAttack > 800) {
          en.lastAttack = now;
          health -= 10;
          updateHUD();
          if (health <= 0) {
            health = 0;
            state = 'over';
            if (score > best) {
              best = score;
              try { localStorage.setItem('arcade-fps-best', String(best)); } catch (e) {}
            }
            if (document.pointerLockElement === renderer.domElement) {
              document.exitPointerLock();
            }
            showGameOver();
          }
        }
      }

      // 枪口闪光（准星短暂放大）
      if (muzzleFlash > 0) {
        muzzleFlash--;
        crosshair.classList.add('fps-crosshair-flash');
      } else {
        crosshair.classList.remove('fps-crosshair-flash');
      }
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  showStart();
})();
