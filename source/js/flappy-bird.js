// ===== Flappy Bird 小游戏（canvas 自包含，挂载于 /fun/arcade/） =====
(function () {
  var host = document.getElementById('arcade-flappy');
  if (!host) return;

  var W = 420, H = 560, GROUND = 80;
  var GRAVITY = 0.45, FLAP = -7.6;
  var PIPE_W = 64, PIPE_GAP = 150, PIPE_SPACING = 220, SPEED = 2.6;

  var canvas = document.createElement('canvas');
  canvas.className = 'arcade-flappy-canvas';
  canvas.width = W;
  canvas.height = H;
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var state = 'ready'; // ready | play | over
  var bird, pipes, score, best = 0, frame = 0, groundX = 0;
  try { best = parseInt(localStorage.getItem('arcade-flappy-best'), 10) || 0; } catch (e) { best = 0; }

  function reset() {
    bird = { x: W * 0.3, y: H * 0.45, vy: 0, r: 14, wing: 0 };
    pipes = [];
    score = 0;
    frame = 0;
  }
  reset();

  function spawnPipe(x) {
    var margin = 60;
    var gy = margin + Math.random() * (H - GROUND - margin * 2 - PIPE_GAP);
    pipes.push({ x: x, gy: gy, passed: false });
  }

  function flap() {
    if (state === 'ready') {
      state = 'play';
      spawnPipe(W + 100);
    }
    if (state === 'play') {
      bird.vy = FLAP;
      bird.wing = 8;
    } else if (state === 'over') {
      reset();
      state = 'ready';
    }
  }

  function gameOver() {
    state = 'over';
    if (score > best) {
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

      groundX = (groundX - SPEED) % 24;
    } else if (state === 'ready') {
      // 待机时轻微浮动
      bird.y = H * 0.45 + Math.sin(frame * 0.06) * 6;
      groundX = (groundX - SPEED) % 24;
    }
  }

  // ===== 绘制 =====
  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#70c5ce');
    g.addColorStop(1, '#b8e6ea');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 云
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (var i = 0; i < 3; i++) {
      var cx = ((frame * 0.3 + i * 160) % (W + 120)) - 60;
      var cy = 70 + i * 55;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy - 8, 22, 0, Math.PI * 2);
      ctx.arc(cx + 44, cy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      var grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      grad.addColorStop(0, '#5cb85c');
      grad.addColorStop(0.5, '#8fd98f');
      grad.addColorStop(1, '#4a9d4a');
      ctx.fillStyle = grad;
      // 上管
      ctx.fillRect(p.x, 0, PIPE_W, p.gy);
      ctx.fillRect(p.x - 4, p.gy - 24, PIPE_W + 8, 24);
      // 下管
      ctx.fillRect(p.x, p.gy + PIPE_GAP, PIPE_W, H - GROUND - p.gy - PIPE_GAP);
      ctx.fillRect(p.x - 4, p.gy + PIPE_GAP, PIPE_W + 8, 24);
    }
  }

  function drawGround() {
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, H - GROUND, W, 12);
    ctx.fillStyle = '#5a9e22';
    for (var x = groundX; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, H - GROUND + 12);
      ctx.lineTo(x + 12, H - GROUND);
      ctx.lineTo(x + 24, H - GROUND + 12);
      ctx.fill();
    }
  }

  function drawBird() {
    var b = bird;
    ctx.save();
    ctx.translate(b.x, b.y);
    var tilt = Math.max(-0.4, Math.min(1.1, b.vy * 0.06));
    if (state !== 'play') tilt = 0;
    ctx.rotate(tilt);
    // 身体
    ctx.fillStyle = '#f7d51d';
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r + 2, b.r, 0, 0, Math.PI * 2);
    ctx.fill();
    // 翅膀
    ctx.fillStyle = '#f5a623';
    ctx.beginPath();
    var wy = b.wing > 0 ? -4 : 2;
    ctx.ellipse(-4, wy, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(7.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.fillStyle = '#e8574a';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(22, 3);
    ctx.lineTo(12, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawText(text, x, y, size, color) {
    ctx.font = 'bold ' + size + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawUI() {
    if (state === 'play') {
      drawText(String(score), W / 2, 70, 40, '#fff');
    } else if (state === 'ready') {
      drawText('Flappy Bird', W / 2, H * 0.24, 34, '#fff');
      drawText('点击 / 空格 开始', W / 2, H * 0.62, 18, '#fff');
      if (best > 0) drawText('最高分 ' + best, W / 2, H * 0.62 + 30, 14, 'rgba(255,255,255,0.85)');
    } else if (state === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      drawText('游戏结束', W / 2, H * 0.32, 34, '#fff');
      drawText('得分 ' + score, W / 2, H * 0.44, 24, '#ffd700');
      drawText('最高分 ' + best, W / 2, H * 0.44 + 34, 16, '#fff');
      drawText('点击重新开始', W / 2, H * 0.62, 16, 'rgba(255,255,255,0.85)');
    }
  }

  function render() {
    drawBg();
    drawPipes();
    drawGround();
    drawBird();
    drawUI();
  }

  // ===== 主循环（面板隐藏时暂停） =====
  function loop() {
    if (host.offsetParent !== null) {
      update();
      render();
    }
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
