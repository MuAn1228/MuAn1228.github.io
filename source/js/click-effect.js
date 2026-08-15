// ===== 点击特效：NH₄⁺ + 粉色爱心爆炸 + 核心价值观光影文字 =====
(function () {
  var CORE = ['富强', '民主', '文明', '和谐', '自由', '平等', '公正', '法治', '爱国', '敬业', '诚信', '友善'];

  function heartSVG(size) {
    return '<svg viewBox="0 0 32 29.6" width="' + size + '" height="' + Math.round(size * 0.92) + '" style="fill:none;stroke:#ff69b4;stroke-width:2;stroke-linejoin:round;">'
      + '<path d="M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z"/></svg>';
  }

  document.addEventListener('click', function (e) {
    var x = e.clientX, y = e.clientY;

    // 1. NH₄⁺ 中心文字（渐变光影，爆炸核心）
    var nh = document.createElement('div');
    nh.textContent = 'NH₄⁺';
    nh.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;pointer-events:none;z-index:9999;'
      + 'font-size:26px;font-weight:700;letter-spacing:1px;'
      + 'background:linear-gradient(135deg,#ffd700,#ff69b4,#a18cd1,#4facfe);'
      + '-webkit-background-clip:text;-webkit-text-fill-color:transparent;'
      + 'filter:drop-shadow(0 0 8px rgba(255,105,180,0.9)) drop-shadow(0 0 18px rgba(161,140,209,0.6));'
      + 'transform:translate(-50%,-50%) scale(0.5);';
    document.body.appendChild(nh);
    var nScale = 0.5, nFade = 1;
    (function stepNH() {
      nScale = Math.min(nScale + 0.04, 1.25);
      nFade -= 0.028;
      if (nFade <= 0) { nh.remove(); return; }
      nh.style.transform = 'translate(-50%,-50%) scale(' + nScale + ')';
      nh.style.opacity = nFade;
      requestAnimationFrame(stepNH);
    })();

    // 2. 爱心爆炸（16 颗粉色线条爱心四散）
    var count = 16;
    for (let i = 0; i < count; i++) {
      let p = document.createElement('div');
      let angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.7;
      let speed = 4 + Math.random() * 5;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      let px = x, py = y, op = 1;
      p.innerHTML = heartSVG(10 + Math.random() * 8);
      p.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:9998;';
      document.body.appendChild(p);
      (function step() {
        vx *= 0.96;
        vy = vy * 0.96 + 0.18;
        px += vx;
        py += vy;
        op -= 0.02;
        if (op <= 0) { p.remove(); return; }
        p.style.transform = 'translate(' + px + 'px,' + py + 'px)';
        p.style.opacity = op;
        requestAnimationFrame(step);
      })();
    }

    // 3. 核心价值观光影文字（渐变描金 + 光晕）
    var word = CORE[Math.floor(Math.random() * CORE.length)];
    var txt = document.createElement('div');
    txt.textContent = word;
    txt.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;pointer-events:none;z-index:9997;'
      + 'font-size:18px;font-weight:700;letter-spacing:2px;'
      + 'background:linear-gradient(135deg,#ffd700,#ff69b4,#a18cd1,#4facfe);'
      + '-webkit-background-clip:text;-webkit-text-fill-color:transparent;'
      + 'filter:drop-shadow(0 0 6px rgba(255,105,180,0.8));'
      + 'transform:translate(-50%,-50%) scale(0.6);';
    document.body.appendChild(txt);

    var ty = y, fade = 1, tscale = 0.6;
    (function stepTxt() {
      ty -= 1.4;
      fade -= 0.02;
      tscale = Math.min(tscale + 0.025, 1.15);
      if (fade <= 0) { txt.remove(); return; }
      txt.style.top = ty + 'px';
      txt.style.opacity = fade;
      txt.style.transform = 'translate(-50%,-50%) scale(' + tscale + ')';
      requestAnimationFrame(stepTxt);
    })();
  });
})();
