// ===== 小游戏模块标签切换（/fun/arcade/） =====
(function () {
  var tabs = document.querySelectorAll('.arcade-tab');
  if (!tabs.length) return;
  var panels = {
    flappy: document.getElementById('arcade-panel-flappy'),
    rubik: document.getElementById('arcade-panel-rubik'),
    particles: document.getElementById('arcade-panel-particles'),
    bulletdepths: document.getElementById('arcade-panel-bulletdepths')
  };

  // —— 第九层事故：iframe 首次激活才加载（按需加载，不拖慢页面） ——
  var BD_URL = 'https://muan1228.github.io/bullet-depths/';
  var bdLoaded = false;
  function loadBulletdepths() {
    if (bdLoaded) return;
    var frame = document.getElementById('arcade-bd-frame');
    if (!frame) return;
    bdLoaded = true;
    frame.addEventListener('load', function () {
      var loading = document.getElementById('arcade-bd-loading');
      if (loading) loading.style.display = 'none';
    });
    frame.src = BD_URL;
  }
  // —— 第九层事故：全屏游玩 ——
  var bdBox = document.getElementById('arcade-bd-frame-box');
  var bdFsBtn = document.getElementById('arcade-bd-fullscreen');
  if (bdBox && bdFsBtn) {
    bdFsBtn.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
      }
      if (bdBox.requestFullscreen) bdBox.requestFullscreen();
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-game');
      tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); });
      Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].style.display = key === target ? '' : 'none';
      });
      if (target === 'bulletdepths') loadBulletdepths();
      // 切换时通知魔方脚本重新聚焦（若存在）
      window.dispatchEvent(new CustomEvent('arcade:switch', { detail: { game: target } }));
    });
  });
})();
