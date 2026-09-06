// ===== Flappy Bird 小游戏（canvas 自包含，挂载于 /fun/arcade/） =====
// 2026-09 美术重制：「音乐街区」主题 —— 像素商店街 + CD 盒障碍 + Q 版贴纸少女
// 灵感参考：抖音同款飞行挑战（CD 盒堆障碍 / 商店街背景 / 圆角计分药丸）
// 全部资源程序化预渲染（离屏 canvas），无外部图片；物理/判定/操作与旧版一致
(function () {
  var host = document.getElementById('arcade-flappy');
  if (!host) return;

  var W = 420, H = 560, GROUND = 80;
  var GRAVITY = 0.38, FLAP = -6.8;
  var PIPE_W = 64, PIPE_GAP = 150, PIPE_SPACING = 220, SPEED = 2.6;

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
  var flashT = 0, shakeT = 0, scorePop = 0, newBest = false;
  try { best = parseInt(localStorage.getItem('arcade-flappy-best'), 10) || 0; } catch (e) { best = 0; }

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

  // —— 角色精灵图（从参考图裁剪，三帧：滑翔 / 振翅 / 眩晕） ——
  var BIRD_SCALE = 0.72;
  var birdImages = {};
  var birdImgsLoaded = 0;
  function loadBirdImg(name, src) {
    var img = new Image();
    img.onload = function () { birdImages[name] = img; birdImgsLoaded++; };
    img.onerror = function () { birdImgsLoaded++; };
    img.src = src;
  }
  loadBirdImg('glide', '/img/flappy/glide.png');
  loadBirdImg('flap', '/img/flappy/flap.png');
  loadBirdImg('dizzy', '/img/flappy/dizzy.png');

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
    var step = CASE_H + 3;
    // 上半：从画面顶垂下来的 CD 堆
    var y = -8, k = 0;
    while (y < gapStart) {
      var visH = Math.min(CASE_H, gapStart - y);
      var jx = ((seed + k * 29) % 5) - 2;
      var va = (seed + k * 13) % 6;
      if (visH > 4) ctx.drawImage(caseVariants[va], 0, 0, CASE_W, visH, x + jx, y, CASE_W, visH);
      y += step; k++;
    }
    ctx.fillStyle = '#2e3040';
    ctx.fillRect(x, gapStart - 5, CASE_W, 5);
    ctx.fillStyle = 'rgba(190,230,120,0.85)';
    ctx.fillRect(x, gapStart - 5, CASE_W, 2);
    // 下半：从地面叠起来的 CD 堆
    var base = H - GROUND;
    var kk = 0;
    var yBottom = base;
    while (yBottom - CASE_H > gapEnd - CASE_H) {
      var top = yBottom - CASE_H;
      var jx2 = ((seed + kk * 29) % 5) - 2;
      var va2 = (seed + kk * 13 + 3) % 6;
      if (top < gapEnd + 5) {
        var cut = gapEnd + 5 - top;
        if (cut < CASE_H) ctx.drawImage(caseVariants[va2], 0, cut, CASE_W, CASE_H - cut, x + jx2, gapEnd + 5, CASE_W, CASE_H - cut);
      } else {
        ctx.drawImage(caseVariants[va2], x + jx2, top);
      }
      yBottom -= step; kk++;
      if (kk > 12) break;
    }
    ctx.fillStyle = '#2e3040';
    ctx.fillRect(x, gapEnd, CASE_W, 5);
    ctx.fillStyle = 'rgba(190,230,120,0.85)';
    ctx.fillRect(x, gapEnd + 3, CASE_W, 2);
  }

  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      drawStackColumn(Math.round(p.x), p.seed, Math.round(p.gy), Math.round(p.gy + PIPE_GAP));
    }
  }

  function drawGround() {
    ctx.drawImage(groundTile, -groundX, H - GROUND);
    ctx.drawImage(groundTile, W - groundX, H - GROUND);
  }

  function drawParticles() {
    for (var i = 0; i < trail.length; i++) {
      var t = trail[i];
      var a = t.t / (t.big ? 18 : 16);
      var size = (t.big ? 26 : 18) * (0.5 + a * 0.5);
      ctx.globalAlpha = a * 0.55;
      ctx.drawImage(trailSpr, t.x - size / 2, t.y - size / 2, size, size);
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

  function drawBird() {
    var key;
    if (state === 'over') key = 'dizzy';
    else if (state === 'play') key = bird.wing > 0 ? 'flap' : 'glide';
    else key = (frame >> 5) & 1 ? 'flap' : 'glide';
    var img = birdImages[key];
    if (!img) return;
    var tilt = state === 'play'
      ? Math.max(-0.45, Math.min(1.05, bird.vy * 0.06))
      : Math.sin(frame * 0.06) * 0.06;
    var w = img.width * BIRD_SCALE;
    var h = img.height * BIRD_SCALE;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt);
    ctx.drawImage(img, -w / 2, -h / 2 + 2, w, h);
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
      drawText('P I X E L  S T R E E T', W / 2, H * 0.16 + 50, 10, '#b0885a', 0);
      drawText('点击 / 空格 开始', W / 2, H * 0.62, 18, '#fff', 5);
      if (best > 0) drawText('最高分 ' + best, W / 2, H * 0.62 + 30, 14, '#fff', 4);
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

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    drawScene();
    drawPipes();
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

  // ===== 输入 =====
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
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
