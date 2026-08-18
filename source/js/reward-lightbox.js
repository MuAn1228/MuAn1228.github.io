// 打赏二维码点击放大（灯箱）
(function () {
  function ensureLightbox() {
    var lb = document.getElementById('reward-lightbox');
    if (lb) return lb;

    lb = document.createElement('div');
    lb.id = 'reward-lightbox';
    lb.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);' +
      'z-index:99999;align-items:center;justify-content:center;cursor:zoom-out;';

    var img = document.createElement('img');
    img.style.cssText =
      'max-width:92vw;max-height:92vh;border-radius:10px;background:#fff;padding:6px;';

    lb.appendChild(img);
    lb.addEventListener('click', function () { lb.style.display = 'none'; });
    document.body.appendChild(lb);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') lb.style.display = 'none';
    });

    return lb;
  }

  function bind(img) {
    if (img.dataset.rewardBound) return;
    img.dataset.rewardBound = '1';
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', function () {
      var lb = ensureLightbox();
      lb.querySelector('img').src = img.src;
      lb.style.display = 'flex';
    });
  }

  function init() {
    document.querySelectorAll('img[src*="/img/reward-"]').forEach(bind);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 兼容 pjax 页面切换
  document.addEventListener('pjax:complete', init);
})();