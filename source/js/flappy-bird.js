// ===== Flappy Bird 小游戏（canvas 自包含，挂载于 /fun/arcade/） =====
// 2026-09 v3：双地图 —— ①「音乐街区」像素商店街 + CD 盒障碍；②「极光雪镇」雪夜 + 冰砖障碍
// 小鸟：企鹅装角角少女（参考 sprite sheet 自动抠帧：去白底 → 连通域 → 行聚类，
//       侧面行走/奔跑/攻击帧做滑翔与振翅、受伤帧做眩晕；sheet 缺失时兜底旧贴纸图）
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

  // —— 地图主题：street=音乐街区 / snow=极光雪镇（localStorage 记忆） ——
  var MAPS = {
    street: { name: '音乐街区', sub: 'P I X E L  S T R E E T' },
    snow: { name: '极光雪镇', sub: 'A U R O R A  S N O W' }
  };
  var mapId = 'street';
  try { mapId = localStorage.getItem('arcade-flappy-map') === 'snow' ? 'snow' : 'street'; } catch (e) {}
  function toggleMap() {
    mapId = mapId === 'snow' ? 'street' : 'snow';
    try { localStorage.setItem('arcade-flappy-map', mapId); } catch (e) {}
  }
  // 飘雪初始化
  for (var fi = 0; fi < 42; fi++) {
    flakes.push({ x: Math.random() * W, y: Math.random() * (H - GROUND), s: 1 + Math.random() * 2.2, sp: 0.5 + Math.random() * 0.9, ph: Math.random() * 7, dr: 0.2 + Math.random() * 0.5 });
  }

  function reset() {
    bird = { x: W * 0.3, y: H * 0.45, vy: 0, r: 14, wing: 0 };
    pipes = [];
    score = 0;
    frame = 0;
    trail = [];
    stars = [];
    newBest = false;
  }
  reset();

  function spawnPipe(x) {
    var margin = 60;
    var gy = margin + Math.random() * (H - GROUND - margin * 2 - PIPE_GAP);
    pipes.push({ x: x, gy: gy, passed: false, seed: Math.floor(Math.random() * 997) });
  }

  function flap() {
    if (state === 'ready') {
      state = 'play';
      spawnPipe(W + 100);
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
        // 碰撞
        if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W) {
          if (bird.y - bird.r < p.gy || bird.y + bird.r > p.gy + PIPE_GAP) {
            gameOver();
          }
        }
      }
      // 地面 / 天花板
      if (bird.y + bird.r > H - GROUND) { bird.y = H - GROUND - bird.r; gameOver(); }
      if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }

      // 飞行拖尾
      if (frame % 4 === 0) trail.push({ x: bird.x - 10, y: bird.y + 4 + bird.vy, t: 16, big: false });
    } else if (state === 'ready') {
      // 待机时轻微浮动
      bird.y = H * 0.45 + Math.sin(frame * 0.06) * 6;
    }

    if (state !== 'over') {
      scrollFar = (scrollFar + SPEED * 0.22) % W;
      scrollMid = (scrollMid + SPEED * 0.55) % (W * 2);
      groundX = (groundX + SPEED) % W;
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
    // 身体倾斜平滑过渡（上升抬头 / 下坠俯冲 / 坠机倒栽）
    var targetTilt;
    if (state === 'play') targetTilt = Math.max(-0.45, Math.min(1.05, bird.vy * 0.06));
    else if (state === 'over') targetTilt = 1.3;
    else targetTilt = Math.sin(frame * 0.06) * 0.08;
    bird.tilt += (targetTilt - bird.tilt) * 0.18;
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

  // —— 角色：企鹅装角角少女（sprite sheet 自动抠帧；body.png 为兜底） ——
  var BIRD_SCALE = 0.72;
  var BIRD_DRAW_H = 46;        // 帧归一化身高（CSS px）
  var BIRD_FLIP = false;       // 侧面帧朝向：探针核对后如需镜像置 true
  var birdBody = null;
  var birdFrames = null;       // { glide, flapUp, flapDown, hurt }
  (function () {
    var img = new Image();
    img.onload = function () { birdBody = img; };
    img.src = ABASE + '/img/flappy/body.png';
  })();
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

  function drawStackColumn(x, seed, gapStart, gapEnd) {
    var snow = mapId === 'snow';
    var variants = snow ? iceVariants : caseVariants;
    var step = CASE_H + 3;
    // 上半：从画面顶垂下来的堆叠
    var y = -8, k = 0;
    while (y < gapStart) {
      var visH = Math.min(CASE_H, gapStart - y);
      var jx = ((seed + k * 29) % 5) - 2;
      var va = (seed + k * 13) % 6;
      if (visH > 4) ctx.drawImage(variants[va], 0, 0, CASE_W, visH, x + jx, y, CASE_W, visH);
      y += step; k++;
    }
    // 下半：从地面叠起来的堆叠
    var base = H - GROUND;
    var kk = 0;
    var yBottom = base;
    while (yBottom - CASE_H > gapEnd - CASE_H) {
      var top = yBottom - CASE_H;
      var jx2 = ((seed + kk * 29) % 5) - 2;
      var va2 = (seed + kk * 13 + 3) % 6;
      if (top < gapEnd + 5) {
        var cut = gapEnd + 5 - top;
        if (cut < CASE_H) ctx.drawImage(variants[va2], 0, cut, CASE_W, CASE_H - cut, x + jx2, gapEnd + 5, CASE_W, CASE_H - cut);
      } else {
        ctx.drawImage(variants[va2], x + jx2, top);
      }
      yBottom -= step; kk++;
      if (kk > 12) break;
    }
    if (snow) {
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
      drawStackColumn(Math.round(p.x), p.seed, Math.round(p.gy), Math.round(p.gy + PIPE_GAP));
    }
  }

  function drawGround() {
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
    if (!birdFrames) return null;
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

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.tilt || 0);
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
    midTileUrl: function () { if (!snowMidTile) snowMidTile = buildSnowMidTile(); return snowMidTile.toDataURL("image/png"); }
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
