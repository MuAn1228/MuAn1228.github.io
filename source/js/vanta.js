// ===== Vanta.js 飞鸟动态背景（仅首页横幅） =====
(function () {
  if (!window.VANTA || !window.THREE) return;
  var el = document.querySelector('#page-header.full_page');
  if (!el) return;
  VANTA.BIRDS({
    el: el,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.00,
    minWidth: 200.00,
    scale: 1.00,
    scaleMobile: 1.00,
    backgroundColor: 0x1a1a2e,
    color1: 0xffffff,
    color2: 0x4facfe,
    birdSize: 1.0,
    wingSpan: 20.0,
    speedLimit: 5.0,
    separation: 30.0,
    alignment: 30.0,
    cohesion: 20.0,
    quantity: 2.5
  });
})();
