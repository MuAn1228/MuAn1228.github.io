// ===== 页面级资源按需加载（避免重型脚本全站加载拖慢所有页面） =====
// 1) 首页独占特效（three/vanta/hero-3d/marquee/github-heatmap）只在首页加载
// 2) 非关键资源（音乐引擎 APlayer、3D 标签云 TagCanvas）在浏览器空闲时再加载
(function () {
  'use strict';

  var loaded = {};   // 已注入的脚本，防重复
  var musicQueued = false;
  var tagQueued = false;

  function loadScript(src, onLoad) {
    if (loaded[src]) { if (onLoad) onLoad(); return; }
    loaded[src] = true;
    var s = document.createElement('script');
    s.src = src;
    s.async = false; // 按顺序执行，保证依赖在前
    s.onload = onLoad;
    document.body.appendChild(s);
  }

  function onIdle(fn) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: 2500 });
    } else {
      setTimeout(fn, 50);
    }
  }

  // 首页独占特效
  function loadHomeEffects() {
    var p = window.location.pathname;
    if (p !== '/' && p !== '/index.html') return;
    [
      '/lib/three.min.js',
      '/lib/vanta.birds.min.js',
      '/js/vanta.js',
      '/js/hero-3d.js',
      '/js/marquee.js',
      '/js/github-heatmap.js'
    ].forEach(function (src) { loadScript(src); });
  }

  // 全站音乐引擎（迷你播放器 / 音乐页大播放器共用）
  function loadMusic() {
    if (musicQueued) return;
    musicQueued = true;
    loadScript('/lib/APlayer.min.js', function () {
      loadScript('/js/music-playlist.js');
    });
  }

  // 侧边栏 3D 标签云：仅当页面存在标签云卡片时加载
  function loadTagCloud() {
    if (tagQueued) return;
    if (!document.querySelector('.card-tag-cloud')) return;
    tagQueued = true;
    loadScript('/lib/tagcanvas.min.js', function () {
      loadScript('/js/tagcloud.js');
    });
  }

  function boot() {
    loadHomeEffects();
    onIdle(function () {
      loadMusic();
      loadTagCloud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // pjax 切页后重跑：回到首页时恢复特效、新页面补标签云（已加载的脚本自动跳过）
  document.addEventListener('pjax:complete', function () {
    loadHomeEffects();
    onIdle(function () {
      loadTagCloud();
    });
  });
})();
