// ===== 移动端性能守卫（共享工具）=====
// 挂到 window.__gGuard，供各 canvas/WebGL 特效脚本调用。
// 1) isMobile(): 视口宽度 <= 768 视为手机端
// 2) pixelRatio(max): 移动端把 DPR 上限压到 1.5（省 GPU），桌面保持 max
// 3) trackVisible(el, cb): 用 IntersectionObserver + visibilitychange 维护可见状态，
//    进入/切回可见时 cb(true)，滚出/切后台时 cb(false)。兼容不支持 IO 的旧环境（默认始终可见）。
(function () {
  'use strict';

  var MOBILE_MAX = 768;
  var MOBILE_DPR = 1.5;

  function isMobile() {
    return (typeof window !== 'undefined') &&
      (window.innerWidth <= MOBILE_MAX || /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent));
  }

  function pixelRatio(max) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (isMobile() && MOBILE_DPR < max) {
      return Math.min(dpr, MOBILE_DPR);
    }
    return Math.min(dpr, max);
  }

  // 监听元素可见性，支持元素滚动出视野与标签页切后台两条路径。
  // 返回一个 stopped() 用于主动释放（可选）。
  function trackVisible(el, cb) {
    if (typeof cb !== 'function') return function () {};
    var stopped = false;

    var notify = function (visible) { if (!stopped) cb(!!visible); };

    var io = null;
    if (typeof IntersectionObserver === 'function' && typeof el.getBoundingClientRect === 'function') {
      io = new IntersectionObserver(function (entries) {
        notify((entries[0] && entries[0].isIntersecting) !== false);
      }, { threshold: [0, 0.15] });
      io.observe(el);
    }

    var onVis = function () { notify(document.visibilityState !== 'hidden'); };
    document.addEventListener('visibilitychange', onVis);
    notify(document.visibilityState !== 'hidden');

    return function stopped() {
      stopped = true;
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }

  window.__gGuard = { isMobile: isMobile, pixelRatio: pixelRatio, trackVisible: trackVisible };
})();