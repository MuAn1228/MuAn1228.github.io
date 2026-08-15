// ===== 音乐播放器折叠开关 =====
// APlayer 由 Meting.js 异步创建，轮询等待出现后加一个左下角圆形按钮，点击切换 body.music-collapsed
(function () {
  function addToggle() {
    var btn = document.createElement('button');
    btn.className = 'music-toggle';
    btn.innerHTML = '<i class="fas fa-music"></i>';
    btn.title = '收起 / 展开音乐播放器';
    document.body.appendChild(btn);
    btn.addEventListener('click', function () {
      document.body.classList.toggle('music-collapsed');
    });
  }

  function init() {
    var tries = 0;
    var timer = setInterval(function () {
      var player = document.querySelector('.aplayer.aplayer-fixed');
      if (player) {
        clearInterval(timer);
        addToggle();
      } else if (++tries > 30) {
        clearInterval(timer);
      }
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
