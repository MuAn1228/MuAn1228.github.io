// ===== 简介描述打字机效果（模拟终端输入） =====
(function () {
  var el = document.querySelector('.author-info-description');
  if (!el) return;
  var text = el.textContent.trim();
  if (!text) return;
  el.textContent = '';
  var i = 0;
  (function type() {
    if (i < text.length) {
      el.textContent = text.slice(0, i + 1) + '▋';
      i++;
      setTimeout(type, 70);
    } else {
      el.textContent = text;
    }
  })();
})();
