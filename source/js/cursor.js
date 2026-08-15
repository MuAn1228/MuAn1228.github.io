// ===== 渐变光点光标（紫粉渐变 + 柔光晕） =====
(function () {
  var dot = document.createElement('div');
  var ring = document.createElement('div');

  var base = 'position:fixed;top:0;left:0;pointer-events:none;border-radius:50%;z-index:99999;transform:translate(-50%,-50%);';

  // 渐变光点
  dot.style.cssText = base +
    'width:10px;height:10px;' +
    'background:radial-gradient(circle,#f093fb 0%,#a18cd1 100%);' +
    'box-shadow:0 0 10px rgba(240,147,251,0.9),0 0 22px rgba(161,140,209,0.6);';

  // 柔和光环
  ring.style.cssText = base +
    'width:32px;height:32px;' +
    'border:2px solid rgba(240,147,251,0.55);' +
    'box-shadow:0 0 12px rgba(240,147,251,0.35);';

  document.body.appendChild(dot);
  document.body.appendChild(ring);

  var mx = -100, my = -100, rx = -100, ry = -100;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
  });

  (function loop() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(loop);
  })();
})();
