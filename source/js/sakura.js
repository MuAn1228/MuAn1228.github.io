// ===== 樱花飘落特效 =====
(function () {
  var container = document.createElement('div');
  container.id = 'sakura-container';
  container.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:9998;overflow:hidden;';
  document.body.appendChild(container);

  var colors = ['#ffb7c5', '#ffc0cb', '#ffa07a', '#fdd0e2', '#ffd1dc'];

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function createPetal() {
    var petal = document.createElement('div');
    var startX = Math.random() * 100; // 起始横向位置（vw）
    var size = random(8, 14); // 花瓣大小
    var opacity = random(0.6, 1);
    var color = colors[Math.floor(Math.random() * colors.length)];
    var fallSpeed = random(1.5, 3.5); // 下落速度
    var swayAmp = random(20, 50); // 左右摆动幅度
    var swaySpeed = random(0.01, 0.03);
    var rotateSpeed = random(1, 3);

    petal.style.cssText =
      'position:absolute;top:-20px;left:' + startX + 'vw;' +
      'width:' + size + 'px;height:' + size * 1.2 + 'px;' +
      'background:' + color + ';' +
      'border-radius:150% 0 150% 0;' +
      'opacity:' + opacity + ';' +
      'will-change:transform,top,left;';
    container.appendChild(petal);

    var top = -20;
    var angle = random(0, 360);

    function fall() {
      top += fallSpeed;
      angle += rotateSpeed;
      var x = startX + Math.sin(top * swaySpeed) * swayAmp / 10;
      if (top > window.innerHeight + 30) {
        petal.remove();
        return;
      }
      petal.style.top = top + 'px';
      petal.style.left = x + 'vw';
      petal.style.transform = 'rotate(' + angle + 'deg)';
      requestAnimationFrame(fall);
    }
    requestAnimationFrame(fall);
  }

  // 每 300ms 生成一片，保持约 15~25 片同时存在
  setInterval(createPetal, 300);
})();
