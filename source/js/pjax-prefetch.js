// ===== pjax 预取：悬停/聚焦站内链接时低优先级预取页面 =====
// 站点用 pjax(cacheBust:false) 单页切换。切换瞬间会 fetch 新页面并渲染，
// 网络并发骤增会挤占正在播放的音频缓冲，导致切页时声音中断、页面轻微卡顿。
// 通过在鼠标悬停/聚焦时提前 <link rel=prefetch>，把 fetch 提前到空闲时段，
// 让真实切换时直接从缓存命中，降低瞬时峰值。prefetch 优先级低，不会抢音频实时流。
(function () {
  // 不支持 prefetch 的浏览器直接跳过
  var probe = document.createElement('link');
  if (!('relList' in probe) || !probe.relList.supports) return;
  try {
    if (!probe.relList.supports('prefetch')) return;
  } catch (e) { return; }

  // 不预取：外链、带查询参数/锚点的链、以及二进制/大文件
  var skipQueryHash = /[?#]/;
  var skipExt = /\.(jpg|jpeg|png|webp|gif|svg|mp3|mp4|pdf|zip|gz|css|js|json)$/i;

  var used = {};

  function prefetch(pageUrl) {
    if (!pageUrl || used[pageUrl] || skipQueryHash.test(pageUrl) || skipExt.test(pageUrl)) return;
    used[pageUrl] = true;
    try {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = pageUrl;
      document.head.appendChild(link);
    } catch (e) {}
  }

  function onHover(e) {
    var target = e.target;
    var a = target && target.closest ? target.closest('a[href]') : null;
    if (!a) return;
    var href = a.href;
    if (!href || href.indexOf(location.origin) !== 0) return; // 仅站内
    // 去掉锚点后整体预取（页面内锚点仍是同一个文档）
    prefetch(href.split('#')[0]);
  }

  document.addEventListener('mouseover', onHover, { passive: true });
  document.addEventListener('focusin', onHover);
})();