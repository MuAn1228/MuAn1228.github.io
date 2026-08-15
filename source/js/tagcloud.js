// ===== 3D 旋转标签云（TagCanvas） =====
(function () {
  if (!window.TagCanvas) return;

  function initTagCloud() {
    var cloud = document.querySelector('.card-tag-cloud');
    if (!cloud || cloud.dataset.tagcanvas) return;

    cloud.dataset.tagcanvas = '1';
    cloud.id = 'myTags';

    var canvas = document.createElement('canvas');
    canvas.id = 'myTagCanvas';
    canvas.width = 260;
    canvas.height = 260;
    canvas.style.cssText = 'max-width:100%;';
    cloud.parentNode.appendChild(canvas);

    try {
      TagCanvas.Start('myTagCanvas', 'myTags', {
        textColour: '#6b5b95',
        outlineColour: '#f093fb',
        reverse: true,
        depth: 0.8,
        maxSpeed: 0.06,
        initial: [0.1, -0.1],
        weight: true,
        weightMode: 'size',
        wheelZoom: false,
        dragControl: true,
        clickToFront: 500
      });
    } catch (e) {
      console.error('TagCanvas 初始化失败:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTagCloud);
  } else {
    initTagCloud();
  }
})();
