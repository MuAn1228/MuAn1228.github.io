---
title: 旅行
---

<div id="travel-reel" class="travel-reel"></div>

<link rel="stylesheet" href="/lib/leaflet/leaflet.css">

<section id="travel-atlas" class="travel-atlas" aria-labelledby="travel-atlas-title">
  <header class="travel-atlas-header">
    <div class="travel-atlas-identity">
      <svg class="travel-atlas-mark" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="23"></circle>
        <circle cx="28" cy="28" r="18" stroke-dasharray="1 5"></circle>
        <path d="M28 3v8m0 34v8M3 28h8m34 0h8M15 34l8-14 5 8 5-5 8 11H15Zm8-14 1 10m4-2 3 6"></path>
        <path class="travel-mark-signal" d="m28 9 3 5-3 4-3-4 3-5Zm0 29 3 4-3 5-3-5 3-4Z"></path>
      </svg>
      <div>
        <span class="travel-atlas-kicker">旅人手记 / MU AN</span>
        <h2 id="travel-atlas-title">沐安的山海回响</h2>
        <p>走过的山河，都在这里留下回响。</p>
      </div>
    </div>
    <div class="travel-atlas-stats" aria-label="旅行统计">
      <div><strong id="travel-stat-provinces">—</strong><span>个省级足迹</span></div>
      <div><strong id="travel-stat-posts">—</strong><span>篇旅行记录</span></div>
    </div>
  </header>
  <div class="travel-map-toolbar" aria-label="地图工具">
    <div class="travel-map-views" role="group" aria-label="地图底图">
      <button type="button" data-map-view="atlas" aria-pressed="true">回响古卷</button>
      <button type="button" data-map-view="satellite" aria-pressed="false">卫星影像</button>
    </div>
    <div class="travel-map-actions" role="group" aria-label="地图视角">
      <button type="button" data-map-action="overview">山河全览</button>
      <button type="button" data-map-action="visited">寻访足迹</button>
      <button type="button" data-map-action="effects" aria-pressed="true">关闭动效</button>
      <button type="button" data-map-action="interact" aria-pressed="false">操作地图</button>
    </div>
  </div>
  <div class="travel-map-layout">
    <div class="travel-map-main">
      <div class="travel-map-stage">
        <div id="travel-map" class="travel-map star-atlas" role="region" aria-label="旅行足迹地图" aria-describedby="travel-map-help" data-map-view="atlas"></div>
        <div class="travel-map-hud">
          <span id="travel-map-focus">山河全览</span>
          <span>旅途刻印 · 循光而行</span>
        </div>
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
      <p class="travel-map-world-note">地标为旅行记忆的象征，位置按省份示意。</p>
    </div>
    <div class="travel-map-bottom">
      <div class="travel-map-footprints">
        <div class="travel-discovery-heading">
          <span class="travel-selection-label">你的探索</span>
          <strong><span id="travel-discovery-count">0</span><small> / </small><span id="travel-discovery-total">—</span></strong>
        </div>
        <p id="travel-discovery-status" role="status" aria-live="polite">选择一处足迹，唤醒第一枚旅途刻印。</p>
        <div id="travel-seals" class="travel-seals" role="group" aria-label="旅途刻印"></div>
        <p class="travel-discovery-note">刻印记录你的探索，足迹来自我的旅行。</p>
        <div class="travel-province-index">
          <span class="travel-selection-label">按省份翻阅</span>
          <div id="travel-provinces" class="travel-provinces" role="group" aria-label="已到访的省份"></div>
        </div>
      </div>
      <aside class="travel-map-detail" aria-labelledby="travel-selection-title">
        <div class="travel-detail-heading">
          <span id="travel-selection-label" class="travel-selection-label">足迹概览</span>
          <span id="travel-selection-relic" class="travel-memory-relic">回响尚未展开</span>
        </div>
        <h3 id="travel-selection-title">下一站，仍在路上</h3>
        <img id="travel-selection-cover" class="travel-memory-cover" alt="" hidden>
        <p id="travel-selection-summary">选择地图上的省份，看看留下的旅行记录。</p>
        <p id="travel-selection-quote" class="travel-memory-quote" hidden></p>
        <div id="travel-selection-posts" class="travel-selection-posts"></div>
        <a id="travel-all-posts" class="travel-all-posts" href="/categories/旅行/">全部旅行记录</a>
      </aside>
    </div>
  </div>
  <noscript><p class="travel-map-empty">开启 JavaScript 即可浏览互动地图，也可以直接查看<a href="/categories/旅行/">全部旅行记录</a>。</p></noscript>
</section>

<script src="/lib/leaflet/leaflet.js"></script>
<script src="/js/travel-world.js?v=1"></script>
<script src="/js/travel-atlas-effects.js?v=2"></script>
<script src="/js/travel-map.js?v=5"></script>
<script src="/js/travel-reel.js"></script>
