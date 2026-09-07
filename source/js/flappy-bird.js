// ===== Flappy Bird 小游戏（canvas 自包含，挂载于 /fun/arcade/） =====
// 2026-09 v4：三地图 —— ①「音乐街区」像素商店街 + CD 盒障碍；②「极光雪镇」雪夜 + 冰砖障碍；
// ③「杭州夜航」西湖→西湖城区→钱塘江→钱江新城 四段式夜景旅程 + 杭州化障碍（石桥墩/塔身/桥墩钢架/高楼）
// 小鸟：新角色（hero-sheet.png 参考图自动抠帧：深灰底紧阈值 flood-fill → 连通域 → 行聚类，
//       待机/行走/奔跑/跳跃扇动/下落滑翔/攻击/受击 行序；滑翔/振翅/眩晕；失败回退企鹅帧 → body.png）
// 灵感参考：抖音同款飞行挑战（堆叠障碍 / 街景背景 / 圆角计分药丸）
// 物理/判定/操作与旧版一致
(function () {
  var host = document.getElementById('arcade-flappy');
  if (!host) return;

  var W = 420, H = 560, GROUND = 80;
  var GRAVITY = 0.38, FLAP = -6.8;
  var PIPE_W = 64, PIPE_GAP = 150, PIPE_SPACING = 220, SPEED = 2.6;

  // 资源基址（探针页用 file:// 调试时可注入 window.__flappyAssetBase 重定向）
  var ABASE = window.__flappyAssetBase || '';

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var canvas = document.createElement('canvas');
  canvas.className = 'arcade-flappy-canvas';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var state = 'ready'; // ready | play | over
  var bird, pipes, score, best = 0, frame = 0, groundX = 0;
  var scrollFar = 0, scrollMid = 0;
  var trail = [], stars = [];          // 拖尾光斑 / 振翅星星
  var flakes = [];                     // 雪镇地图：环境飘雪
  var flashT = 0, shakeT = 0, scorePop = 0, newBest = false;
  try { best = parseInt(localStorage.getItem('arcade-flappy-best'), 10) || 0; } catch (e) { best = 0; }

  // —— 地图主题：street=音乐街区 / snow=极光雪镇 / hangzhou=杭州夜航（localStorage 记忆） ——
  var MAPS = {
    street: { name: '音乐街区', sub: 'P I X E L  S T R E E T' },
    snow: { name: '极光雪镇', sub: 'A U R O R A  S N O W' },
    hangzhou: { name: '杭州夜航', sub: 'N I G H T  V O Y A G E' }
  };
  var MAP_ORDER = ['street', 'snow', 'hangzhou'];
  var mapId = 'street';
  try {
    var _m = localStorage.getItem('arcade-flappy-map');
    if (_m && MAPS[_m]) mapId = _m;
  } catch (e) {}
  function toggleMap() {
    var idx = MAP_ORDER.indexOf(mapId);
    mapId = MAP_ORDER[(idx + 1) % MAP_ORDER.length];
    try { localStorage.setItem('arcade-flappy-map', mapId); } catch (e) {}
  }
  // 飘雪初始化
  for (var fi = 0; fi < 42; fi++) {
    flakes.push({ x: Math.random() * W, y: Math.random() * (H - GROUND), s: 1 + Math.random() * 2.2, sp: 0.5 + Math.random() * 0.9, ph: Math.random() * 7, dr: 0.2 + Math.random() * 0.5 });
  }

  // —— 杭州夜航旅程状态（四段式：西湖→西湖城区→钱塘江→钱江新城，全程 4800px） ——
  var HZ_SEG_W = 1200, HZ_FAR_SEG_W = 540, HZ_END_W = 840;
  var HZ_JOURNEY_LEN = HZ_SEG_W * 4;
  var hz = { jx: 0, gx: 0, introT: 0 };

  function reset() {
    bird = { x: W * 0.3, y: H * 0.45, vy: 0, r: 14, wing: 0 };
    pipes = [];
    score = 0;
    frame = 0;
    trail = [];
    stars = [];
    newBest = false;
    hz.jx = 0; hz.gx = 0; hz.introT = 0;
  }
  reset();

  function spawnPipe(x) {
    var margin = 60;
    var gy = margin + Math.random() * (H - GROUND - margin * 2 - PIPE_GAP);
    pipes.push({ x: x, gy: gy, passed: false, seed: Math.floor(Math.random() * 997), hz: mapId === 'hangzhou' ? hzStage() : 0 });
  }

  function flap() {
    if (state === 'ready') {
      state = 'play';
      spawnPipe(W + 100);
      if (mapId === 'hangzhou') hz.introT = 85;
    }
    if (state === 'play') {
      bird.vy = FLAP;
      bird.wing = 8;
      // 振翅星星 + 拖尾爆发
      for (var i = 0; i < 3; i++) {
        stars.push({ x: bird.x - 10 - Math.random() * 8, y: bird.y + 4 + (Math.random() - 0.5) * 14, vx: -1.2 - Math.random(), vy: (Math.random() - 0.5) * 1.4, t: 22, s: 8 + Math.random() * 6 });
      }
      trail.push({ x: bird.x - 12, y: bird.y + 8, t: 18, big: true });
    } else if (state === 'over') {
      reset();
      state = 'ready';
    }
  }

  function gameOver() {
    if (state !== 'play') return;
    state = 'over';
    flashT = 6;
    shakeT = 8;
    newBest = score > best;
    if (newBest) {
      best = score;
      try { localStorage.setItem('arcade-flappy-best', String(best)); } catch (e) {}
    }
  }

  function update() {
    frame++;
    if (state === 'play') {
      bird.vy += GRAVITY;
      bird.y += bird.vy;
      if (bird.wing > 0) bird.wing--;

      // 生成管道
      var last = pipes[pipes.length - 1];
      if (!last || last.x < W - PIPE_SPACING) spawnPipe(W + 20);

      for (var i = pipes.length - 1; i >= 0; i--) {
        var p = pipes[i];
        p.x -= SPEED;
        if (p.x < -PIPE_W) { pipes.splice(i, 1); continue; }
        // 计分
        if (!p.passed && p.x + PIPE_W < bird.x - bird.r) {
          p.passed = true;
          score++;
          scorePop = 10;
        }
        // 碰撞（window.__flappyGod 供无头探针跳过死亡）
        if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W) {
          if (!window.__flappyGod && (bird.y - bird.r < p.gy || bird.y + bird.r > p.gy + PIPE_GAP)) {
            gameOver();
          }
        }
      }
      // 地面 / 天花板
      if (bird.y + bird.r > H - GROUND) { bird.y = H - GROUND - bird.r; if (!window.__flappyGod) gameOver(); }
      if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }

      // 飞行拖尾
      if (frame % 4 === 0) trail.push({ x: bird.x - 10, y: bird.y + 4 + bird.vy, t: 16, big: false });
    } else if (state === 'ready') {
      // 待机时轻微浮动
      bird.y = H * 0.45 + Math.sin(frame * 0.06) * 6;
    }

    if (state !== 'over') {
      if (mapId === 'hangzhou') {
        // 杭州：旅程仅在飞行中推进（ready/over 时画面静止）
        if (state === 'play') { hz.jx += SPEED; hz.gx = (hz.gx + SPEED) % W; }
      } else {
        scrollFar = (scrollFar + SPEED * 0.22) % W;
        scrollMid = (scrollMid + SPEED * 0.55) % (W * 2);
        groundX = (groundX + SPEED) % W;
      }
      // 飘雪（仅雪镇）
      if (mapId === 'snow') {
        for (var f = 0; f < flakes.length; f++) {
          var fl = flakes[f];
          fl.y += fl.sp;
          fl.x += Math.sin((frame + fl.ph * 30) * 0.05) * 0.3 - fl.dr;
          if (fl.y > H - GROUND + 4) { fl.y = -4; fl.x = Math.random() * W; }
          if (fl.x < -6) fl.x = W + 4; else if (fl.x > W + 6) fl.x = -4;
        }
      }
    }
    // 粒子衰减
    for (var j = trail.length - 1; j >= 0; j--) { trail[j].t--; trail[j].x -= SPEED * 0.55; if (trail[j].t <= 0) trail.splice(j, 1); }
    for (var k = stars.length - 1; k >= 0; k--) {
      var s = stars[k];
      s.t--; s.x += s.vx; s.y += s.vy;
      if (s.t <= 0) stars.splice(k, 1);
    }
    if (flashT > 0) flashT--;
    if (shakeT > 0) shakeT--;
    if (scorePop > 0) scorePop--;
    if (hz.introT > 0) hz.introT--;
  }

  // =====================================================================
  //   美术资产（全部离屏预渲染，仅构建一次）
  // =====================================================================
  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ell(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  }
  function shadowEllipse(g, x, y, rx, ry) {
    g.fillStyle = 'rgba(30,30,45,0.16)';
    ell(g, x, y, rx, ry);
    g.fill();
  }

  // —— 云（像素团块） ——
  function makeCloud(scale) {
    var c = mkCanvas(110 * scale, 42 * scale);
    var g = c.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    ell(g, 26, 26, 15, 11); g.fill();
    ell(g, 48, 18, 20, 14); g.fill();
    ell(g, 74, 25, 16, 10); g.fill();
    g.fillRect(14, 22, 72, 14);
    return c;
  }
  var clouds = [makeCloud(1), makeCloud(0.72), makeCloud(0.55)];

  // —— 天空 + 太阳 ——
  function drawSky(g) {
    var grad = g.createLinearGradient(0, 0, 0, H - GROUND);
    grad.addColorStop(0, '#6fb7d9');
    grad.addColorStop(0.55, '#a5d8e6');
    grad.addColorStop(1, '#f6e7c4');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H - GROUND);
    // 太阳（柔光）
    var sg = g.createRadialGradient(352, 66, 6, 352, 66, 64);
    sg.addColorStop(0, 'rgba(255,244,200,0.95)');
    sg.addColorStop(0.35, 'rgba(255,238,180,0.45)');
    sg.addColorStop(1, 'rgba(255,238,180,0)');
    g.fillStyle = sg;
    g.fillRect(288, 2, 128, 128);
    g.fillStyle = '#fff4c8';
    ell(g, 352, 66, 20, 20);
    g.fill();
  }

  // —— 远景剪影楼群（视差最远层） ——
  var farTile = (function () {
    var c = mkCanvas(W, H - GROUND);
    var g = c.getContext('2d');
    var back = [[-10, 258, 78], [58, 226, 62], [108, 282, 90], [186, 240, 58], [236, 268, 96], [320, 222, 66], [378, 258, 62]];
    g.fillStyle = '#c3cfe3';
    for (var i = 0; i < back.length; i++) {
      var b = back[i];
      g.fillRect(b[0], b[1], b[2], H - GROUND - b[1]);
      // 楼顶细节
      if (i % 3 === 0) g.fillRect(b[0] + b[2] / 2 - 2, b[1] - 14, 4, 14);
      if (i % 3 === 1) { g.fillRect(b[0] + 6, b[1] - 10, 16, 10); g.fillRect(b[0] + 10, b[1] - 16, 8, 6); }
    }
    var front = [[20, 300, 54], [96, 318, 70], [210, 306, 62], [300, 292, 74], [386, 320, 50]];
    g.fillStyle = '#a9b8d4';
    for (var j = 0; j < front.length; j++) {
      var f = front[j];
      g.fillRect(f[0], f[1], f[2], H - GROUND - f[1]);
      g.fillStyle = 'rgba(255,243,200,0.55)';
      for (var wy = f[1] + 12; wy < H - GROUND - 16; wy += 22) {
        for (var wx = f[0] + 8; wx < f[0] + f[2] - 10; wx += 16) {
          if ((wx * 7 + wy * 13) % 5 < 2) g.fillRect(wx, wy, 5, 7);
        }
      }
      g.fillStyle = '#a9b8d4';
    }
    return c;
  })();

  // —— 中景：商店街（840 宽循环带，立在地面上沿 y=H-GROUND） ——
  // 注意：懒构建 —— 店铺橱窗里引用了 caseVariants，必须等它初始化后再构建
  var MID_W = W * 2; // 840 = 一个街区组合的实际宽度
  var midTile = null;
  function buildMidTile() {
    var c = mkCanvas(MID_W, H - GROUND);
    var g = c.getContext('2d');
    var SY = H - GROUND; // 人行道上沿 = 480

    drawRecordShop(g, 0);
    drawWallAndVendor(g, 250);
    drawSweetsShop(g, 290);
    drawLamp(g, 556);
    drawTree(g, 578);
    drawLiveHouse(g, 590);
    // 行人（烘焙进背景，街头点缀）
    ped(g, 200, SY, '#c86a8a', '#3a3a4e', '#3a2b30', 0);
    ped(g, 470, SY, '#4a6b8a', '#3a4a5e', '#2e2430', 1);
    ped(g, 790, SY, '#e0b34a', '#4a4a58', '#4a3524', 2);

    // 唱片行（青绿立面）
    function drawRecordShop(g, x) {
      g.fillStyle = '#6fae9e'; g.fillRect(x, 150, 250, SY - 150);
      g.fillStyle = '#5d968a'; g.fillRect(x + 246, 150, 4, SY - 150);
      g.fillRect(x, 144, 250, 10);
      // 楼顶：AC 机 + 天线
      g.fillStyle = '#9aa4ae'; g.fillRect(x + 28, 118, 36, 26);
      g.fillStyle = '#7e8894';
      g.fillRect(x + 32, 124, 28, 2); g.fillRect(x + 32, 130, 28, 2);
      g.fillStyle = '#5a6470'; g.fillRect(x + 198, 108, 3, 36);
      // 招牌
      g.fillStyle = '#2f4a44'; g.fillRect(x + 10, 160, 230, 40);
      g.font = 'bold 24px "Arial", "Microsoft YaHei", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd95a'; g.fillText('CD·RECORD', x + 125, 181);
      g.fillStyle = '#bfe8da'; g.font = 'bold 16px sans-serif';
      g.fillText('♪', x + 26, 181); g.fillText('♪', x + 224, 181);
      // 遮阳棚（青白条纹 + 扇贝边）
      awning(g, x + 18, 206, 150, 16, '#7fc8b8', '#f2f7f4');
      // 橱窗（里面陈列 CD）
      g.fillStyle = '#3a4a46'; g.fillRect(x + 16, 224, 154, 154);
      g.fillStyle = '#33414e'; g.fillRect(x + 20, 228, 146, 146);
      g.fillStyle = '#24303a';
      g.fillRect(x + 26, 292, 134, 4); g.fillRect(x + 26, 344, 134, 4);
      var minis = [[1, 30, 262, -0.12], [4, 72, 258, 0.1], [0, 112, 262, -0.08]];
      for (var m = 0; m < minis.length; m++) {
        var mm = minis[m];
        g.save();
        g.translate(x + mm[1] + 15, mm[2] + 14);
        g.rotate(mm[3]);
        g.drawImage(caseVariants[mm[0]], -16, -14, 32, 28);
        g.restore();
      }
      g.fillStyle = '#e8a0b4'; g.fillRect(x + 122, 234, 38, 26);
      g.fillStyle = '#8ab8e0'; g.fillRect(x + 122, 266, 38, 18);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 20, 228, 146, 146);
      g.fillStyle = '#33414e'; g.fillRect(x + 20, 228, 146, 60);
      // 门（带舷窗）
      g.fillStyle = '#35544c'; g.fillRect(x + 178, 212, 56, SY - 212);
      g.fillStyle = '#4a6b60'; g.fillRect(x + 182, 244, 48, SY - 244);
      g.fillStyle = '#ffedbe'; g.fillRect(x + 182, 218, 48, 20);
      g.fillStyle = '#33414e'; ell(g, x + 206, 300, 13, 13); g.fill();
      g.fillStyle = '#7fb8d8'; ell(g, x + 206, 300, 10, 10); g.fill();
      g.fillStyle = '#d8e8dd'; g.fillRect(x + 222, 330, 4, 14);
      // 基座阴影线
      g.fillStyle = '#3f5a52'; g.fillRect(x, SY - 6, 250, 6);
    }

    // 共享墙 + 自动贩卖机
    function drawWallAndVendor(g, x) {
      g.fillStyle = '#d8cfc0'; g.fillRect(x, 150, 40, SY - 150);
      g.fillStyle = '#c4b9a8'; g.fillRect(x, 144, 40, 8);
      // 贩卖机（站在人行道上）
      shadowEllipse(g, x + 20, SY - 2, 24, 5);
      g.fillStyle = '#d94a4a'; g.fillRect(x + 2, SY - 88, 36, 86);
      g.fillStyle = '#f2f2f2'; g.fillRect(x + 2, SY - 88, 36, 14);
      g.fillStyle = '#d94a4a'; ell(g, x + 20, SY - 81, 4, 4); g.fill();
      g.fillStyle = '#2e3440'; g.fillRect(x + 6, SY - 70, 28, 42);
      g.fillStyle = 'rgba(255,237,190,0.3)'; g.fillRect(x + 6, SY - 70, 28, 42);
      var cans = ['#58b7e8', '#f2d05a', '#e05656', '#7fc8b8'];
      for (var i = 0; i < 4; i++) {
        g.fillStyle = cans[i];
        g.fillRect(x + 10 + (i % 2) * 13, SY - 66 + Math.floor(i / 2) * 18, 8, 12);
      }
      g.fillStyle = '#2e3440'; g.fillRect(x + 12, SY - 22, 16, 9);
      g.fillStyle = '#b83e3e'; g.fillRect(x + 2, SY - 6, 36, 4);
    }

    // 甜品店（奶油立面 + 粉棚 + 连衣裙橱窗）
    function drawSweetsShop(g, x) {
      g.fillStyle = '#f2e6cf'; g.fillRect(x, 140, 230, SY - 140);
      g.fillStyle = '#e0d0b2'; g.fillRect(x, 134, 230, 10);
      // 二楼窗
      g.fillStyle = '#b89a72'; g.fillRect(x + 30, 160, 46, 56); g.fillRect(x + 150, 160, 46, 56);
      g.fillStyle = '#ffe2a8'; g.fillRect(x + 34, 164, 38, 48);
      g.fillStyle = '#4a5568'; g.fillRect(x + 154, 164, 38, 48);
      g.fillStyle = '#a08860'; g.fillRect(x + 28, 214, 50, 4); g.fillRect(x + 148, 214, 50, 4);
      // 挂侧招牌
      g.fillStyle = '#6a5a48'; g.fillRect(x + 224, 214, 4, 18);
      g.fillStyle = '#fdf4f6'; g.fillRect(x + 212, 230, 28, 78);
      g.strokeStyle = '#f0a8c0'; g.lineWidth = 3; g.strokeRect(x + 212, 230, 28, 78);
      g.font = 'bold 15px "Arial", sans-serif';
      g.fillStyle = '#e07a9a'; g.textAlign = 'center';
      var letters = 'SWEETS';
      for (var li = 0; li < letters.length; li++) g.fillText(letters[li], x + 226, 246 + li * 12);
      // 粉白遮阳棚
      awning(g, x + 12, 228, 190, 20, '#f5b8c8', '#fdf4f6');
      // 大橱窗：连衣裙模特 + 蛋糕 dome
      g.fillStyle = '#b89a72'; g.fillRect(x + 12, 254, 190, 154);
      g.fillStyle = '#3d4854'; g.fillRect(x + 16, 258, 182, 146);
      // 连衣裙
      g.fillStyle = '#9aa4ae'; g.fillRect(x + 92, 330, 3, 60);
      g.fillStyle = '#f2a0b8';
      g.beginPath();
      g.moveTo(x + 80, 272); g.lineTo(x + 108, 272); g.lineTo(x + 118, 336); g.lineTo(x + 70, 336);
      g.closePath(); g.fill();
      g.fillStyle = '#fdf4f6'; g.fillRect(x + 82, 288, 26, 6);
      g.strokeStyle = '#e088a4'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + 86, 300); g.lineTo(x + 84, 330); g.moveTo(x + 96, 300); g.lineTo(x + 97, 330); g.moveTo(x + 105, 300); g.lineTo(x + 110, 330); g.stroke();
      ell(g, x + 94, 266, 6, 6); g.fillStyle = '#f2c8a8'; g.fill();
      // 蛋糕 dome
      g.fillStyle = '#d8e2ea'; ell(g, x + 156, 396, 22, 4); g.fill();
      g.fillStyle = '#ffd9e8'; g.beginPath(); g.arc(x + 156, 392, 16, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = '#e07a9a'; ell(g, x + 150, 384, 2.5, 2.5); g.fill();
      ell(g, x + 162, 380, 2.5, 2.5); g.fill();
      // 玻璃反光
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.save();
      g.beginPath(); g.rect(x + 16, 258, 182, 146); g.clip();
      g.save(); g.rotate(-0.5);
      g.fillRect(x + 40, 180, 12, 320); g.fillRect(x + 70, 180, 6, 320);
      g.restore();
      g.restore();
      // 花箱
      g.fillStyle = '#b85a4a'; g.fillRect(x + 12, 410, 190, 13);
      for (var fi = 0; fi < 8; fi++) {
        g.fillStyle = fi % 2 ? '#e86a8a' : '#ffd95a';
        ell(g, x + 24 + fi * 23, 408, 5, 4); g.fill();
        g.fillStyle = '#6fae5e'; g.fillRect(x + 22 + fi * 23, 410, 4, 5);
      }
      // 门
      g.fillStyle = '#d9b98e'; g.fillRect(x + 178, 300, 34, SY - 300);
      g.fillStyle = '#b89a72'; g.fillRect(x + 176, 298, 38, 4);
      g.fillStyle = '#f2e6cf'; ell(g, x + 195, 340, 8, 8); g.fill();
      g.fillStyle = '#3d4854'; ell(g, x + 195, 340, 6, 6); g.fill();
      g.fillStyle = '#c9b795'; g.fillRect(x, SY - 6, 230, 6);
    }

    // LIVE HOUSE（深紫立面 + 灯泡招牌 + 音响）
    function drawLiveHouse(g, x) {
      g.fillStyle = '#4a4158'; g.fillRect(x, 130, 250, SY - 130);
      g.fillStyle = '#3a3348'; g.fillRect(x, 124, 250, 10);
      // 楼顶水塔
      g.fillStyle = '#8a94a8'; g.fillRect(x + 188, 88, 40, 36);
      g.fillStyle = '#6a7488';
      g.beginPath(); g.moveTo(x + 184, 90); g.lineTo(x + 208, 72); g.lineTo(x + 232, 90); g.closePath(); g.fill();
      g.strokeStyle = '#5a6474'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 192, 124); g.lineTo(x + 192, 106); g.moveTo(x + 224, 124); g.lineTo(x + 224, 106); g.stroke();
      // 灯泡串
      for (var b = 0; b < 12; b++) {
        g.fillStyle = b % 2 ? '#8a7fa8' : '#ffe08a';
        ell(g, x + 12 + b * 20, 141, 3, 3); g.fill();
      }
      // 主招牌
      g.fillStyle = '#241f30'; g.fillRect(x + 16, 152, 190, 54);
      g.strokeStyle = '#6a5a8a'; g.lineWidth = 3; g.strokeRect(x + 16, 152, 190, 54);
      g.save();
      g.shadowColor = '#ffbe5a'; g.shadowBlur = 14;
      g.font = 'bold 34px "Arial Black", "Arial", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffe9b0';
      g.fillText('LIVE', x + 111, 182);
      g.restore();
      // 招牌边灯泡
      for (var bb = 0; bb < 9; bb++) {
        g.fillStyle = bb % 2 ? '#ffe08a' : '#8a7fa8';
        ell(g, x + 22 + bb * 22, 158, 2.5, 2.5); g.fill();
        g.fillStyle = bb % 2 ? '#8a7fa8' : '#ffe08a';
        ell(g, x + 22 + bb * 22, 200, 2.5, 2.5); g.fill();
      }
      // 海报墙
      g.fillStyle = '#3a3348'; g.fillRect(x + 16, 226, 110, 124);
      var posters = ['#e07a9a', '#7ab8e0', '#ffd95a', '#8ae0b8', '#c89ae0', '#f2a05a'];
      for (var pi = 0; pi < 6; pi++) {
        var pxx = x + 24 + (pi % 3) * 35, pyy = 234 + Math.floor(pi / 3) * 58;
        g.fillStyle = posters[pi];
        g.fillRect(pxx, pyy, 27, 46);
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(pxx + 4, pyy + 30 - (pi % 2) * 6);
        g.quadraticCurveTo(pxx + 11, pyy + 16, pxx + 19, pyy + 26);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(pxx + 4, pyy + 36, 17, 3);
      }
      // 门 + 音响
      g.fillStyle = '#ffedbe'; g.fillRect(x + 158, 226, 66, 20);
      g.font = 'bold 13px "Arial", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#4a3a2a'; g.fillText('OPEN', x + 191, 237);
      g.fillStyle = '#2a2438'; g.fillRect(x + 160, 250, 62, SY - 250);
      g.fillStyle = '#35405e'; g.fillRect(x + 164, 254, 25, SY - 258); g.fillRect(x + 193, 254, 25, SY - 258);
      g.fillStyle = 'rgba(255,202,122,0.45)'; g.fillRect(x + 164, 330, 54, SY - 334);
      g.fillStyle = '#d8e0f0';
      g.fillRect(x + 184, 330, 4, 12); g.fillRect(x + 196, 330, 4, 12);
      // 音响堆 x2（分列大门两侧）
      speaker(g, x + 128, 250);
      speaker(g, x + 222, 250);
      g.fillStyle = '#2e2838'; g.fillRect(x, SY - 6, 250, 6);
    }

    function speaker(g, x, yTop) {
      g.fillStyle = '#26222e'; g.fillRect(x, yTop, 28, 112);
      g.fillStyle = '#4a4458';
      ell(g, x + 14, yTop + 24, 9, 9); g.fill();
      ell(g, x + 14, yTop + 78, 11, 11); g.fill();
      g.fillStyle = '#26222e';
      ell(g, x + 14, yTop + 24, 3.5, 3.5); g.fill();
      ell(g, x + 14, yTop + 78, 4.5, 4.5); g.fill();
      g.strokeStyle = '#3a3444'; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + 4, yTop + 42); g.lineTo(x + 24, yTop + 42);
      g.stroke();
    }

    // 路灯（站在人行道上）
    function drawLamp(g, x) {
      shadowEllipse(g, x, SY - 2, 16, 4);
      g.fillStyle = '#3a3f4a';
      g.fillRect(x - 2, SY - 104, 4, 102);
      g.fillRect(x - 8, SY - 4, 16, 5);
      g.beginPath();
      g.moveTo(x, SY - 102);
      g.quadraticCurveTo(x + 2, SY - 116, x + 18, SY - 114);
      g.strokeStyle = '#3a3f4a'; g.lineWidth = 4; g.stroke();
      var hg = g.createRadialGradient(x + 22, SY - 112, 2, x + 22, SY - 112, 22);
      hg.addColorStop(0, 'rgba(255,223,154,0.5)');
      hg.addColorStop(1, 'rgba(255,223,154,0)');
      g.fillStyle = hg;
      g.fillRect(x, SY - 134, 46, 46);
      g.fillStyle = '#ffdf9a';
      ell(g, x + 22, SY - 112, 7, 7); g.fill();
      g.fillStyle = '#3a3f4a'; g.fillRect(x + 14, SY - 120, 17, 4);
    }

    // 行道树
    function drawTree(g, x) {
      shadowEllipse(g, x, SY - 2, 22, 5);
      g.fillStyle = '#7a5a40'; g.fillRect(x - 4, SY - 44, 9, 44);
      g.fillStyle = '#5f8f4a'; ell(g, x, SY - 62, 24, 20); g.fill();
      g.fillStyle = '#6fae5e'; ell(g, x - 14, SY - 52, 15, 12); g.fill();
      ell(g, x + 14, SY - 54, 15, 12); g.fill();
      g.fillStyle = '#8cc474'; ell(g, x - 4, SY - 72, 14, 11); g.fill();
    }

    // 行人（简单像素小人，中景装饰）
    function ped(g, x, yFeet, top, pants, hair, seed) {
      var swing = (seed % 2) ? 3 : -3;
      shadowEllipse(g, x, yFeet - 1, 10, 3);
      g.strokeStyle = pants; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 1, yFeet - 12); g.lineTo(x - 4, yFeet);
      g.moveTo(x + 1, yFeet - 12); g.lineTo(x + 4 + swing * 0.4, yFeet);
      g.stroke();
      g.fillStyle = top;
      rr(g, x - 5, yFeet - 25, 10, 14, 3); g.fill();
      g.fillStyle = '#ffe3cf'; ell(g, x, yFeet - 30, 5, 5.5); g.fill();
      g.fillStyle = hair;
      g.beginPath(); g.arc(x, yFeet - 31.5, 5, Math.PI, 0); g.closePath(); g.fill();
    }
    return c;
  }

  // 遮阳棚（条纹 + 扇贝边，供各店铺复用）
  function awning(g, x, y, w, h, c1, c2) {
    var n = Math.round(w / 24);
    var sw = w / n;
    for (var i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? c2 : c1;
      g.fillRect(x + i * sw, y, sw + 0.5, h);
      g.beginPath();
      g.arc(x + i * sw + sw / 2, y + h, sw / 2, 0, Math.PI);
      g.fill();
    }
    g.fillStyle = 'rgba(40,30,40,0.18)';
    g.fillRect(x, y + h, w, 2);
  }

  // —— 地面（人行道 + 马路，420 宽循环） ——
  var groundTile = (function () {
    var c = mkCanvas(W, GROUND);
    var g = c.getContext('2d');
    var roadY = 34;
    g.fillStyle = '#d3ccc0'; g.fillRect(0, 0, W, roadY);
    g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, W, 3);
    g.fillStyle = '#bfb7a8';
    for (var x = 0; x < W; x += 42) g.fillRect(x, 5, 2, 27);
    g.fillStyle = '#a89f90'; g.fillRect(0, roadY - 4, W, 4);
    g.fillStyle = '#464a58'; g.fillRect(0, roadY, W, GROUND - roadY);
    g.fillStyle = '#5a5e6e'; g.fillRect(0, roadY + 3, W, 2);
    g.fillStyle = '#3d4152';
    g.fillRect(30, 46, 22, 3); g.fillRect(190, 62, 30, 3); g.fillRect(330, 50, 20, 3);
    g.fillStyle = '#e8c84a';
    for (var d = 0; d < W; d += 52) g.fillRect(d, 56, 26, 5);
    return c;
  })();

  // —— CD 盒障碍（6 种专辑封面变体，64x52） ——
  var CASE_W = 64, CASE_H = 52;
  var caseVariants = (function () {
    var painters = [
      // 1 城市日落（City Pop）
      function (g) {
        var gr = g.createLinearGradient(0, 0, 0, CASE_H);
        gr.addColorStop(0, '#8a5a9e'); gr.addColorStop(0.55, '#ff9a5a'); gr.addColorStop(1, '#ffd47e');
        g.fillStyle = gr; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#fff3b0'; ell(g, 32, 30, 13, 13); g.fill();
        g.fillStyle = '#ff9a5a';
        g.fillRect(18, 30, 28, 3); g.fillRect(22, 36, 20, 3); g.fillRect(26, 42, 12, 3);
        g.strokeStyle = 'rgba(216,106,74,0.6)'; g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(6, 40); g.lineTo(58, 40); g.moveTo(10, 45); g.lineTo(54, 45); g.moveTo(2, 49); g.lineTo(62, 49);
        g.stroke();
      },
      // 2 粉色爱心（同款心形 CD）
      function (g) {
        g.fillStyle = '#ffd7e2'; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#ff9ec2';
        ell(g, 20, 20, 8, 8); g.fill(); ell(g, 36, 20, 8, 8); g.fill();
        g.beginPath(); g.moveTo(12, 24); g.lineTo(28, 44); g.lineTo(44, 24); g.closePath(); g.fill();
        g.fillStyle = '#e05656';
        ell(g, 32, 26, 9, 9); g.fill();
        g.fillStyle = '#f5f5f8'; ell(g, 32, 26, 3.5, 3.5); g.fill();
        g.fillStyle = '#fff'; g.fillRect(46, 10, 6, 2); g.fillRect(48, 8, 2, 6);
      },
      // 3 海面晴空
      function (g) {
        var gr = g.createLinearGradient(0, 0, 0, CASE_H);
        gr.addColorStop(0, '#58a8e8'); gr.addColorStop(0.6, '#8ed0f0'); gr.addColorStop(1, '#c8ecf2');
        g.fillStyle = gr; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#fff'; ell(g, 44, 14, 7, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(6, 34); g.quadraticCurveTo(14, 29, 22, 34); g.quadraticCurveTo(30, 39, 38, 34);
        g.moveTo(20, 43); g.quadraticCurveTo(28, 38, 36, 43); g.quadraticCurveTo(44, 48, 54, 43);
        g.stroke();
      },
      // 4 星夜
      function (g) {
        g.fillStyle = '#2e3160'; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#f6e7a8';
        g.beginPath(); g.arc(40, 16, 8, 0.6, 5.2); g.lineTo(40, 16); g.closePath(); g.fill();
        ell(g, 36, 13, 2.2, 2.2); g.fill();
        g.fillStyle = '#fff';
        var st = [[10, 12], [22, 20], [16, 34], [30, 40], [50, 34], [54, 22], [44, 44]];
        for (var i = 0; i < st.length; i++) g.fillRect(st[i][0], st[i][1], 2, 2);
      },
      // 5 青绿棋盘
      function (g) {
        g.fillStyle = '#58c8b8'; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#7adcc8';
        for (var y = 0; y < CASE_H; y += 10) {
          for (var x = ((y / 10) % 2) * 10; x < CASE_W; x += 20) g.fillRect(x, y, 10, 10);
        }
        g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(32, 12); g.lineTo(46, 34); g.lineTo(18, 34); g.closePath(); g.fill();
        g.fillStyle = '#2e7a6e'; ell(g, 32, 42, 6, 6); g.fill();
      },
      // 6 复古卡带
      function (g) {
        g.fillStyle = '#f2d05a'; g.fillRect(0, 0, CASE_W, CASE_H);
        g.fillStyle = '#33303e'; rr(g, 12, 12, 40, 26, 3); g.fill();
        g.fillStyle = '#f2d05a'; g.fillRect(16, 16, 32, 8);
        g.fillStyle = '#fff';
        ell(g, 22, 30, 4.5, 4.5); g.fill(); ell(g, 42, 30, 4.5, 4.5); g.fill();
        g.fillStyle = '#33303e';
        ell(g, 22, 30, 1.5, 1.5); g.fill(); ell(g, 42, 30, 1.5, 1.5); g.fill();
        g.fillStyle = '#e05656'; g.fillRect(28, 29, 8, 2);
      }
    ];
    return painters.map(function (paint) {
      var c = mkCanvas(CASE_W, CASE_H);
      var g = c.getContext('2d');
      // 半透明青绿盒身（同款 CD 盒）
      g.fillStyle = 'rgba(190,230,120,0.28)';
      rr(g, 0.5, 0.5, CASE_W - 1, CASE_H - 1, 5); g.fill();
      // 专辑画
      g.save();
      rr(g, 5, 5, CASE_W - 10, CASE_H - 10, 3); g.clip();
      paint(g);
      g.restore();
      // 盘面（银碟叠在封面上，同款「碟压封面」）
      var dg = g.createRadialGradient(37, 34, 2, 37, 34, 11.5);
      dg.addColorStop(0, '#f8f8fa');
      dg.addColorStop(0.55, '#d8dce4');
      dg.addColorStop(1, '#b8bfd0');
      g.fillStyle = dg;
      ell(g, 37, 34, 11, 11); g.fill();
      g.beginPath(); g.arc(37, 34, 8.5, -0.9, 0.2); g.strokeStyle = 'rgba(255,140,160,0.5)'; g.lineWidth = 1.6; g.stroke();
      g.beginPath(); g.arc(37, 34, 8.5, 1.4, 2.4); g.strokeStyle = 'rgba(130,180,255,0.5)'; g.stroke();
      g.fillStyle = '#3a3f4a'; ell(g, 37, 34, 2.8, 2.8); g.fill();
      g.fillStyle = '#e8ecf2'; ell(g, 37, 34, 1.2, 1.2); g.fill();
      // 斜向高光
      g.save();
      rr(g, 0.5, 0.5, CASE_W - 1, CASE_H - 1, 5); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.save(); g.rotate(-0.5);
      g.fillRect(24, -20, 9, 90); g.fillRect(38, -20, 4, 90);
      g.restore();
      g.restore();
      // 盒框 + 描边
      g.strokeStyle = 'rgba(150,200,80,0.9)'; g.lineWidth = 2;
      rr(g, 1, 1, CASE_W - 2, CASE_H - 2, 5); g.stroke();
      g.strokeStyle = '#2e3040'; g.lineWidth = 1.5;
      rr(g, 0.5, 0.5, CASE_W - 1, CASE_H - 1, 5); g.stroke();
      // 盒底阴影
      g.fillStyle = 'rgba(46,48,64,0.4)';
      g.fillRect(2, CASE_H - 4, CASE_W - 4, 3);
      return c;
    });
  })();

  // =====================================================================
  //   地图②「极光雪镇」美术资产（雪夜 / 极光 / 雪镇 / 冰砖障碍 / 飘雪）
  // =====================================================================

  // —— 积雪横条（dir='down' 雪从底面垂挂；dir='up' 雪在顶面堆积），障碍柱与屋檐复用 ——
  function snowBar(g, x, y, w, h, dir) {
    g.fillStyle = '#f4f9ff';
    g.fillRect(x, y, w, h);
    var r = 7;
    g.beginPath();
    for (var i = 0; i <= w; i += r * 2) {
      var cx = x + i + r;
      g.moveTo(cx - r, dir === 'down' ? y + h : y);
      g.arc(cx, dir === 'down' ? y + h : y, r, dir === 'down' ? 0 : Math.PI, dir === 'down' ? Math.PI : Math.PI * 2);
    }
    g.fill();
  }
  // —— 冰棱（屋檐下） ——
  function icicles(g, x, y, w) {
    g.fillStyle = '#eaf3fd';
    for (var i = 0; i < w; i += 18) {
      var h = 8 + (i % 3) * 5;
      g.beginPath();
      g.moveTo(x + i, y); g.lineTo(x + i + 7, y); g.lineTo(x + i + 3.5, y + h);
      g.closePath(); g.fill();
    }
  }

  // —— 雪夜天空（渐变 + 星星 + 月亮 + 极光，静态烘焙） ——
  var snowSkyTile = (function () {
    var c = mkCanvas(W, H - GROUND);
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, H - GROUND);
    grad.addColorStop(0, '#0b1530');
    grad.addColorStop(0.5, '#16304f');
    grad.addColorStop(1, '#2c5170');
    g.fillStyle = grad; g.fillRect(0, 0, W, H - GROUND);
    // 星星
    var sd = [[24, 40, 1.4], [60, 80, 1], [96, 30, 1.2], [140, 96, 0.9], [180, 44, 1.3], [224, 74, 0.9], [268, 30, 1.1], [300, 100, 1.4], [340, 52, 0.9], [390, 90, 1.2], [44, 130, 0.9], [130, 150, 1.1], [250, 140, 0.9], [360, 130, 1], [200, 24, 0.8], [80, 180, 0.8], [330, 180, 0.9]];
    for (var i = 0; i < sd.length; i++) {
      g.globalAlpha = 0.4 + 0.6 * (((sd[i][0] * 7 + sd[i][1]) % 5) / 4);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(sd[i][0], sd[i][1], sd[i][2], 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // 月亮（带月晕）
    var mg = g.createRadialGradient(350, 70, 8, 350, 70, 52);
    mg.addColorStop(0, 'rgba(230,240,255,0.85)'); mg.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = mg; g.fillRect(298, 18, 104, 104);
    g.fillStyle = '#e8f0ff';
    ell(g, 350, 70, 18, 18); g.fill();
    g.fillStyle = '#cdd9ec';
    ell(g, 343, 64, 3.4, 3.4); g.fill();
    ell(g, 356, 76, 2.6, 2.6); g.fill();
    ell(g, 352, 62, 2, 2); g.fill();
    // 极光光带
    function aurora(color, alpha, baseY, amp, phase, lw) {
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath();
      for (var x = -20; x <= W + 20; x += 12) {
        var y = baseY + Math.sin(x * 0.012 + phase) * amp + Math.sin(x * 0.031 + phase * 2) * amp * 0.35;
        if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); g.restore();
    }
    aurora('#5fe6a8', 0.18, 96, 26, 0.5, 26);
    aurora('#54c8e8', 0.16, 132, 20, 2.1, 20);
    aurora('#b07ae8', 0.12, 162, 18, 4.0, 16);
    aurora('#7affc8', 0.10, 78, 18, 3.2, 14);
    return c;
  })();

  // —— 远景冰山（透明剪影） ——
  var snowFarTile = (function () {
    var c = mkCanvas(W, H - GROUND);
    var g = c.getContext('2d');
    function peaks(color, pts) {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.fill();
    }
    peaks('#22375c', [[-30, 430], [60, 286], [120, 350], [180, 270], [260, 430]]);
    peaks('#2b4570', [[120, 430], [230, 300], [300, 360], [380, 288], [460, 430]]);
    peaks('#34537e', [[-30, 440], [50, 330], [120, 400], [210, 320], [300, 440]]);
    // 山顶积雪：沿峰顶两侧坡面贴合的锯齿雪三角（slopeL/slopeR = 坡面 dx/dy）
    function snowCap(px, py, slopeL, slopeR, d) {
      var xL = px - slopeL * d, xR = px + slopeR * d;
      g.fillStyle = '#eaf3ff';
      g.beginPath();
      g.moveTo(px, py + 2);
      g.lineTo(xL, py + d);
      var n = 5;
      for (var i = 1; i <= n; i++) {
        var bx = xL + (xR - xL) * (i / n);
        var by = py + d - (i % 2 === 1 ? 7 : 0);
        g.lineTo(bx, by);
      }
      g.closePath(); g.fill();
    }
    snowCap(60, 286, 0.625, 0.94, 36);
    snowCap(180, 270, 0.75, 0.5, 34);
    snowCap(230, 300, 0.85, 1.17, 26);
    snowCap(380, 288, 1.11, 0.56, 34);
    snowCap(50, 330, 0.73, 1.0, 32);
    snowCap(210, 320, 1.125, 0.75, 30);
    // 冰面海平线
    g.fillStyle = 'rgba(120,160,200,0.25)';
    g.fillRect(0, 432, W, 10);
    return c;
  })();

  // —— 中景：雪镇（840 宽循环带，懒构建） ——
  var snowMidTile = null;
  function buildSnowMidTile() {
    var c = mkCanvas(MID_W, H - GROUND);
    var g = c.getContext('2d');
    var SY = H - GROUND; // 480

    drawCabin(g, 0);
    drawIgloo(g, 252);
    drawPine(g, 420, 1.05);
    drawSnowman(g, 474);
    drawLampSnow(g, 534);
    drawPine(g, 572, 0.85);
    drawIceHouse(g, 600);
    drawPine(g, 826, 1);
    // 小企鹅「行人」
    peng(g, 330, SY, 1);
    peng(g, 770, SY, 0.85);
    // 沿街雪堆
    g.fillStyle = '#f4f9ff';
    for (var dx = 10; dx < MID_W; dx += 92) {
      g.beginPath(); g.ellipse(dx, SY - 2, 34, 8, 0, Math.PI, 0); g.fill();
    }

    // —— 雪顶木屋（暖色灯火） ——
    function drawCabin(g, x) {
      // 墙身
      g.fillStyle = '#7a5142'; g.fillRect(x, 186, 240, SY - 186);
      g.fillStyle = '#684133'; g.fillRect(x + 232, 186, 8, SY - 186);
      g.fillStyle = 'rgba(60,36,28,0.25)';
      for (var ly = 210; ly < SY; ly += 26) g.fillRect(x, ly, 240, 3);
      // 三角屋顶（先棕色底，再厚积雪）
      g.fillStyle = '#5c3a2c';
      g.beginPath(); g.moveTo(x - 18, 190); g.lineTo(x + 258, 190); g.lineTo(x + 120, 92); g.closePath(); g.fill();
      // 烟囱（压在雪层下沿）
      g.fillStyle = '#8a4a3a'; g.fillRect(x + 178, 108, 20, 44);
      g.fillStyle = '#723d30'; g.fillRect(x + 180, 118, 16, 4); g.fillRect(x + 180, 130, 16, 4);
      snowBar(g, x + 174, 102, 28, 8, 'up');
      // 屋顶积雪（内缩三角 + 底面雪挂）
      g.fillStyle = '#f2f8ff';
      g.beginPath(); g.moveTo(x - 2, 180); g.lineTo(x + 242, 180); g.lineTo(x + 120, 106); g.closePath(); g.fill();
      snowBar(g, x - 2, 176, 244, 8, 'down');
      icicles(g, x + 6, 188, 228);
      // 暖窗 x2
      cabinWindow(g, x + 34, 276);
      cabinWindow(g, x + 166, 276);
      // 门
      g.fillStyle = '#4a2f26';
      g.beginPath(); g.moveTo(x + 96, SY); g.lineTo(x + 96, 386); g.arc(x + 120, 386, 24, Math.PI, 0); g.lineTo(x + 144, SY); g.closePath(); g.fill();
      g.fillStyle = '#ffd98a'; ell(g, x + 138, 420, 2.4, 2.4); g.fill();
      // 挂牌
      g.fillStyle = '#5c3a2c'; rr(g, x + 92, 214, 56, 26, 4); g.fill();
      snowBar(g, x + 90, 208, 60, 7, 'up');
      g.font = 'bold 14px "Arial", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd98a'; g.fillText('INN', x + 120, 228);
    }
    function cabinWindow(g, x, y) {
      g.fillStyle = '#4a2f26'; g.fillRect(x - 4, y - 4, 58, 52);
      var wg = g.createLinearGradient(0, y, 0, y + 44);
      wg.addColorStop(0, '#ffe9b8'); wg.addColorStop(1, '#f2b65a');
      g.fillStyle = wg; g.fillRect(x, y, 50, 44);
      g.fillStyle = '#7a5142'; g.fillRect(x + 23, y, 4, 44); g.fillRect(x, y + 20, 50, 4);
      snowBar(g, x - 4, y + 44, 58, 6, 'down');
    }

    // —— 冰屋 ——
    function drawIgloo(g, x) {
      var cx = x + 78;
      shadowEllipse(g, cx, SY - 2, 84, 12);
      // 穹顶
      g.fillStyle = '#eaf3fd';
      g.beginPath(); g.arc(cx, SY - 6, 72, Math.PI, 0); g.closePath(); g.fill();
      g.fillRect(cx - 72, SY - 6, 144, 8);
      // 冰块缝线
      g.strokeStyle = '#bcd6ee'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, SY - 6, 54, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.beginPath(); g.arc(cx, SY - 6, 34, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.beginPath(); g.moveTo(cx, SY - 78); g.lineTo(cx, SY - 10); g.stroke();
      g.beginPath(); g.moveTo(cx - 50, SY - 44); g.lineTo(cx + 50, SY - 44); g.stroke();
      // 入口
      g.fillStyle = '#2b4a6e';
      g.beginPath(); g.moveTo(cx - 22, SY); g.lineTo(cx - 22, SY - 34); g.arc(cx, SY - 34, 22, Math.PI, 0); g.lineTo(cx + 22, SY); g.closePath(); g.fill();
      g.fillStyle = '#1d3550';
      g.beginPath(); g.moveTo(cx - 14, SY); g.lineTo(cx - 14, SY - 30); g.arc(cx, SY - 30, 14, Math.PI, 0); g.lineTo(cx + 14, SY); g.closePath(); g.fill();
      // 顶雪高光
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(cx, SY - 8, 66, Math.PI * 1.15, Math.PI * 1.5); g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
    }

    // —— 冰砖小屋 ——
    function drawIceHouse(g, x) {
      // 墙身（冰砖砌法）
      g.fillStyle = '#bfe0f4'; g.fillRect(x, 204, 236, SY - 204);
      var bh = 34;
      for (var ry = 204; ry < SY; ry += bh) {
        var off = ((ry / bh) % 2) ? 30 : 0;
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, ry); g.lineTo(x + 236, ry); g.stroke();
        for (var bx = x + off; bx < x + 236; bx += 60) {
          g.beginPath(); g.moveTo(bx, ry); g.lineTo(bx, ry + bh); g.stroke();
        }
      }
      g.fillStyle = 'rgba(130,180,220,0.35)'; g.fillRect(x + 228, 204, 8, SY - 204);
      // 平顶厚雪
      snowBar(g, x - 10, 186, 256, 12, 'up');
      icicles(g, x + 4, 202, 228);
      // 暖窗（圆顶）
      g.fillStyle = '#7fb0d8'; rr(g, x + 44, 250, 58, 54, 8); g.fill();
      var iwg = g.createLinearGradient(0, 254, 0, 300);
      iwg.addColorStop(0, '#fff0c4'); iwg.addColorStop(1, '#f6c86a');
      g.fillStyle = iwg; rr(g, x + 49, 255, 48, 44, 6); g.fill();
      g.fillStyle = '#7fb0d8'; g.fillRect(x + 71, 255, 4, 44); g.fillRect(x + 49, 276, 48, 4);
      // 冰门
      g.fillStyle = '#dff0fb';
      g.beginPath(); g.moveTo(x + 150, SY); g.lineTo(x + 150, 330); g.arc(x + 176, 330, 26, Math.PI, 0); g.lineTo(x + 202, SY); g.closePath(); g.fill();
      g.strokeStyle = '#8fc0e4'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 150, SY); g.lineTo(x + 150, 330); g.arc(x + 176, 330, 26, Math.PI, 0); g.lineTo(x + 202, SY); g.stroke();
      g.fillStyle = '#8fc0e4'; ell(g, x + 194, 396, 2.6, 2.6); g.fill();
      // 冰招牌
      g.fillStyle = 'rgba(210,235,250,0.92)'; rr(g, x + 128, 214, 64, 28, 6); g.fill();
      g.strokeStyle = '#7fb0d8'; g.lineWidth = 2; rr(g, x + 128, 214, 64, 28, 6); g.stroke();
      g.font = 'bold 15px "Arial", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#3a78a8'; g.fillText('ICE', x + 160, 229);
    }

    // —— 雪松 ——
    function drawPine(g, x, sc) {
      shadowEllipse(g, x, SY - 2, 26 * sc, 6);
      g.fillStyle = '#6a4a34'; g.fillRect(x - 5 * sc, SY - 24 * sc, 10 * sc, 24 * sc);
      var tiers = [[-70, 66], [-46, 54], [-22, 42]]; // y偏移，层宽
      for (var t = 0; t < tiers.length; t++) {
        var ty = SY + tiers[t][0] * sc, tw = tiers[t][1] * sc, th = 34 * sc;
        g.fillStyle = '#2f6b52';
        g.beginPath(); g.moveTo(x - tw / 2, ty); g.lineTo(x, ty - th); g.lineTo(x + tw / 2, ty); g.closePath(); g.fill();
        // 层顶积雪
        g.fillStyle = '#f2f8ff';
        g.beginPath();
        g.moveTo(x - tw / 2 + tw * 0.22, ty - th * 0.42);
        g.lineTo(x, ty - th);
        g.lineTo(x + tw / 2 - tw * 0.22, ty - th * 0.42);
        g.lineTo(x + tw / 2 - tw * 0.30, ty - th * 0.30);
        g.lineTo(x, ty - th * 0.62);
        g.lineTo(x - tw / 2 + tw * 0.30, ty - th * 0.30);
        g.closePath(); g.fill();
      }
    }

    // —— 雪人 ——
    function drawSnowman(g, x) {
      shadowEllipse(g, x, SY - 2, 26, 6);
      g.fillStyle = '#f6fbff';
      ell(g, x, SY - 20, 20, 18); g.fill();
      ell(g, x, SY - 48, 15, 14); g.fill();
      ell(g, x, SY - 72, 10.5, 10); g.fill();
      g.fillStyle = '#c9dcef';
      ell(g, x, SY - 14, 20, 8); g.fill();
      g.fillStyle = '#f6fbff';
      ell(g, x, SY - 22, 17, 10); g.fill();
      // 围巾
      g.fillStyle = '#e05656';
      g.fillRect(x - 14, SY - 60, 28, 7);
      g.fillRect(x + 6, SY - 56, 6, 16);
      // 脸
      g.fillStyle = '#2e3440';
      ell(g, x - 4, SY - 75, 1.6, 1.6); g.fill();
      ell(g, x + 4, SY - 75, 1.6, 1.6); g.fill();
      g.fillStyle = '#f28a3a';
      g.beginPath(); g.moveTo(x - 1, SY - 71); g.lineTo(x + 9, SY - 69); g.lineTo(x - 1, SY - 67); g.closePath(); g.fill();
      // 扣子
      g.fillStyle = '#2e3440';
      ell(g, x, SY - 46, 1.8, 1.8); g.fill();
      ell(g, x, SY - 38, 1.8, 1.8); g.fill();
      // 树枝手
      g.strokeStyle = '#6a4a34'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 14, SY - 48); g.lineTo(x - 26, SY - 58); g.moveTo(x - 22, SY - 54); g.lineTo(x - 28, SY - 52);
      g.moveTo(x + 14, SY - 48); g.lineTo(x + 26, SY - 58); g.moveTo(x + 22, SY - 54); g.lineTo(x + 28, SY - 52);
      g.stroke();
    }

    // —— 雪帽路灯 ——
    function drawLampSnow(g, x) {
      shadowEllipse(g, x, SY - 2, 15, 4);
      g.fillStyle = '#2f3a4a';
      g.fillRect(x - 2, SY - 100, 4, 98);
      g.fillRect(x - 8, SY - 4, 16, 5);
      g.beginPath();
      g.moveTo(x, SY - 98);
      g.quadraticCurveTo(x + 2, SY - 112, x + 16, SY - 110);
      g.strokeStyle = '#2f3a4a'; g.lineWidth = 4; g.stroke();
      var hg = g.createRadialGradient(x + 20, SY - 108, 2, x + 20, SY - 108, 24);
      hg.addColorStop(0, 'rgba(255,223,154,0.55)'); hg.addColorStop(1, 'rgba(255,223,154,0)');
      g.fillStyle = hg; g.fillRect(x - 4, SY - 132, 48, 48);
      g.fillStyle = '#ffdf9a'; ell(g, x + 20, SY - 108, 6.5, 6.5); g.fill();
      g.fillStyle = '#2f3a4a'; g.fillRect(x + 12, SY - 116, 16, 4);
      snowBar(g, x + 10, SY - 121, 20, 6, 'up');
    }

    // —— 小企鹅「行人」 ——
    function peng(g, x, yFeet, s) {
      shadowEllipse(g, x, yFeet - 1, 9 * s, 3);
      g.fillStyle = '#f28a3a';
      ell(g, x - 4 * s, yFeet - 1, 4 * s, 2.2 * s); g.fill();
      ell(g, x + 4 * s, yFeet - 1, 4 * s, 2.2 * s); g.fill();
      g.fillStyle = '#2e3440';
      ell(g, x, yFeet - 14 * s, 8 * s, 13 * s); g.fill();
      g.fillStyle = '#f6fbff';
      ell(g, x, yFeet - 12 * s, 5 * s, 9 * s); g.fill();
      g.fillStyle = '#f28a3a';
      g.beginPath(); g.moveTo(x + 5 * s, yFeet - 20 * s); g.lineTo(x + 10 * s, yFeet - 18.5 * s); g.lineTo(x + 5 * s, yFeet - 17 * s); g.closePath(); g.fill();
      g.fillStyle = '#fff';
      ell(g, x + 3.4 * s, yFeet - 21 * s, 1.6 * s, 1.8 * s); g.fill();
      g.fillStyle = '#2e3440';
      ell(g, x + 3.8 * s, yFeet - 21 * s, 0.8 * s, 0.9 * s); g.fill();
    }

    return c;
  }

  // —— 雪地地面（雪面人行道 + 结冰马路） ——
  var snowGroundTile = (function () {
    var c = mkCanvas(W, GROUND);
    var g = c.getContext('2d');
    var roadY = 34;
    // 雪面
    g.fillStyle = '#e7f0fa'; g.fillRect(0, 0, W, roadY);
    g.fillStyle = '#f6fbff';
    for (var x = -20; x < W + 20; x += 46) {
      g.beginPath(); g.ellipse(x + 23, 3, 26, 7, 0, Math.PI, 0); g.fill();
    }
    g.fillStyle = '#c6d9ee';
    for (var tx = 0; tx < W; tx += 42) g.fillRect(tx, 6, 2, 22);
    g.fillStyle = '#9fbdd9'; g.fillRect(0, roadY - 4, W, 4);
    // 结冰马路
    g.fillStyle = '#43536e'; g.fillRect(0, roadY, W, GROUND - roadY);
    g.fillStyle = '#56698a'; g.fillRect(0, roadY + 3, W, 2);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.save(); g.rotate(-0.35);
    g.fillRect(-40, 480, 60, 7); g.fillRect(140, 500, 90, 7); g.fillRect(360, 470, 70, 7);
    g.restore();
    g.strokeStyle = 'rgba(220,234,250,0.5)'; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(20, 62); g.lineTo(48, 58); g.lineTo(70, 64);
    g.moveTo(200, 70); g.lineTo(240, 64); g.lineTo(280, 70);
    g.stroke();
    g.fillStyle = '#dceafa';
    for (var d = 0; d < W; d += 52) g.fillRect(d, 56, 26, 5);
    return c;
  })();

  // —— 冰砖障碍（6 种冻物变体，64x52） ——
  var ICE_W = 64, ICE_H = 52;
  var iceVariants = (function () {
    var painters = [
      // 1 冻鱼
      function (g) {
        g.fillStyle = '#ff9a3d';
        ell(g, 30, 30, 13, 8); g.fill();
        g.beginPath(); g.moveTo(16, 30); g.lineTo(8, 23); g.lineTo(8, 37); g.closePath(); g.fill();
        g.fillStyle = '#ffc878'; ell(g, 30, 33, 9, 4); g.fill();
        g.fillStyle = '#3a3f4a'; ell(g, 40, 27.5, 2, 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; ell(g, 39.5, 27, 0.7, 0.7); g.fill();
      },
      // 2 雪花
      function (g) {
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.6; g.lineCap = 'round';
        var cx = 32, cy = 28;
        for (var a = 0; a < 3; a++) {
          var ang = a * Math.PI / 3;
          var dx = Math.cos(ang) * 11, dy = Math.sin(ang) * 11;
          g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
        }
        g.lineWidth = 1.8;
        for (var b = 0; b < 6; b++) {
          var a2 = b * Math.PI / 3;
          var bx = cx + Math.cos(a2) * 8, by = cy + Math.sin(a2) * 8;
          g.beginPath();
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(a2 + 0.6) * 4, by + Math.sin(a2 + 0.6) * 4);
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(a2 - 0.6) * 4, by + Math.sin(a2 - 0.6) * 4);
          g.stroke();
        }
        g.fillStyle = '#fff'; ell(g, cx, cy, 2.2, 2.2); g.fill();
      },
      // 3 冻星星
      function (g) {
        g.fillStyle = '#ffd95a';
        g.beginPath();
        for (var i = 0; i < 8; i++) {
          var r = i % 2 === 0 ? 12 : 4.6;
          var a = i * Math.PI / 4 - Math.PI / 2;
          g[i === 0 ? 'moveTo' : 'lineTo'](32 + Math.cos(a) * r, 27 + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
        g.fillStyle = '#fff3c8'; ell(g, 29, 24, 2.4, 2.4); g.fill();
      },
      // 4 爱心冰
      function (g) {
        g.fillStyle = '#ff8ab8';
        ell(g, 26, 26, 7.5, 7); g.fill();
        ell(g, 37, 26, 7.5, 7); g.fill();
        g.beginPath(); g.moveTo(19, 29); g.lineTo(32, 42); g.lineTo(45, 29); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.65)'; ell(g, 24, 23.5, 2.2, 2.2); g.fill();
      },
      // 5 气泡
      function (g) {
        var bs = [[20, 35, 5], [35, 27, 7], [47, 38, 3.6]];
        for (var i = 0; i < bs.length; i++) {
          g.fillStyle = 'rgba(255,255,255,0.75)';
          ell(g, bs[i][0], bs[i][1], bs[i][2], bs[i][2]); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          ell(g, bs[i][0] - bs[i][2] * 0.3, bs[i][1] - bs[i][2] * 0.35, bs[i][2] * 0.28, bs[i][2] * 0.28); g.fill();
        }
      },
      // 6 极光冻块
      function (g) {
        var cols = ['#5fe6a8', '#54c8e8', '#b07ae8'];
        for (var i = 0; i < 3; i++) {
          g.strokeStyle = cols[i]; g.globalAlpha = 0.55; g.lineWidth = 5; g.lineCap = 'round';
          g.beginPath();
          for (var x = -2; x <= ICE_W + 2; x += 8) {
            var y = 20 + i * 9 + Math.sin(x * 0.12 + i * 2) * 4;
            if (x === -2) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    ];
    return painters.map(function (paint) {
      var c = mkCanvas(ICE_W, ICE_H);
      var g = c.getContext('2d');
      var gr = g.createLinearGradient(0, 0, 0, ICE_H);
      gr.addColorStop(0, '#dff1fd'); gr.addColorStop(1, '#a9d4f2');
      rr(g, 0.5, 0.5, ICE_W - 1, ICE_H - 1, 6);
      g.fillStyle = gr; g.fill();
      // 冻物内容
      g.save();
      rr(g, 3, 9, ICE_W - 6, ICE_H - 12, 5); g.clip();
      paint(g);
      g.restore();
      // 斜向冰面高光
      g.save();
      rr(g, 0.5, 0.5, ICE_W - 1, ICE_H - 1, 6); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.save(); g.rotate(-0.5);
      g.fillRect(22, -20, 8, 90); g.fillRect(36, -20, 3.5, 90);
      g.restore();
      g.restore();
      // 顶部积雪
      snowBar(g, -1, 0, ICE_W + 2, 5, 'up');
      g.fillStyle = '#9ec7ea'; g.fillRect(2, 8, ICE_W - 4, 1.6);
      // 霜边
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2;
      rr(g, 1, 1, ICE_W - 2, ICE_H - 2, 6); g.stroke();
      g.strokeStyle = 'rgba(90,140,190,0.6)'; g.lineWidth = 1.2;
      rr(g, 0.5, 0.5, ICE_W - 1, ICE_H - 1, 6); g.stroke();
      // 底影
      g.fillStyle = 'rgba(46,70,110,0.35)';
      g.fillRect(2, ICE_H - 4, ICE_W - 4, 3);
      return c;
    });
  })();

  // —— 雪镇拖尾光斑（冷色调，替换街区的粉色） ——
  var trailSnowSpr = (function () {
    var c = mkCanvas(28, 28);
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(14, 14, 1, 14, 14, 13);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(170,215,255,0.5)');
    gr.addColorStop(1, 'rgba(170,215,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 28, 28);
    return c;
  })();

  // =====================================================================
  //   地图③「杭州夜航」美术资产
  //   四段式夜景旅程：西湖(0-1200) → 西湖城区(1200-2400) → 钱塘江(2400-3600) → 钱江新城(3600-4800)
  //   中景段 1200x480（×4）；远景段 540x480（×4，0.45x 视差与中景同步换段）；
  //   旅程结束后进入 840 宽「钱江新城核心区」无缝循环带（跨缝塔保证接缝连续）
  // =====================================================================

  function hzStage() {
    return Math.min(3, Math.floor(hz.jx / HZ_SEG_W));
  }

  // —— 夜空天空（渐变 + 星星 + 月亮 + 地平线城市微光） ——
  var hzSkyTile = (function () {
    var c = mkCanvas(W, H - GROUND);
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, H - GROUND);
    grad.addColorStop(0, '#060a24');
    grad.addColorStop(0.45, '#0d1738');
    grad.addColorStop(0.8, '#16264a');
    grad.addColorStop(1, '#1e3a5e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H - GROUND);
    // 地平线城市微光
    var hg = g.createLinearGradient(0, H - GROUND - 90, 0, H - GROUND);
    hg.addColorStop(0, 'rgba(255,170,80,0)');
    hg.addColorStop(1, 'rgba(255,170,80,0.10)');
    g.fillStyle = hg; g.fillRect(0, H - GROUND - 90, W, 90);
    // 星星
    for (var i = 0; i < 66; i++) {
      var sx = Math.random() * W, sy = Math.random() * 290, sr = 0.6 + Math.random() * 0.9;
      g.globalAlpha = 0.22 + 0.6 * ((i * 37) % 10) / 10;
      g.fillStyle = '#dfe8ff';
      g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
    }
    for (var i2 = 0; i2 < 10; i2++) {
      g.globalAlpha = 0.3;
      g.fillStyle = '#c8d8f4';
      g.fillRect(Math.random() * W, 300 + Math.random() * 110, 1.6, 1.6);
    }
    g.globalAlpha = 1;
    // 月亮
    var mg = g.createRadialGradient(352, 66, 10, 352, 66, 72);
    mg.addColorStop(0, 'rgba(240,246,255,0.9)');
    mg.addColorStop(0.35, 'rgba(220,235,255,0.28)');
    mg.addColorStop(1, 'rgba(220,235,255,0)');
    g.fillStyle = mg; g.fillRect(280, -6, 144, 144);
    g.fillStyle = '#eef4ff';
    ell(g, 352, 66, 19, 19); g.fill();
    g.fillStyle = '#ccd8ec';
    ell(g, 346, 60, 3.4, 3.4); g.fill();
    ell(g, 359, 70, 2.6, 2.6); g.fill();
    ell(g, 352, 76, 2, 2); g.fill();
    ell(g, 344, 74, 1.4, 1.4); g.fill();
    return c;
  })();

  // —— 山体剪影 ——
  function hzMountain(g, color, pts) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(pts[0][0], H - GROUND);
    for (var i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[pts.length - 1][0], H - GROUND);
    g.closePath(); g.fill();
  }

  // —— 保俶塔（细石塔剪影，宝石山上） ——
  function hzBaochu(g, x, yBase, h) {
    g.fillStyle = '#141e3a';
    g.beginPath();
    g.moveTo(x - h * 0.10, yBase);
    g.lineTo(x - h * 0.055, yBase - h * 0.72);
    g.lineTo(x - h * 0.026, yBase - h * 0.82);
    g.lineTo(x + h * 0.026, yBase - h * 0.82);
    g.lineTo(x + h * 0.055, yBase - h * 0.72);
    g.lineTo(x + h * 0.10, yBase);
    g.closePath(); g.fill();
    g.fillStyle = '#101a34';
    g.beginPath();
    g.moveTo(x - h * 0.062, yBase - h * 0.8);
    g.lineTo(x + h * 0.062, yBase - h * 0.8);
    g.lineTo(x, yBase - h * 0.96);
    g.closePath(); g.fill();
    for (var t = 1; t <= 3; t++) {
      var yy = yBase - h * (0.16 + t * 0.16);
      var ww = h * (0.075 + t * 0.014);
      g.fillRect(x - ww, yy, ww * 2, h * 0.022);
    }
  }

  // —— 雷峰塔（五层砖塔剪影 + 暖灯窗 + 顶层光晕），杭州第一地标 ——
  function hzLeifeng(g, x, yBase, h) {
    var tiers = [0.62, 0.52, 0.44, 0.36, 0.28];
    var bw = h * 0.42;
    for (var t = 0; t < 5; t++) {
      var w = bw * tiers[t];
      var yTop = yBase - h * (0.16 + t * 0.16);
      g.fillStyle = t % 2 ? '#1a2444' : '#172040';
      g.fillRect(x - w / 2, yTop, w, h * 0.16);
      var eaveW = w * 1.18;
      g.fillStyle = '#101a34';
      g.beginPath();
      g.moveTo(x - eaveW / 2, yTop - 2);
      g.lineTo(x - eaveW / 2 + 8, yTop - 6);
      g.lineTo(x - w / 2, yTop + 3);
      g.lineTo(x + w / 2, yTop + 3);
      g.lineTo(x + eaveW / 2 - 8, yTop - 6);
      g.lineTo(x + eaveW / 2, yTop - 2);
      g.closePath(); g.fill();
      if (t < 4) {
        g.fillStyle = 'rgba(255,206,120,0.85)';
        g.fillRect(x - 4, yTop + 5, 8, 5);
      }
    }
    g.fillStyle = '#101a34';
    g.fillRect(x - bw * 0.72, yBase - 4, bw * 1.44, 6);
    var tg = g.createRadialGradient(x, yBase - h * 0.88, 2, x, yBase - h * 0.88, 28);
    tg.addColorStop(0, 'rgba(255,214,130,0.5)');
    tg.addColorStop(1, 'rgba(255,214,130,0)');
    g.fillStyle = tg;
    g.fillRect(x - 28, yBase - h - 8, 56, 44);
    g.fillStyle = '#e8d8a8';
    g.fillRect(x - 1.5, yBase - h - 9, 3, 9);
  }

  // 远景无缝塔（旅程末段与循环带共用同一塔形，保证接缝连续）
  var hzFarEdge = (function () {
    var fc = mkCanvas(60, 200);
    var fg = fc.getContext('2d');
    fg.fillStyle = '#1c2c50';
    fg.fillRect(10, 60, 40, 140);
    fg.fillStyle = '#162244';
    fg.fillRect(44, 60, 6, 140);
    fg.fillRect(27, 40, 3, 20);
    fg.fillStyle = 'rgba(255,205,120,0.5)';
    for (var yy = 72; yy < 190; yy += 13) fg.fillRect(18, yy, 5, 4);
    return fc;
  })();

  // —— 远景段（每段 540 宽；段序对应四阶段） ——
  function hzFarSeg(k) {
    var c = mkCanvas(HZ_FAR_SEG_W, H - GROUND);
    var g = c.getContext('2d');
    if (k === 0) {
      // 西湖群山：后层山 + 夕照山（雷峰塔） + 宝石山（保俶塔）
      hzMountain(g, '#16244a', [[-20, 305], [80, 212], [170, 262], [250, 192], [330, 252], [420, 208], [560, 305]]);
      hzMountain(g, '#1d2f55', [[-30, 345], [90, 262], [180, 312], [280, 238], [360, 300], [470, 244], [580, 355]]);
      hzBaochu(g, 150, 250, 88);
      hzLeifeng(g, 500, 248, 152);
    } else if (k === 1) {
      // 城区远景：连绵屋顶轮廓 + 零星暖窗
      var roofs = [[-10, 300, 96, 30], [60, 278, 84, 26], [120, 310, 100, 34], [200, 286, 72, 24], [250, 306, 108, 30], [340, 274, 92, 26], [410, 302, 82, 30], [470, 284, 92, 28]];
      for (var i = 0; i < roofs.length; i++) {
        var r = roofs[i];
        g.fillStyle = '#182644';
        g.fillRect(r[0], r[1], r[2], r[3]);
        g.fillStyle = '#141c36';
        g.beginPath();
        g.moveTo(r[0] - 4, r[1]);
        g.lineTo(r[0] + r[2] / 2, r[1] - 12);
        g.lineTo(r[0] + r[2] + 4, r[1]);
        g.closePath(); g.fill();
        if (i % 2 === 0) {
          g.fillStyle = 'rgba(255,200,110,0.5)';
          g.fillRect(r[0] + r[2] * 0.3, r[1] + 8, 7, 6);
          g.fillRect(r[0] + r[2] * 0.65, r[1] + 16, 6, 5);
        }
      }
    } else if (k === 2) {
      // 江对岸：中低层城市轮廓
      var blocks = [[-10, 280, 90, 30], [70, 258, 70, 24], [130, 288, 96, 28], [220, 264, 80, 26], [290, 284, 70, 24], [350, 256, 84, 26], [420, 278, 80, 26], [486, 258, 70, 26]];
      for (var i2 = 0; i2 < blocks.length; i2++) {
        var b = blocks[i2];
        g.fillStyle = '#1a2a4c';
        g.fillRect(b[0], b[1], b[2], b[3]);
        if (i2 % 2 === 0) {
          g.fillStyle = 'rgba(255,205,120,0.55)';
          g.fillRect(b[0] + b[2] * 0.35, b[1] + 8, 6, 5);
          g.fillRect(b[0] + b[2] * 0.6, b[1] + 16, 6, 5);
        }
      }
    } else {
      // 钱江新城天际线：高层剪影 + 杭州之门式双子塔
      var towers = [[-10, 232, 34, 110], [26, 208, 40, 134], [84, 222, 36, 120], [150, 196, 42, 146], [214, 226, 38, 116], [280, 200, 44, 142], [460, 230, 36, 112]];
      for (var i3 = 0; i3 < towers.length; i3++) {
        var tv = towers[i3];
        g.fillStyle = '#1c2c50';
        g.fillRect(tv[0], tv[1], tv[2], tv[3]);
        g.fillStyle = '#162244';
        g.fillRect(tv[0] + tv[2] - 3, tv[1], 3, tv[3]);
        g.fillRect(tv[0] + tv[2] / 2 - 1, tv[1] - 10, 2, 10);
        if (i3 % 2 === 0) {
          g.fillStyle = 'rgba(255,205,120,0.5)';
          for (var wy = tv[1] + 8; wy < tv[1] + tv[3] - 6; wy += 12) g.fillRect(tv[0] + tv[2] * 0.3, wy, 5, 4);
        }
      }
      // 杭州之门（双子塔 + 顶部拱形连接 + 灯光带）
      var hx = 330;
      g.fillStyle = '#20325a';
      g.beginPath(); g.moveTo(hx, 300); g.lineTo(hx + 20, 300); g.lineTo(hx + 24, 110); g.lineTo(hx + 2, 110); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(hx + 46, 300); g.lineTo(hx + 66, 300); g.lineTo(hx + 62, 110); g.lineTo(hx + 40, 110); g.closePath(); g.fill();
      g.fillStyle = '#263a68';
      g.fillRect(hx + 2, 102, 62, 10);
      g.fillStyle = 'rgba(255,214,140,0.6)';
      g.fillRect(hx + 4, 118, 58, 2);
      // 右缘跨缝塔（与循环带共用）
      g.drawImage(hzFarEdge, 510, 120);
    }
    return c;
  }
  var hzFarSegs = [hzFarSeg(0), hzFarSeg(1), hzFarSeg(2), hzFarSeg(3)];

  // —— 水面（段内水面 + 波光） ——
  function hzWater(g, waterTop) {
    var grad = g.createLinearGradient(0, waterTop, 0, H - GROUND);
    grad.addColorStop(0, '#0b1834');
    grad.addColorStop(0.6, '#0e1e3e');
    grad.addColorStop(1, '#142a4e');
    g.fillStyle = grad;
    g.fillRect(0, waterTop, HZ_SEG_W, H - GROUND - waterTop);
    g.strokeStyle = 'rgba(120,165,220,0.14)';
    g.lineWidth = 1;
    for (var y = waterTop + 6; y < H - GROUND - 2; y += 11) {
      var off = (y * 7) % 42;
      g.beginPath();
      for (var x = off - 80; x < HZ_SEG_W + 60; x += 92) {
        g.moveTo(x, y); g.lineTo(x + 26, y);
      }
      g.stroke();
    }
  }

  // —— 白墙黛瓦江南屋 ——
  function hzJiangnanHouse(g, x, yBase) {
    var h = 92;
    g.fillStyle = '#3a4a6a';
    g.fillRect(x, yBase - h, 100, h);
    g.fillStyle = '#2c3a58';
    g.fillRect(x + 94, yBase - h, 6, h);
    g.fillStyle = '#101a34';
    g.beginPath();
    g.moveTo(x - 12, yBase - h);
    g.lineTo(x + 50, yBase - h - 26);
    g.lineTo(x + 112, yBase - h);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x - 12, yBase - h); g.lineTo(x - 17, yBase - h - 7); g.lineTo(x - 4, yBase - h + 2);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x + 112, yBase - h); g.lineTo(x + 117, yBase - h - 7); g.lineTo(x + 104, yBase - h + 2);
    g.closePath(); g.fill();
    // 暖窗
    g.fillStyle = 'rgba(255,200,110,0.85)';
    g.fillRect(x + 14, yBase - h + 24, 22, 26);
    g.fillRect(x + 52, yBase - h + 24, 22, 26);
    g.fillStyle = '#101a34';
    g.fillRect(x + 14, yBase - h + 36, 22, 2);
    g.fillRect(x + 24, yBase - h + 24, 2, 26);
    g.fillRect(x + 52, yBase - h + 36, 22, 2);
    g.fillRect(x + 62, yBase - h + 24, 2, 26);
    g.fillStyle = '#0e1830';
    g.fillRect(x + 84, yBase - 40, 12, 40);
  }

  // —— 亭子 ——
  function hzPavilion(g, x, yBase) {
    g.fillStyle = '#23304e';
    g.fillRect(x - 2, yBase - 46, 4, 46);
    g.fillRect(x + 18, yBase - 46, 4, 46);
    g.fillStyle = '#101a34';
    g.beginPath();
    g.moveTo(x - 22, yBase - 46);
    g.lineTo(x + 10, yBase - 74);
    g.lineTo(x + 42, yBase - 46);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x - 14, yBase - 64);
    g.lineTo(x + 10, yBase - 82);
    g.lineTo(x + 34, yBase - 64);
    g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - 22, yBase - 46); g.lineTo(x - 27, yBase - 52); g.lineTo(x - 13, yBase - 48); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + 42, yBase - 46); g.lineTo(x + 47, yBase - 52); g.lineTo(x + 33, yBase - 48); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,200,110,0.75)';
    g.fillRect(x + 4, yBase - 40, 12, 16);
    g.fillStyle = '#1b2c4e';
    g.fillRect(x - 10, yBase - 4, 40, 6);
  }

  // —— 垂柳（西湖标志） ——
  function hzWillow(g, x, yBase, sc) {
    g.fillStyle = '#2a3a44';
    g.fillRect(x - 2 * sc, yBase - 34 * sc, 4 * sc, 34 * sc);
    g.strokeStyle = '#1e3a3e';
    g.lineWidth = 1.4 * sc;
    g.beginPath();
    for (var i = 0; i < 7; i++) {
      var ax = x + (i - 3) * 7 * sc;
      g.moveTo(ax, yBase - 32 * sc);
      g.quadraticCurveTo(ax + (i - 3) * 3 * sc, yBase - 12 * sc, ax + (i - 3) * 4.5 * sc, yBase + 6 * sc);
    }
    g.stroke();
    g.fillStyle = 'rgba(96,150,120,0.6)';
    for (var j = 0; j < 18; j++) {
      g.fillRect(x + (Math.random() * 44 - 22) * sc, yBase - 30 * sc + Math.random() * 36 * sc, 2, 3);
    }
    g.fillStyle = '#35505a';
    g.fillRect(x, yBase - 32 * sc, 1.5 * sc, 30 * sc);
  }

  // —— 石拱桥（跨水小桥） ——
  function hzStoneBridge(g, x, waterTop) {
    g.fillStyle = '#33446a';
    g.beginPath();
    g.moveTo(x, waterTop + 34);
    g.quadraticCurveTo(x + 40, waterTop + 6, x + 80, waterTop + 34);
    g.lineTo(x + 80, waterTop + 46);
    g.quadraticCurveTo(x + 40, waterTop + 18, x, waterTop + 46);
    g.closePath(); g.fill();
    g.strokeStyle = '#3d4f78';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, waterTop + 30); g.quadraticCurveTo(x + 40, waterTop + 2, x + 80, waterTop + 30); g.stroke();
    g.fillStyle = 'rgba(255,206,120,0.9)';
    g.fillRect(x + 36, waterTop + 10, 3, 4);
    g.fillRect(x + 44, waterTop + 12, 3, 4);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(x + 40, waterTop + 46, 30, 6, 0, 0, Math.PI * 2); g.fill();
  }

  // —— 湖边路灯 ——
  function hzLamp(g, x, yBase) {
    g.fillStyle = '#22304a';
    g.fillRect(x - 2, yBase - 66, 4, 66);
    g.strokeStyle = '#22304a';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(x, yBase - 64);
    g.quadraticCurveTo(x + 2, yBase - 76, x + 12, yBase - 74);
    g.stroke();
    var hg = g.createRadialGradient(x + 15, yBase - 72, 2, x + 15, yBase - 72, 18);
    hg.addColorStop(0, 'rgba(255,214,140,0.5)');
    hg.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = hg;
    g.fillRect(x - 6, yBase - 92, 42, 42);
    g.fillStyle = '#ffd98e';
    ell(g, x + 15, yBase - 72, 5.5, 5.5); g.fill();
  }

  // —— 西湖小舟（渔灯） ——
  function hzBoat(g, x, y) {
    g.fillStyle = '#0e1830';
    g.beginPath();
    g.moveTo(x - 16, y); g.quadraticCurveTo(x, y + 7, x + 16, y);
    g.lineTo(x + 10, y - 8); g.lineTo(x - 10, y - 8);
    g.closePath(); g.fill();
    g.fillStyle = '#0c1428';
    g.beginPath(); g.arc(x - 2, y - 13, 3.5, 0, 7); g.fill();
    var lg = g.createRadialGradient(x + 6, y - 14, 1, x + 6, y - 14, 12);
    lg.addColorStop(0, 'rgba(255,190,90,0.85)');
    lg.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = lg;
    g.fillRect(x - 8, y - 28, 28, 28);
    g.fillStyle = '#ffbe5a';
    g.fillRect(x + 5, y - 15, 3, 4);
    g.fillStyle = 'rgba(255,190,90,0.15)';
    g.fillRect(x - 4, y + 7, 8, 18);
  }

  // —— 荷叶 ——
  function hzLotus(g, x, y) {
    g.fillStyle = 'rgba(46,96,74,0.5)';
    g.beginPath(); g.ellipse(x, y, 10, 3.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(56,110,84,0.5)';
    g.beginPath(); g.ellipse(x + 3, y - 1.5, 8, 3, 0, 0, Math.PI * 2); g.fill();
  }

  // —— 现代多层楼（暖窗网格 + 底商） ——
  function hzCityHouse(g, x, yBase, h, floors) {
    g.fillStyle = '#1e2c4c';
    g.fillRect(x, yBase - h, 90, h);
    g.fillStyle = '#182644';
    g.fillRect(x + 84, yBase - h, 6, h);
    g.fillRect(x, yBase - h - 6, 90, 6);
    g.fillStyle = '#141c36';
    g.fillRect(x + 60, yBase - h - 16, 18, 10);
    var fh = Math.floor(h / floors);
    for (var f = 0; f < floors; f++) {
      for (var wx = 0; wx < 4; wx++) {
        var xx = x + 10 + wx * 18, yy = yBase - h + 10 + f * fh + 4;
        var on = ((xx * 13 + yy * 7) % 11) < 4;
        g.fillStyle = on ? 'rgba(255,200,110,' + (0.45 + ((xx % 3) * 0.15)) + ')' : '#0c1428';
        g.fillRect(xx, yy, 10, fh - 12);
      }
    }
    g.fillStyle = '#101a34';
    g.fillRect(x + 6, yBase - 26, 78, 20);
    g.fillStyle = 'rgba(255,160,90,0.8)';
    g.fillRect(x + 10, yBase - 22, 70, 3);
  }

  // —— 城区行道树 ——
  function hzTree(g, x, yBase) {
    g.fillStyle = '#2a3a44';
    g.fillRect(x - 2, yBase - 30, 4, 30);
    g.fillStyle = '#203a3c';
    ell(g, x, yBase - 42, 14, 12); g.fill();
    ell(g, x - 10, yBase - 36, 9, 8); g.fill();
    ell(g, x + 10, yBase - 36, 9, 8); g.fill();
  }

  // —— 暖光小招牌 ——
  function hzSign(g, x, yBase) {
    g.fillStyle = '#141c36';
    g.fillRect(x + 46, yBase - 48, 4, 26);
    g.fillStyle = '#2a3858';
    g.fillRect(x, yBase - 60, 60, 20);
    var lg = g.createRadialGradient(x + 30, yBase - 50, 2, x + 30, yBase - 50, 26);
    lg.addColorStop(0, 'rgba(255,200,120,0.35)');
    lg.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = lg; g.fillRect(x - 16, yBase - 76, 92, 52);
    g.fillStyle = 'rgba(255,214,140,0.9)';
    g.fillRect(x + 6, yBase - 56, 48, 12);
  }

  // —— 红灯笼 ——
  function hzLantern(g, x, yBase) {
    g.fillStyle = '#1a2438';
    g.fillRect(x - 1, yBase - 26, 2, 26);
    g.fillStyle = '#d84a4a';
    ell(g, x, yBase - 34, 6, 8); g.fill();
    g.fillStyle = '#f27a6a';
    ell(g, x, yBase - 36, 2.4, 2.4); g.fill();
    var lg = g.createRadialGradient(x, yBase - 34, 1, x, yBase - 34, 12);
    lg.addColorStop(0, 'rgba(255,150,110,0.5)');
    lg.addColorStop(1, 'rgba(255,150,110,0)');
    g.fillStyle = lg; g.fillRect(x - 12, yBase - 46, 24, 24);
  }

  // —— 钱塘江斜拉桥（A 形主塔 + 桥面 + 扇面索） ——
  function hzCableBridge(g, x1, x2, deckY) {
    g.fillStyle = '#22304e';
    g.fillRect(x1, deckY, x2 - x1, 8);
    g.fillStyle = '#2c3c5e';
    g.fillRect(x1, deckY - 2, x2 - x1, 3);
    g.fillStyle = 'rgba(255,214,140,0.75)';
    for (var x = x1 + 14; x < x2 - 8; x += 34) g.fillRect(x, deckY - 3, 3, 3);
    function pylon(cx) {
      g.fillStyle = '#182644';
      g.beginPath();
      g.moveTo(cx - 26, H - GROUND);
      g.lineTo(cx - 6, deckY - 88);
      g.lineTo(cx + 6, deckY - 88);
      g.lineTo(cx + 26, H - GROUND);
      g.closePath(); g.fill();
      g.fillRect(cx - 12, deckY - 100, 24, 14);
      g.fillStyle = '#ff5a5a';
      g.fillRect(cx - 1, deckY - 106, 3, 4);
    }
    pylon(x1 + 70);
    pylon(x2 - 70);
    g.strokeStyle = 'rgba(180,200,230,0.35)';
    g.lineWidth = 1.2;
    for (var t = 0; t < 5; t++) {
      var dx = 30 + t * 26;
      for (var s = -1; s <= 1; s += 2) {
        var bx = s === -1 ? x1 + 70 : x2 - 70;
        g.beginPath();
        g.moveTo(bx, deckY - 100);
        g.lineTo(bx + dx * s, deckY);
        g.stroke();
        g.beginPath();
        g.moveTo(bx, deckY - 100);
        g.lineTo(bx - dx, deckY);
        g.stroke();
      }
    }
    g.fillStyle = '#14203e';
    g.fillRect(x1 + 60, deckY + 8, 20, H - GROUND - deckY - 8);
    g.fillRect(x2 - 80, deckY + 8, 20, H - GROUND - deckY - 8);
    g.fillRect(x1 + 40, 340, 10, 140);
    g.fillRect(x2 - 50, 340, 10, 140);
  }

  // —— 现代高楼（玻璃幕墙 + 亮窗 + 天线） ——
  function hzTower(g, x, yBase, h, cols) {
    var w = 90;
    g.fillStyle = '#1a2848';
    g.fillRect(x, yBase - h, w, h);
    g.fillStyle = '#162244';
    g.fillRect(x + w - 6, yBase - h, 6, h);
    var rows = Math.round(h / 16);
    for (var r = 0; r < rows; r++) {
      for (var cc = 0; cc < cols; cc++) {
        var xx = x + 6 + cc * ((w - 12) / cols), yy = yBase - h + 6 + r * 14;
        var on = ((xx * 17 + yy * 11) % 13) < 5;
        g.fillStyle = on ? 'rgba(255,205,120,' + (0.4 + ((xx % 4) * 0.12)) + ')' : 'rgba(140,190,230,0.16)';
        g.fillRect(xx, yy, (w - 12) / cols - 3, 7);
      }
    }
    g.fillStyle = '#0e1830';
    g.fillRect(x + w / 2 - 1.5, yBase - h - 18, 3, 18);
    g.fillStyle = '#ff5a5a';
    g.fillRect(x + w / 2 - 1.5, yBase - h - 22, 3, 4);
  }

  // —— 杭州之门式双子塔 ——
  function hzTwinTower(g, x, yBase, h) {
    g.fillStyle = '#1c2c52';
    g.beginPath();
    g.moveTo(x, yBase);
    g.lineTo(x + 34, yBase);
    g.lineTo(x + 40, yBase - h);
    g.lineTo(x + 4, yBase - h);
    g.closePath(); g.fill();
    g.fillStyle = '#18264a';
    g.beginPath();
    g.moveTo(x + 66, yBase);
    g.lineTo(x + 100, yBase);
    g.lineTo(x + 96, yBase - h);
    g.lineTo(x + 60, yBase - h);
    g.closePath(); g.fill();
    g.fillStyle = '#22335e';
    g.fillRect(x + 4, yBase - h - 8, 92, 8);
    var rows = Math.round(h / 15);
    for (var r = 0; r < rows; r++) {
      for (var cc = 0; cc < 4; cc++) {
        var yy = yBase - h + 8 + r * 13;
        var on = ((r * 7 + cc * 13) % 9) < 4;
        g.fillStyle = on ? 'rgba(255,205,120,0.5)' : 'rgba(140,190,230,0.18)';
        g.fillRect(x + 6 + cc * 7, yy, 5, 6);
      }
    }
    for (var r2 = 0; r2 < rows; r2++) {
      for (var cc2 = 0; cc2 < 3; cc2++) {
        var yy2 = yBase - h + 8 + r2 * 13;
        var on2 = ((r2 * 11 + cc2 * 7) % 9) < 4;
        g.fillStyle = on2 ? 'rgba(255,205,120,0.5)' : 'rgba(140,190,230,0.18)';
        g.fillRect(x + 70 + cc2 * 8, yy2, 6, 6);
      }
    }
    g.fillStyle = 'rgba(160,220,255,0.5)';
    g.fillRect(x + 4, yBase - h - 2, 92, 2);
    g.fillStyle = 'rgba(255,214,140,0.5)';
    g.fillRect(x + 4, yBase - h - 6, 92, 2);
  }

  // —— LED 大屏 ——
  function hzLedScreen(g, x, yBase, towerH) {
    g.fillStyle = '#0e1830';
    g.fillRect(x + 92, yBase - towerH + 60, 26, 44);
    var lg = g.createLinearGradient(0, 0, 0, 44);
    lg.addColorStop(0, 'rgba(255,120,140,0.75)');
    lg.addColorStop(0.5, 'rgba(120,200,255,0.75)');
    lg.addColorStop(1, 'rgba(255,200,120,0.75)');
    g.fillStyle = lg;
    g.fillRect(x + 94, yBase - towerH + 62, 22, 40);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x + 96, yBase - towerH + 70, 6, 3);
    g.fillRect(x + 104, yBase - towerH + 76, 8, 3);
    g.fillRect(x + 98, yBase - towerH + 84, 6, 3);
  }

  // —— 高架路 ——
  function hzHighway(g, x0, y, w) {
    g.fillStyle = '#182444';
    g.fillRect(x0, y, w, 8);
    g.fillStyle = '#223056';
    g.fillRect(x0, y - 2, w, 3);
    g.fillStyle = 'rgba(255,214,140,0.8)';
    for (var x = x0 + 20; x < x0 + w - 10; x += 70) g.fillRect(x, y - 5, 3, 3);
    g.fillStyle = '#101a34';
    for (var px = x0 + 16; px < x0 + w; px += 90) g.fillRect(px, y + 8, 10, H - GROUND - y - 8);
  }

  // —— 循环带/段尾跨缝塔（同一塔形画在左右接缝处，保证无缝循环） ——
  var hzEdgeTower = (function () {
    var tc = mkCanvas(90, 300);
    hzTower(tc.getContext('2d'), 0, 300, 260, 6);
    return tc;
  })();

  // —— 中景段①：西湖（湖面宽，远岸 + 江南屋 + 垂柳 + 石拱桥 + 小舟） ——
  var hzMidSeg1 = (function () {
    var c = mkCanvas(HZ_SEG_W, H - GROUND);
    var g = c.getContext('2d');
    hzWater(g, 340);
    // 远岸线
    g.fillStyle = '#1b2c4e';
    g.fillRect(0, 322, HZ_SEG_W, 20);
    hzJiangnanHouse(g, 60, 322);
    hzJiangnanHouse(g, 250, 322);
    hzPavilion(g, 468, 322);
    hzWillow(g, 565, 322, 1);
    hzWillow(g, 705, 322, 0.8);
    hzWillow(g, 1005, 322, 1.05);
    hzLamp(g, 155, 322);
    hzLamp(g, 875, 322);
    hzStoneBridge(g, 795, 342);
    hzBoat(g, 940, 402);
    hzLotus(g, 350, 428);
    hzLotus(g, 385, 442);
    hzLotus(g, 325, 446);
    hzLotus(g, 700, 452);
    hzLotus(g, 1120, 438);
    return c;
  })();

  // —— 中景段②：西湖城区（窄水面，白墙黛瓦 + 多层楼 + 路灯 + 灯笼招牌） ——
  var hzMidSeg2 = (function () {
    var c = mkCanvas(HZ_SEG_W, H - GROUND);
    var g = c.getContext('2d');
    hzWater(g, 436);
    g.fillStyle = '#1b2c4e';
    g.fillRect(0, 428, HZ_SEG_W, 12);
    hzJiangnanHouse(g, 20, 428);
    hzCityHouse(g, 170, 428, 120, 4);
    hzJiangnanHouse(g, 320, 428);
    hzCityHouse(g, 470, 428, 96, 3);
    hzCityHouse(g, 610, 428, 150, 5);
    hzCityHouse(g, 800, 428, 110, 4);
    hzJiangnanHouse(g, 950, 428);
    hzCityHouse(g, 1070, 428, 130, 5);
    hzLamp(g, 145, 428);
    hzTree(g, 300, 428);
    hzLamp(g, 450, 428);
    hzTree(g, 580, 428);
    hzLamp(g, 760, 428);
    hzTree(g, 915, 428);
    hzLamp(g, 1045, 428);
    hzSign(g, 205, 428);
    hzSign(g, 690, 428);
    hzLantern(g, 115, 428);
    hzLantern(g, 410, 428);
    hzLantern(g, 890, 428);
    return c;
  })();

  // —— 中景段③：钱塘江（宽阔江面 + 斜拉桥 + 两岸） ——
  var hzMidSeg3 = (function () {
    var c = mkCanvas(HZ_SEG_W, H - GROUND);
    var g = c.getContext('2d');
    hzWater(g, 260);
    // 左岸堤岸 + 楼（岸顶 y=160）
    g.fillStyle = '#16244a';
    g.fillRect(0, 160, 150, 320);
    g.fillStyle = '#101a34';
    g.fillRect(0, 144, 150, 16);
    hzCityHouse(g, 18, 144, 96, 4);
    g.fillStyle = 'rgba(255,200,110,0.5)';
    for (var i = 0; i < 5; i++) g.fillRect(24 + i * 26, 206, 12, 16);
    // 右岸远景建筑群
    g.fillStyle = '#182848';
    g.fillRect(960, 176, 240, 304);
    for (var b = 0; b < 4; b++) {
      g.fillStyle = '#14203e';
      g.fillRect(970 + b * 56, 150 + (b % 2) * 26, 44, 330 - (b % 2) * 26);
    }
    g.fillStyle = 'rgba(255,200,110,0.5)';
    for (var i2 = 0; i2 < 5; i2++) g.fillRect(980 + i2 * 44, 220 + (i2 % 2) * 18, 12, 16);
    // 斜拉桥
    hzCableBridge(g, 300, 820, 238);
    // 桥下倒影
    g.fillStyle = 'rgba(200,220,255,0.08)';
    g.fillRect(300, 402, 520, 4);
    g.fillRect(320, 418, 480, 3);
    return c;
  })();

  // —— 中景段④：钱江新城（高楼 + 杭州之门 + 高架 + LED 大屏） ——
  var hzMidSeg4 = (function () {
    var c = mkCanvas(HZ_SEG_W, H - GROUND);
    var g = c.getContext('2d');
    hzWater(g, 380);
    g.fillStyle = '#141e3a';
    g.fillRect(0, 372, HZ_SEG_W, 10);
    hzTower(g, 30, 372, 240, 6);
    hzTower(g, 175, 372, 300, 8);
    hzTwinTower(g, 420, 372, 360);
    hzTower(g, 640, 372, 220, 6);
    hzTower(g, 800, 372, 320, 9);
    hzTower(g, 980, 372, 260, 7);
    hzLedScreen(g, 830, 372, 320);
    hzHighway(g, 0, 318, HZ_SEG_W);
    // 右缘跨缝塔（与循环带左缘同塔，保证旅程结束无缝衔接）
    g.drawImage(hzEdgeTower, 1155, 72);
    return c;
  })();
  var hzMidSegs = [hzMidSeg1, hzMidSeg2, hzMidSeg3, hzMidSeg4];

  // —— 钱江新城核心区无缝循环带（旅程结束后 840 宽） ——
  var hzEndMidTile = (function () {
    var c = mkCanvas(HZ_END_W, H - GROUND);
    var g = c.getContext('2d');
    hzWater(g, 380);
    g.fillStyle = '#141e3a';
    g.fillRect(0, 372, HZ_END_W, 10);
    g.drawImage(hzEdgeTower, -45, 72);   // 左缘跨缝塔
    g.drawImage(hzEdgeTower, 795, 72);   // 右缘跨缝塔（840-45）
    hzTower(g, 100, 372, 300, 8);
    hzTower(g, 280, 372, 230, 6);
    hzTwinTower(g, 430, 372, 330);
    hzTower(g, 610, 372, 280, 7);
    hzHighway(g, 0, 318, HZ_END_W);
    return c;
  })();

  // —— 远景无缝循环带 ——
  var hzEndFarTile = (function () {
    var c = mkCanvas(HZ_END_W, H - GROUND);
    var g = c.getContext('2d');
    g.drawImage(hzFarEdge, -30, 120);
    g.drawImage(hzFarEdge, 810, 120);
    var ft = [[70, 196, 42, 146], [150, 222, 36, 120], [230, 190, 44, 152], [320, 214, 40, 128], [410, 200, 42, 142], [500, 226, 36, 116], [590, 204, 40, 138], [680, 218, 38, 124], [760, 196, 42, 146]];
    for (var i = 0; i < ft.length; i++) {
      var tv = ft[i];
      g.fillStyle = '#1c2c50';
      g.fillRect(tv[0], tv[1], tv[2], tv[3]);
      g.fillStyle = '#162244';
      g.fillRect(tv[0] + tv[2] - 3, tv[1], 3, tv[3]);
      g.fillRect(tv[0] + tv[2] / 2 - 1, tv[1] - 10, 2, 10);
      if (i % 2 === 0) {
        g.fillStyle = 'rgba(255,205,120,0.5)';
        for (var wy = tv[1] + 8; wy < tv[1] + tv[3] - 6; wy += 12) g.fillRect(tv[0] + tv[2] * 0.3, wy, 5, 4);
      }
    }
    return c;
  })();

  // —— 杭州地面（夜间水面：湖面 / 江面两版） ——
  function hzGroundTile(water) {
    var c = mkCanvas(W, GROUND);
    var g = c.getContext('2d');
    var base = water === 'lake' ? '#0c1c3c' : '#081830';
    g.fillStyle = base;
    g.fillRect(0, 0, W, GROUND);
    g.strokeStyle = water === 'lake' ? 'rgba(110,150,200,0.20)' : 'rgba(150,180,220,0.16)';
    g.lineWidth = 1;
    for (var y = 6; y < GROUND; y += 9) {
      var off = (y * 5) % 34;
      g.beginPath();
      for (var x = off - 40; x < W + 40; x += 84) { g.moveTo(x, y); g.lineTo(x + 20, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,190,110,0.10)';
    for (var x2 = 8; x2 < W; x2 += 42) {
      if ((x2 * 7) % 5 < 2) g.fillRect(x2, 2, 5, GROUND - 4);
    }
    g.fillStyle = 'rgba(180,210,240,0.07)';
    g.fillRect(0, 2, W, 3);
    return c;
  }
  var hzGroundLake = hzGroundTile('lake');
  var hzGroundRiver = hzGroundTile('river');

  // —— 杭州障碍（6 种杭州化变体，64x52；按阶段取用） ——
  var HZ_W = 64, HZ_H = 52;
  var hzVariants = (function () {
    var painters = [
      // 0 西湖石桥墩
      function (g) {
        g.fillStyle = '#39496e'; g.fillRect(0, 0, HZ_W, HZ_H);
        g.fillStyle = '#2c3a58';
        for (var y = 0; y < HZ_H; y += 13) g.fillRect(0, y, HZ_W, 2);
        g.fillStyle = '#46587e'; g.fillRect(0, 0, HZ_W, 4);
        g.fillStyle = '#1c2844';
        g.beginPath(); g.arc(32, HZ_H, 16, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,190,110,0.5)'; g.fillRect(27, HZ_H - 14, 10, 14);
        g.fillStyle = '#ffd98e'; g.fillRect(6, 8, 4, 4); g.fillRect(54, 8, 4, 4);
      },
      // 1 雷峰塔身
      function (g) {
        g.fillStyle = '#1e2a48'; g.fillRect(6, 0, 52, HZ_H);
        g.fillStyle = '#182244'; g.fillRect(6, 0, 52, 4);
        g.fillStyle = '#101a34';
        g.fillRect(0, 14, 64, 5);
        g.beginPath(); g.moveTo(0, 16); g.lineTo(7, 11); g.lineTo(11, 16); g.fill();
        g.beginPath(); g.moveTo(64, 16); g.lineTo(57, 11); g.lineTo(53, 16); g.fill();
        g.fillRect(0, 38, 64, 5);
        g.beginPath(); g.moveTo(0, 40); g.lineTo(7, 35); g.lineTo(11, 40); g.fill();
        g.beginPath(); g.moveTo(64, 40); g.lineTo(57, 35); g.lineTo(53, 40); g.fill();
        g.fillStyle = 'rgba(255,206,120,0.8)';
        g.fillRect(28, 22, 8, 7); g.fillRect(28, 45, 8, 4);
      },
      // 2 白墙黛瓦
      function (g) {
        g.fillStyle = '#46546e'; g.fillRect(0, 8, HZ_W, HZ_H - 8);
        g.fillStyle = '#101a34';
        g.fillRect(-2, 2, 68, 8);
        g.beginPath(); g.moveTo(-2, 6); g.lineTo(6, -2); g.lineTo(12, 6); g.fill();
        g.beginPath(); g.moveTo(66, 6); g.lineTo(58, -2); g.lineTo(52, 6); g.fill();
        g.fillStyle = 'rgba(255,200,110,0.75)';
        g.fillRect(10, 20, 16, 16); g.fillRect(38, 20, 16, 16);
        g.fillStyle = '#101a34';
        g.fillRect(10, 27, 16, 2); g.fillRect(17, 20, 2, 16);
        g.fillRect(38, 27, 16, 2); g.fillRect(45, 20, 2, 16);
        g.fillStyle = '#0e1830'; g.fillRect(27, 38, 10, HZ_H - 38);
      },
      // 3 钱塘江桥墩钢架
      function (g) {
        g.fillStyle = '#2e3a52'; g.fillRect(0, 0, HZ_W, HZ_H);
        g.strokeStyle = '#3e4e6e'; g.lineWidth = 4;
        g.beginPath();
        g.moveTo(6, 0); g.lineTo(58, HZ_H);
        g.moveTo(58, 0); g.lineTo(6, HZ_H);
        g.stroke();
        g.strokeStyle = '#1c2844'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 14); g.lineTo(HZ_W, 14);
        g.moveTo(0, 38); g.lineTo(HZ_W, 38);
        g.stroke();
        g.fillStyle = '#5a6a8a';
        for (var i = 0; i < 4; i++) g.fillRect(8 + i * 16, 26, 3, 3);
        g.fillStyle = '#ff9a5a'; g.fillRect(6, 4, 5, 5);
      },
      // 4 高楼玻璃幕墙
      function (g) {
        g.fillStyle = '#22304e'; g.fillRect(0, 0, HZ_W, HZ_H);
        g.fillStyle = '#1a2844'; g.fillRect(0, 0, HZ_W, 3);
        for (var r = 0; r < 4; r++) {
          for (var cc = 0; cc < 4; cc++) {
            var on = ((cc * 7 + r * 13) % 5) < 2;
            g.fillStyle = on ? 'rgba(255,205,120,0.55)' : 'rgba(150,195,235,0.15)';
            g.fillRect(6 + cc * 14, 8 + r * 11, 9, 6);
          }
        }
        g.fillStyle = '#162244'; g.fillRect(HZ_W - 5, 0, 5, HZ_H);
        g.fillStyle = 'rgba(120,200,255,0.5)'; g.fillRect(0, HZ_H - 4, HZ_W, 4);
      },
      // 5 灯柱广告牌
      function (g) {
        g.fillStyle = '#1c2844'; g.fillRect(30, 0, 5, HZ_H);
        g.fillRect(24, 46, 17, 6);
        g.fillStyle = '#0e1830'; g.fillRect(14, 6, 36, 24);
        g.fillStyle = 'rgba(255,214,140,0.85)'; g.fillRect(18, 10, 28, 16);
        g.fillStyle = '#0e1830';
        g.fillRect(24, 16, 16, 2); g.fillRect(28, 12, 8, 10);
        var lg = g.createRadialGradient(32, 18, 2, 32, 18, 22);
        lg.addColorStop(0, 'rgba(255,200,120,0.35)');
        lg.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = lg; g.fillRect(10, -4, 44, 44);
        g.fillStyle = '#ffd98e'; g.fillRect(29, -2, 4, 4);
      }
    ];
    return painters.map(function (paint) {
      var c = mkCanvas(HZ_W, HZ_H);
      var g = c.getContext('2d');
      paint(g);
      g.strokeStyle = 'rgba(10,16,34,0.9)'; g.lineWidth = 2;
      rr(g, 1, 1, HZ_W - 2, HZ_H - 2, 3); g.stroke();
      g.fillStyle = 'rgba(8,12,28,0.5)';
      g.fillRect(2, HZ_H - 4, HZ_W - 4, 3);
      return c;
    });
  })();

  // 阶段 → 障碍变体清单（0 西湖石桥 / 1 塔身 / 2 白墙黛瓦 / 3 桥墩钢架 / 4 高楼 / 5 灯柱广告）
  var HZ_STAGE_VARIANTS = [
    [0, 1, 5],
    [2, 5, 1],
    [3, 5, 2],
    [4, 5, 3]
  ];

  // 杭州障碍口缘（gap 上下沿檐口 / 灯带，按阶段）
  function hzCap(g, x, gapStart, gapEnd, stage) {
    if (stage === 0) {
      g.fillStyle = '#46587e'; g.fillRect(x - 3, gapStart - 7, HZ_W + 6, 6);
      g.fillStyle = '#ffd98e'; g.fillRect(x + 8, gapStart - 6, 4, 4); g.fillRect(x + HZ_W - 14, gapStart - 6, 4, 4);
      g.fillStyle = '#46587e'; g.fillRect(x - 3, gapEnd + 1, HZ_W + 6, 6);
      g.fillStyle = '#ffd98e'; g.fillRect(x + 8, gapEnd + 3, 4, 4); g.fillRect(x + HZ_W - 14, gapEnd + 3, 4, 4);
    } else if (stage === 1) {
      g.fillStyle = '#101a34'; g.fillRect(x - 4, gapStart - 9, HZ_W + 8, 8);
      g.beginPath(); g.moveTo(x - 4, gapStart - 4); g.lineTo(x + 2, gapStart - 10); g.lineTo(x + 6, gapStart - 4); g.fill();
      g.beginPath(); g.moveTo(x + HZ_W + 4, gapStart - 4); g.lineTo(x + HZ_W - 2, gapStart - 10); g.lineTo(x + HZ_W - 6, gapStart - 4); g.fill();
      g.fillStyle = '#101a34'; g.fillRect(x - 4, gapEnd, HZ_W + 8, 8);
      g.fillStyle = 'rgba(255,200,110,0.4)'; g.fillRect(x - 4, gapEnd + 6, HZ_W + 8, 2);
    } else if (stage === 2) {
      g.fillStyle = '#2e3a52'; g.fillRect(x - 3, gapStart - 8, HZ_W + 6, 7);
      g.fillStyle = '#ff9a5a'; g.fillRect(x + 10, gapStart - 7, 4, 5); g.fillRect(x + HZ_W - 16, gapStart - 7, 4, 5);
      g.fillStyle = '#2e3a52'; g.fillRect(x - 3, gapEnd + 1, HZ_W + 6, 7);
      g.fillStyle = '#ff9a5a'; g.fillRect(x + 10, gapEnd + 3, 4, 5); g.fillRect(x + HZ_W - 16, gapEnd + 3, 4, 5);
    } else {
      g.fillStyle = '#22304e'; g.fillRect(x - 3, gapStart - 8, HZ_W + 6, 7);
      g.fillStyle = 'rgba(120,200,255,0.6)'; g.fillRect(x - 3, gapStart - 8, HZ_W + 6, 2);
      g.fillStyle = '#22304e'; g.fillRect(x - 3, gapEnd + 1, HZ_W + 6, 7);
      g.fillStyle = 'rgba(255,214,140,0.5)'; g.fillRect(x - 3, gapEnd + 5, HZ_W + 6, 2);
    }
  }

  // 杭州环境动画：星星闪烁 / 城市灯光闪烁 / 桥上车辆 / 高架车流 / 飞机 / 水面月影
  var hzFlicker = [
    [0, 70, 246, 22, 26, 0.4], [0, 260, 246, 22, 26, 1.2], [0, 938, 390, 8, 14, 2.1],
    [1, 200, 332, 10, 10, 0.8], [1, 520, 362, 10, 10, 1.7], [1, 700, 338, 10, 10, 2.6], [1, 990, 336, 10, 10, 0.2], [1, 1100, 300, 10, 10, 1.5],
    [2, 60, 206, 12, 16, 0.9], [2, 1000, 180, 14, 18, 1.9], [2, 1080, 170, 14, 18, 2.9],
    [3, 210, 200, 12, 12, 0.5], [3, 470, 220, 10, 12, 1.4], [3, 830, 180, 12, 12, 2.3], [3, 1010, 190, 12, 12, 3.1]
  ];
  function hzEnvFX() {
    // 星星闪烁（天空固定 4 颗）
    for (var i = 0; i < 4; i++) {
      var tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(frame * 0.06 + i * 1.7));
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#e8efff';
      ctx.fillRect(40 + i * 90, 26 + (i % 2) * 42, 2, 2);
    }
    // 城市灯光闪烁（仅当前可见段）
    for (var i2 = 0; i2 < hzFlicker.length; i2++) {
      var f = hzFlicker[i2];
      var segX0 = f[0] * HZ_SEG_W, segX1 = segX0 + HZ_SEG_W;
      if (segX1 <= hz.jx || segX0 >= hz.jx + W) continue;
      var sx = segX0 + f[1] - hz.jx;
      if (sx < -30 || sx > W + 10) continue;
      ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.09 + f[5]));
      ctx.fillStyle = '#ffd98e';
      ctx.fillRect(sx, f[2], f[3], f[4]);
    }
    ctx.globalAlpha = 1;
    // 桥上车辆（钱塘江段桥面）
    var s3x0 = 2 * HZ_SEG_W, s3x1 = s3x0 + HZ_SEG_W;
    if (s3x1 > hz.jx && s3x0 < hz.jx + W) {
      for (var c3 = 0; c3 < 3; c3++) {
        var sx3 = s3x0 + 300 + ((frame * 2.2 + c3 * 190) % 520) - hz.jx;
        if (sx3 < -20 || sx3 > W + 20) continue;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffe2a0';
        ctx.fillRect(sx3, 236, 5, 2);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(sx3 - 12, 236, 12, 2);
      }
    }
    // 高架车流（钱江新城段）
    var s4x0 = 3 * HZ_SEG_W, s4x1 = s4x0 + HZ_SEG_W;
    if (s4x1 > hz.jx && s4x0 < hz.jx + W) {
      for (var c4 = 0; c4 < 4; c4++) {
        var sx4 = s4x0 + 30 + ((frame * 3.2 + c4 * 220) % 1140) - hz.jx;
        if (sx4 < -20 || sx4 > W + 20) continue;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(sx4, 316, 6, 2);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(sx4 - 14, 316, 14, 2);
      }
    }
    // 遥远飞机
    ctx.globalAlpha = 0.8;
    var px = (frame * 0.35) % (W + 140) - 70;
    var py = 84 + Math.sin(frame * 0.02) * 6;
    ctx.fillStyle = '#cfe0ff';
    ctx.fillRect(px, py, 7, 1.5);
    ctx.fillStyle = '#ff9a6a';
    ctx.fillRect(px + 4, py - 0.5, 2, 2);
    // 水面月影（随阶段水线）
    var wt = [340, 436, 260, 380][hzStage()];
    var mg2 = ctx.createLinearGradient(352, wt, 352, H);
    mg2.addColorStop(0, 'rgba(230,240,255,0.20)');
    mg2.addColorStop(1, 'rgba(230,240,255,0)');
    ctx.fillStyle = mg2;
    ctx.fillRect(344, wt, 16, H - wt);
    ctx.globalAlpha = 0.10 + 0.06 * Math.sin(frame * 0.08);
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath(); ctx.ellipse(352, H - GROUND + 12, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
    // 水面波光
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#cfe0f5';
    for (var w = 0; w < 5; w++) {
      var wy = H - GROUND + 10 + w * 14;
      var wox = (frame * (1.2 + w * 0.3) + w * 60) % (W + 60) - 30;
      ctx.fillRect(wox, wy, 22, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  // —— 绘制杭州场景 ——
  function drawHzScene() {
    ctx.drawImage(hzSkyTile, 0, 0);
    var fp = hz.jx * 0.45;
    if (hz.jx < HZ_JOURNEY_LEN) {
      for (var fk = 0; fk < 4; fk++) {
        var fx = fk * HZ_FAR_SEG_W - fp;
        if (fx > -HZ_FAR_SEG_W && fx < W) ctx.drawImage(hzFarSegs[fk], fx, 0);
      }
    } else {
      var fEnd = -((fp - HZ_JOURNEY_LEN * 0.45) % HZ_END_W);
      ctx.drawImage(hzEndFarTile, fEnd, 0);
      ctx.drawImage(hzEndFarTile, fEnd + HZ_END_W, 0);
    }
    if (hz.jx < HZ_JOURNEY_LEN) {
      for (var mk = 0; mk < 4; mk++) {
        var mx = mk * HZ_SEG_W - hz.jx;
        if (mx > -HZ_SEG_W && mx < W) ctx.drawImage(hzMidSegs[mk], mx, 0);
      }
    } else {
      var mEnd = -((hz.jx - HZ_JOURNEY_LEN) % HZ_END_W);
      ctx.drawImage(hzEndMidTile, mEnd, 0);
      ctx.drawImage(hzEndMidTile, mEnd + HZ_END_W, 0);
    }
    hzEnvFX();
  }

  // —— 角色：按地图分配 —— 杭州=新角色参考图(hero-sheet)；雪镇=企鹅帧(penguin-sheet)；街景=body.png 静态贴纸少女 ——
  var BIRD_SCALE = 0.72;
  var BIRD_DRAW_H = 46;        // 帧归一化身高（CSS px）
  var BIRD_FLIP = false;       // 侧面帧朝向：探针核对后如需镜像置 true
  var birdBody = null;
  var birdFrames = null;       // 企鹅帧（雪镇专用）
  var birdHero = null;         // 新角色帧 { glide, flapUp, flapDown, hurt, idle }（杭州专用）
  (function () {
    var img = new Image();
    img.onload = function () { birdBody = img; };
    img.src = ABASE + '/img/flappy/body.png';
  })();
  // 杭州：新角色参考图
  (function () {
    var img = new Image();
    img.onload = function () {
      try { birdHero = extractHeroFrames(img); } catch (e) { birdHero = null; }
    };
    img.onerror = function () { birdHero = null; };
    img.src = ABASE + '/img/flappy/hero-sheet.png';
  })();
  // 雪镇：企鹅帧（始终加载，与 hero 无关）
  (function () {
    var img = new Image();
    img.onload = function () {
      try { birdFrames = extractBirdFrames(img); } catch (e) { birdFrames = null; }
    };
    img.src = ABASE + '/img/flappy/penguin-sheet.png';
  })();

  // 从参考 sprite sheet 自动抠帧：去近白底 → 连通域 → 过滤 → 按行聚类
  // 行序（主区，排除右侧头像/表情面板与左侧大立绘）：待机/行走/奔跑/跳跃/攻击/受伤[/死亡]
  function extractBirdFrames(img) {
    var sw = img.naturalWidth, sh = img.naturalHeight;
    var sheet = mkCanvas(sw, sh);
    var g = sheet.getContext('2d');
    g.drawImage(img, 0, 0);
    var data = g.getImageData(0, 0, sw, sh);
    var px = data.data, N = sw * sh;
    // 1) 四边 flood-fill 去近白背景
    var bg = new Uint8Array(N), st = [];
    function tryPush(x, y) {
      var i = y * sw + x;
      if (bg[i]) return;
      var id = i * 4, r = px[id], gg = px[id + 1], b = px[id + 2];
      if (r >= 235 && gg >= 235 && b >= 235 && (Math.max(r, gg, b) - Math.min(r, gg, b)) <= 16) {
        bg[i] = 1; st.push(i);
      }
    }
    for (var x0 = 0; x0 < sw; x0++) { tryPush(x0, 0); tryPush(x0, sh - 1); }
    for (var y0 = 0; y0 < sh; y0++) { tryPush(0, y0); tryPush(sw - 1, y0); }
    while (st.length) {
      var i = st.pop(), cx = i % sw, cy = (i / sw) | 0;
      px[i * 4 + 3] = 0;
      if (cx > 0) tryPush(cx - 1, cy);
      if (cx < sw - 1) tryPush(cx + 1, cy);
      if (cy > 0) tryPush(cx, cy - 1);
      if (cy < sh - 1) tryPush(cx, cy + 1);
    }
    g.putImageData(data, 0, 0);
    // 2) 8 邻域连通域
    var seen = new Uint8Array(N), comps = [], stack = [];
    for (var i0 = 0; i0 < N; i0++) {
      if (seen[i0] || px[i0 * 4 + 3] <= 25) continue;
      seen[i0] = 1; stack.length = 0; stack.push(i0);
      var minX = sw, minY = sh, maxX = 0, maxY = 0, cnt = 0;
      while (stack.length) {
        var j = stack.pop(), jx = j % sw, jy = (j / sw) | 0;
        cnt++;
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
          var ni = ny * sw + nx;
          if (seen[ni] || px[ni * 4 + 3] <= 25) continue;
          seen[ni] = 1; stack.push(ni);
        }
      }
      comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, n: cnt });
    }
    // 3) 过滤：主区 / 够大 / 填充率够（去文字标签、面板线条、风特效弧）
    var fr = comps.filter(function (c) {
      return c.cx < sw * 0.75 &&
        c.h >= sh * 0.055 && c.w >= sw * 0.02 &&
        c.n / (c.w * c.h) >= 0.18;
    });
    if (fr.length < 12) return null;
    var medH = fr.map(function (c) { return c.h; }).sort(function (a, b) { return a - b; })[fr.length >> 1];
    fr = fr.filter(function (c) { return c.h < medH * 1.8; }); // 排除左侧大立绘
    // 4) 按 cy 聚行，行内按 x 排序
    fr.sort(function (a, b) { return a.cy - b.cy; });
    var rows = [];
    fr.forEach(function (c) {
      var row = null;
      for (var i = rows.length - 1; i >= 0; i--) {
        if (Math.abs(rows[i][0].cy - c.cy) < medH * 0.85) { row = rows[i]; break; }
      }
      if (row) row.push(c); else rows.push([c]);
    });
    rows.forEach(function (r) { r.sort(function (a, b) { return a.cx - b.cx; }); });
    if (rows.length < 6) return null;
    function crop(c) {
      var cc = mkCanvas(c.w, c.h);
      cc.getContext('2d').drawImage(sheet, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      return cc;
    }
    function pick(row, idx) { return crop(row[Math.min(idx, row.length - 1)]); }
    var walk = rows[1], run = rows[2], attack = rows[4], hurt = rows[5];
    if (!walk || !run || !attack || !hurt) return null;
    var glideC = crop(walk[walk.length >> 1]);
    var k = BIRD_DRAW_H / glideC.height;
    function norm(cv) {
      var w = Math.max(1, Math.round(cv.width * k)), h = Math.max(1, Math.round(cv.height * k));
      var out = mkCanvas(w, h), og = out.getContext('2d');
      og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
      og.drawImage(cv, 0, 0, w, h);
      return out;
    }
    return {
      glide: norm(glideC),
      flapUp: norm(pick(run, 1)),
      flapDown: norm(pick(attack, 3)),
      hurt: norm(pick(hurt, 0)),
      _rows: rows.length, _comps: fr.length
    };
  }

  // 从新角色参考图自动抠帧：深灰底 flood-fill → 连通域 → 行聚类
  // 行序（主区）：待机6/行走8/奔跑8/跳跃扇动6/下落滑翔6/攻击6/受击&死亡10
  function extractHeroFrames(img) {
    var sw = img.naturalWidth, sh = img.naturalHeight;
    var sheet = mkCanvas(sw, sh);
    var g = sheet.getContext('2d');
    g.drawImage(img, 0, 0);
    var data = g.getImageData(0, 0, sw, sh);
    var px = data.data, N = sw * sh;
    // 1) 四边 flood-fill 去深灰背景（近 bg 色 rgb(40,43,48) 容差 13）
    var bg = new Uint8Array(N), st = [];
    function tryPush(x, y) {
      var i = y * sw + x;
      if (bg[i]) return;
      var id = i * 4, r = px[id], gg = px[id + 1], b = px[id + 2];
      var d = Math.max(Math.abs(r - 40), Math.abs(gg - 43), Math.abs(b - 48));
      if (d <= 13) { bg[i] = 1; st.push(i); }
    }
    for (var x0 = 0; x0 < sw; x0++) { tryPush(x0, 0); tryPush(x0, sh - 1); }
    for (var y0 = 0; y0 < sh; y0++) { tryPush(0, y0); tryPush(sw - 1, y0); }
    while (st.length) {
      var i = st.pop(), cx = i % sw, cy = (i / sw) | 0;
      px[i * 4 + 3] = 0;
      if (cx > 0) tryPush(cx - 1, cy);
      if (cx < sw - 1) tryPush(cx + 1, cy);
      if (cy > 0) tryPush(cx, cy - 1);
      if (cy < sh - 1) tryPush(cx, cy + 1);
    }
    g.putImageData(data, 0, 0);
    // 2) 8 邻域连通域
    var seen = new Uint8Array(N), comps = [], stack = [];
    for (var i0 = 0; i0 < N; i0++) {
      if (seen[i0] || px[i0 * 4 + 3] <= 25) continue;
      seen[i0] = 1; stack.length = 0; stack.push(i0);
      var minX = sw, minY = sh, maxX = 0, maxY = 0, cnt = 0;
      while (stack.length) {
        var j = stack.pop(), jx = j % sw, jy = (j / sw) | 0;
        cnt++;
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
          var ni = ny * sw + nx;
          if (seen[ni] || px[ni * 4 + 3] <= 25) continue;
          seen[ni] = 1; stack.push(ni);
        }
      }
      comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, n: cnt });
    }
    // 3) 过滤：主区（排除右侧头像面板）/ 够大 / 填充率够
    var fr = comps.filter(function (c) {
      return c.cx < sw * 0.78 &&
        c.h >= sh * 0.04 && c.w >= sw * 0.018 &&
        c.n / (c.w * c.h) >= 0.16;
    });
    if (fr.length < 10) return null;
    var medH = fr.map(function (c) { return c.h; }).sort(function (a, b) { return a - b; })[fr.length >> 1];
    fr = fr.filter(function (c) { return c.h < medH * 1.7; }); // 排除左侧大立绘
    // 4) 按 cy 聚行，行内按 x 排序
    fr.sort(function (a, b) { return a.cy - b.cy; });
    var rows = [];
    fr.forEach(function (c) {
      var row = null;
      for (var i = rows.length - 1; i >= 0; i--) {
        if (Math.abs(rows[i][0].cy - c.cy) < medH * 0.9) { row = rows[i]; break; }
      }
      if (row) row.push(c); else rows.push([c]);
    });
    rows.forEach(function (r) { r.sort(function (a, b) { return a.cx - b.cx; }); });
    if (rows.length < 6) return null;
    function crop(c) {
      var cc = mkCanvas(c.w, c.h);
      cc.getContext('2d').drawImage(sheet, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      return cc;
    }
    function pick(row, idx) { return row ? crop(row[Math.min(idx, row.length - 1)]) : null; }
    var idle = rows[0], walk = rows[1], run = rows[2], jump = rows[3], glide = rows[4], hurt = rows[5];
    if (!walk || !run || !jump || !glide || !hurt) return null;
    var glideC = crop(glide[Math.min(2, glide.length - 1)]);
    var k = BIRD_DRAW_H / glideC.height;
    function norm(cv) {
      var w = Math.max(1, Math.round(cv.width * k)), h = Math.max(1, Math.round(cv.height * k));
      var out = mkCanvas(w, h), og = out.getContext('2d');
      og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
      og.drawImage(cv, 0, 0, w, h);
      return out;
    }
    return {
      glide: norm(glideC),
      flapUp: norm(pick(run, 1) || glideC),
      flapDown: norm(pick(jump, 2) || glideC),
      hurt: norm(pick(hurt, 0) || glideC),
      idle: norm(pick(idle, 2) || glideC),
      _rows: rows.length, _comps: fr.length
    };
  }

  // —— 拖尾光斑 / 星星精灵 ——
  var trailSpr = (function () {
    var c = mkCanvas(28, 28);
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(14, 14, 1, 14, 14, 13);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,214,235,0.5)');
    gr.addColorStop(1, 'rgba(255,214,235,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 28, 28);
    return c;
  })();
  var starSpr = (function () {
    var c = mkCanvas(16, 16);
    var g = c.getContext('2d');
    g.translate(8, 8);
    g.fillStyle = '#ffe08a';
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var r = i % 2 === 0 ? 7 : 2.8;
      var a = (i * Math.PI) / 4 - Math.PI / 2;
      g[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    return c;
  })();

  // =====================================================================
  //   绘制
  // =====================================================================
  function drawScene() {
    if (mapId === 'hangzhou') { drawHzScene(); return; }
    if (mapId === 'snow') {
      // 雪夜天空 + 远景冰山
      ctx.drawImage(snowSkyTile, 0, 0);
      ctx.drawImage(snowFarTile, -scrollFar, 0);
      ctx.drawImage(snowFarTile, W - scrollFar, 0);
      // 雪镇
      if (!snowMidTile) snowMidTile = buildSnowMidTile();
      ctx.drawImage(snowMidTile, -scrollMid, 0);
      ctx.drawImage(snowMidTile, MID_W - scrollMid, 0);
      return;
    }
    drawSky(ctx);
    // 云（自带漂移 + 轻视差）
    for (var ci = 0; ci < clouds.length; ci++) {
      var c2 = clouds[ci];
      var x2 = ((frame * (0.12 + ci * 0.05) - scrollFar * 0.4 + ci * 180) % (W + 140) + W + 140) % (W + 140) - 70;
      ctx.drawImage(c2, W - x2 - c2.width, 44 + ci * 42);
    }
    // 远景楼群
    ctx.drawImage(farTile, -scrollFar, 0);
    ctx.drawImage(farTile, W - scrollFar, 0);
    // 商店街
    if (!midTile) midTile = buildMidTile();
    ctx.drawImage(midTile, -scrollMid, 0);
    ctx.drawImage(midTile, MID_W - scrollMid, 0);
  }

  function drawStackColumn(x, seed, gapStart, gapEnd, hzForPipe) {
    var snow = mapId === 'snow';
    var hzn = mapId === 'hangzhou';
    var variants = hzn ? hzVariants : (snow ? iceVariants : caseVariants);
    var CW = hzn ? HZ_W : CASE_W, CH = hzn ? HZ_H : CASE_H;
    var step = CH + 3;
    var stage = hzn ? (hzForPipe !== undefined ? hzForPipe : hzStage()) : 0;
    var vlist = hzn ? HZ_STAGE_VARIANTS[stage] : null;
    // 上半：从画面顶垂下来的堆叠
    var y = -8, k = 0;
    while (y < gapStart) {
      var visH = Math.min(CH, gapStart - y);
      var jx = ((seed + k * 29) % 5) - 2;
      var va = hzn ? vlist[(seed + k * 13) % vlist.length] : (seed + k * 13) % 6;
      if (visH > 4) ctx.drawImage(variants[va], 0, 0, CW, visH, x + jx, y, CW, visH);
      y += step; k++;
    }
    // 下半：从地面叠起来的堆叠
    var base = H - GROUND;
    var kk = 0;
    var yBottom = base;
    while (yBottom - CH > gapEnd - CH) {
      var top = yBottom - CH;
      var jx2 = ((seed + kk * 29) % 5) - 2;
      var va2 = hzn ? vlist[(seed + kk * 13 + 3) % vlist.length] : (seed + kk * 13 + 3) % 6;
      if (top < gapEnd + 5) {
        var cut = gapEnd + 5 - top;
        if (cut < CH) ctx.drawImage(variants[va2], 0, cut, CW, CH - cut, x + jx2, gapEnd + 5, CW, CH - cut);
      } else {
        ctx.drawImage(variants[va2], x + jx2, top);
      }
      yBottom -= step; kk++;
      if (kk > 12) break;
    }
    if (hzn) {
      hzCap(ctx, x, gapStart, gapEnd, stage);
    } else if (snow) {
      // 雪盖：上柱底缘雪挂、下柱顶缘雪堆
      snowBar(ctx, x - 3, gapStart - 8, CASE_W + 6, 7, 'down');
      ctx.fillStyle = 'rgba(120,160,200,0.5)';
      ctx.fillRect(x - 3, gapStart - 2, CASE_W + 6, 2);
      snowBar(ctx, x - 3, gapEnd, CASE_W + 6, 7, 'up');
      ctx.fillStyle = 'rgba(120,160,200,0.5)';
      ctx.fillRect(x - 3, gapEnd + 6, CASE_W + 6, 2);
    } else {
      ctx.fillStyle = '#2e3040';
      ctx.fillRect(x, gapStart - 5, CASE_W, 5);
      ctx.fillStyle = 'rgba(190,230,120,0.85)';
      ctx.fillRect(x, gapStart - 5, CASE_W, 2);
      ctx.fillStyle = '#2e3040';
      ctx.fillRect(x, gapEnd, CASE_W, 5);
      ctx.fillStyle = 'rgba(190,230,120,0.85)';
      ctx.fillRect(x, gapEnd + 3, CASE_W, 2);
    }
  }

  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      drawStackColumn(Math.round(p.x), p.seed, Math.round(p.gy), Math.round(p.gy + PIPE_GAP), p.hz);
    }
  }

  function drawGround() {
    if (mapId === 'hangzhou') {
      var ht = hzStage() >= 2 ? hzGroundRiver : hzGroundLake;
      ctx.drawImage(ht, -hz.gx, H - GROUND);
      ctx.drawImage(ht, W - hz.gx, H - GROUND);
      return;
    }
    var tile = mapId === 'snow' ? snowGroundTile : groundTile;
    ctx.drawImage(tile, -groundX, H - GROUND);
    ctx.drawImage(tile, W - groundX, H - GROUND);
  }

  // 环境飘雪（雪镇）
  function drawFlakes() {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.s * 0.5, 0, 7);
      ctx.fill();
    }
  }

  function drawParticles() {
    var trailImg = mapId === 'snow' ? trailSnowSpr : trailSpr;
    for (var i = 0; i < trail.length; i++) {
      var t = trail[i];
      var a = t.t / (t.big ? 18 : 16);
      var size = (t.big ? 26 : 18) * (0.5 + a * 0.5);
      ctx.globalAlpha = a * 0.55;
      ctx.drawImage(trailImg, t.x - size / 2, t.y - size / 2, size, size);
    }
    for (var j = 0; j < stars.length; j++) {
      var s = stars[j];
      var sa = s.t / 22;
      ctx.globalAlpha = sa;
      var ss = s.s * (0.6 + sa * 0.4);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((22 - s.t) * 0.15);
      ctx.drawImage(starSpr, -ss / 2, -ss / 2, ss, ss);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // 当前动作帧：over=眩晕；ready=慢速悬停振翅循环；play=拍翅触发短促三连振翅，其余滑翔
  function birdSprite() {
    if (mapId === 'hangzhou' && birdHero) {
      // 杭州：新角色帧
      if (state === 'over') return birdHero.hurt || birdHero.glide;
      if (state === 'ready') {
        var hc = frame % 26;
        if (hc < 15) return birdHero.glide;
        if (hc < 20) return birdHero.flapUp;
        return birdHero.flapDown;
      }
      if (bird.wing > 6) return birdHero.flapDown;
      if (bird.wing > 2) return birdHero.flapUp;
      return birdHero.glide;
    }
    if (mapId === 'snow' && birdFrames) {
      // 雪镇：企鹅帧
      if (state === 'over') return birdFrames.hurt || birdFrames.glide;
      if (state === 'ready') {
        var c = frame % 26;
        if (c < 15) return birdFrames.glide;
        if (c < 20) return birdFrames.flapUp;
        return birdFrames.flapDown;
      }
      if (bird.wing > 6) return birdFrames.flapDown;
      if (bird.wing > 2) return birdFrames.flapUp;
      return birdFrames.glide;
    }
    return null; // 街景：body.png 静态贴纸少女（drawBird 兜底）
  }

  function drawBird() {
    // 飞行倾斜直接跟随速度（上升抬头/下坠俯冲，恢复 84b46ba 原始手感）；待机轻微浮动
    var tilt = state === 'play'
      ? Math.max(-0.45, Math.min(1.05, bird.vy * 0.06))
      : Math.sin(frame * 0.06) * 0.06;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt);
    var sp = birdSprite();
    if (sp) {
      if (BIRD_FLIP) ctx.scale(-1, 1);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2 + 2);
    } else if (birdBody) {
      // 兜底：旧贴纸少女静态图
      var w = birdBody.width * BIRD_SCALE;
      var h = birdBody.height * BIRD_SCALE;
      ctx.drawImage(birdBody, -w / 2, -h / 2 + 2, w, h);
    }
    ctx.restore();
  }

  function pill(x, y, w, h, pop) {
    ctx.save();
    if (pop) {
      var s = 1 + 0.16 * (pop / 10);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    ctx.shadowColor = 'rgba(47,53,80,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#fdf8ec';
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#2f3550';
    ctx.lineWidth = 3;
    rr(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawText(text, x, y, size, color, strokeW) {
    ctx.font = 'bold ' + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = strokeW || 4;
    ctx.strokeStyle = 'rgba(47,53,80,0.55)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawUI() {
    if (state === 'play') {
      var pw = 136;
      pill(W / 2 - pw / 2, 22, pw, 42, scorePop);
      drawText('得分 ' + score, W / 2, 44, 19, '#2f3550', 0);
    } else if (state === 'ready') {
      var tw = 234;
      pill(W / 2 - tw / 2, H * 0.16, tw, 66, 0);
      drawText('Flappy Bird', W / 2, H * 0.16 + 27, 26, '#2f3550', 0);
      drawText(MAPS[mapId].sub, W / 2, H * 0.16 + 50, 10, '#b0885a', 0);
      drawText('点击 / 空格 开始', W / 2, H * 0.62, 18, '#fff', 5);
      if (best > 0) drawText('最高分 ' + best, W / 2, H * 0.62 + 30, 14, '#fff', 4);
      // 地图切换按钮
      var tr = mapToggleRect();
      pill(tr.x, tr.y, tr.w, tr.h, 0);
      drawText('地图 · ' + MAPS[mapId].name + '  ⇄', W / 2, tr.y + tr.h / 2 + 1, 14, '#2f3550', 0);
    } else if (state === 'over') {
      ctx.fillStyle = 'rgba(24,26,40,0.5)';
      ctx.fillRect(0, 0, W, H);
      var pw2 = 252, ph2 = 188;
      var px2 = W / 2 - pw2 / 2, py2 = H * 0.3 - ph2 / 2;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
      ctx.fillStyle = '#fdf8ec';
      rr(ctx, px2, py2, pw2, ph2, 24);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#2f3550'; ctx.lineWidth = 3.5;
      rr(ctx, px2, py2, pw2, ph2, 24);
      ctx.stroke();
      drawText('游戏结束', W / 2, py2 + 34, 22, '#2f3550', 0);
      drawText('得分 ' + score, W / 2, py2 + 74, 26, '#e05656', 0);
      drawText('最高分 ' + best, W / 2, py2 + 108, 14, '#6a7288', 0);
      if (newBest) {
        drawText('★ 新纪录 ★', W / 2, py2 + 136, 16, '#e0862a', 0);
        ctx.globalAlpha = 0.8 + Math.sin(frame * 0.15) * 0.2;
        ctx.drawImage(starSpr, px2 + 30, py2 + 22, 14, 14);
        ctx.drawImage(starSpr, px2 + pw2 - 44, py2 + 22, 14, 14);
        ctx.globalAlpha = 1;
      } else if (best > 0 && score > 0) {
        drawText('差 ' + (best - score) + ' 分破纪录', W / 2, py2 + 136, 14, '#6a7288', 0);
      } else {
        drawText('再试一次吧', W / 2, py2 + 136, 14, '#6a7288', 0);
      }
      drawText('点击重新开始', W / 2, py2 + ph2 + 30, 15, '#fff', 4);
    }
    // 杭州夜航开场标题（进入飞行后短暂展示约 1.4s）
    if (mapId === 'hangzhou' && state === 'play' && hz.introT > 0) {
      var it = hz.introT;
      ctx.globalAlpha = Math.min(1, it / 55);
      ctx.fillStyle = 'rgba(6,10,26,0.55)';
      ctx.fillRect(0, H * 0.16, W, 96);
      drawText('MAP 03', W / 2, H * 0.16 + 30, 20, '#9fc0e8', 0);
      drawText('杭州夜航', W / 2, H * 0.16 + 64, 32, '#ffe2a8', 0);
      ctx.globalAlpha = 1;
    }
    // 受击白闪
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashT / 6) * 0.75 + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // 地图切换按钮热区（仅 ready 屏）
  function mapToggleRect() {
    return { x: W / 2 - 88, y: H * 0.70, w: 176, h: 32 };
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    drawScene();
    drawPipes();
    if (mapId === 'snow') drawFlakes();
    drawParticles();
    drawBird();
    drawGround();
    drawUI();
  }

  // ===== 主循环（固定时间步长 60Hz，任何刷新率下手感一致；面板隐藏时暂停） =====
  var lastTime = performance.now();
  var accumulator = 0;
  var STEP = 1 / 60;
  function loop(now) {
    if (host.offsetParent !== null) {
      var delta = (now - lastTime) / 1000;
      if (delta > 0.25) delta = 0.25; // 切后台回来防止追帧螺旋
      accumulator += delta;
      while (accumulator >= STEP) {
        update();
        accumulator -= STEP;
      }
      render();
    }
    lastTime = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ===== 调试钩子（无头探针用） =====
  window.__flappyDebug = {
    setMap: function (m) { if (MAPS[m]) { mapId = m; try { localStorage.setItem('arcade-flappy-map', m); } catch (e) {} } },
    getMap: function () { return mapId; },
    frames: function () { return birdFrames; },
    sheetReady: function () { return !!birdFrames; },
    pipeInfo: function () { return pipes.map(function (p) { return { x: p.x, gy: p.gy }; }); },
    scrollInfo: function () { return { far: scrollFar, mid: scrollMid, ground: groundX, frame: frame }; },
    midTileUrl: function () { if (!snowMidTile) snowMidTile = buildSnowMidTile(); return snowMidTile.toDataURL("image/png"); },
    hzInfo: function () { return { jx: hz.jx, stage: hzStage(), introT: hz.introT, len: HZ_JOURNEY_LEN, gx: hz.gx }; },
    hzSet: function (v) { hz.jx = v; },
    heroFrames: function () { return birdHero; },
    hzTileUrl: function (name) {
      var t = name === 'far1' ? hzFarSegs[0] : name === 'far4' ? hzFarSegs[3] : name === 'mid1' ? hzMidSegs[0] : name === 'mid4' ? hzMidSegs[3] : name === 'end' ? hzEndMidTile : null;
      return t ? t.toDataURL('image/png') : '';
    },
    tiltInfo: function () {
      var t = state === 'play' ? Math.max(-0.45, Math.min(1.05, bird.vy * 0.06)) : Math.sin(frame * 0.06) * 0.06;
      return { state: state, vy: bird.vy, tilt: t, y: bird.y, frame: frame };
    }
  };

  // ===== 输入 =====
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    // 待机屏点击「地图切换」按钮只换图，不开始
    if (state === 'ready') {
      var rc = canvas.getBoundingClientRect();
      var px = (e.clientX - rc.left) * (W / rc.width);
      var py = (e.clientY - rc.top) * (H / rc.height);
      var tr = mapToggleRect();
      if (px >= tr.x && px <= tr.x + tr.w && py >= tr.y && py <= tr.y + tr.h) {
        toggleMap();
        return;
      }
    }
    flap();
  });
  document.addEventListener('keydown', function (e) {
    if (host.offsetParent === null) return; // 面板隐藏时不响应
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      flap();
    }
  });
})();
