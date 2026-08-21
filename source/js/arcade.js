// ===== 小游戏模块标签切换（/fun/arcade/） =====
(function () {
  var tabs = document.querySelectorAll('.arcade-tab');
  if (!tabs.length) return;
  var panels = {
    flappy: document.getElementById('arcade-panel-flappy'),
    rubik: document.getElementById('arcade-panel-rubik'),
    particles: document.getElementById('arcade-panel-particles')
  };

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-game');
      tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); });
      Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].style.display = key === target ? '' : 'none';
      });
      // 切换时通知魔方脚本重新聚焦（若存在）
      window.dispatchEvent(new CustomEvent('arcade:switch', { detail: { game: target } }));
    });
  });
})();
