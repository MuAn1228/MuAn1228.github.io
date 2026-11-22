---
title: 旅行
---

<div id="travel-reel" class="travel-reel"></div>

<link rel="stylesheet" href="/lib/leaflet/leaflet.css">

<section id="travel-atlas" class="travel-atlas" aria-labelledby="travel-atlas-title">
  <header class="travel-atlas-header">
    <div>
      <h2 id="travel-atlas-title">我的旅行足迹</h2>
      <p>把走过的地方，留在地图上。</p>
    </div>
    <div class="travel-atlas-stats" aria-label="旅行统计">
      <div><strong id="travel-stat-provinces">—</strong><span>个省级足迹</span></div>
      <div><strong id="travel-stat-posts">—</strong><span>篇旅行记录</span></div>
    </div>
  </header>
  <div class="travel-map-toolbar" aria-label="地图工具">
    <div class="travel-map-views" role="group" aria-label="地图底图">
      <button type="button" data-map-view="atlas" aria-pressed="true">足迹底图</button>
      <button type="button" data-map-view="satellite" aria-pressed="false">卫星影像</button>
    </div>
    <div class="travel-map-actions" role="group" aria-label="地图视角">
      <button type="button" data-map-action="overview">全国视图</button>
      <button type="button" data-map-action="visited">只看足迹</button>
      <button type="button" data-map-action="interact" aria-pressed="false">操作地图</button>
    </div>
  </div>
  <div class="travel-map-layout">
    <div class="travel-map-main">
      <div class="travel-map-stage">
        <div id="travel-map" class="travel-map" role="region" aria-label="旅行足迹地图" aria-describedby="travel-map-help" data-map-view="atlas"></div>
        <div class="travel-map-notice">
          <p id="travel-map-status" role="status" aria-live="polite">正在展开旅行地图…</p>
          <button id="travel-map-retry" type="button" hidden>重新加载</button>
        </div>
        <div class="travel-map-legend" aria-label="地图图例">
          <span><i class="travel-legend-visited" aria-hidden="true"></i>已到访</span>
          <span><i class="travel-legend-unvisited" aria-hidden="true"></i>待探索</span>
        </div>
      </div>
      <p id="travel-map-help" class="travel-map-help">点击省份查看记录；滚轮或左上角按钮缩放。</p>
      <div id="travel-provinces" class="travel-provinces" role="group" aria-label="已到访的省份"></div>
    </div>
    <aside class="travel-map-detail" aria-labelledby="travel-selection-title">
      <span id="travel-selection-label" class="travel-selection-label">足迹概览</span>
      <h3 id="travel-selection-title">下一站，仍在路上</h3>
      <p id="travel-selection-summary">选择地图上的省份，看看留下的旅行记录。</p>
      <div id="travel-selection-posts" class="travel-selection-posts"></div>
      <a id="travel-all-posts" class="travel-all-posts" href="/categories/旅行/">全部旅行记录</a>
    </aside>
  </div>
  <noscript><p class="travel-map-empty">开启 JavaScript 即可浏览互动地图，也可以直接查看<a href="/categories/旅行/">全部旅行记录</a>。</p></noscript>
</section>

<script src="/lib/leaflet/leaflet.js"></script>
<script src="/js/travel-map.js?v=3"></script>
<script src="/js/travel-reel.js"></script>
