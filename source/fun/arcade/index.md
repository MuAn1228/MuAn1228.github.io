---
title: 小游戏
---

<div class="arcade-tabs">
  <button class="arcade-tab is-active" data-game="flappy" type="button">Flappy Bird</button>
  <button class="arcade-tab" data-game="rubik" type="button">魔方</button>
  <button class="arcade-tab" data-game="particles" type="button">光点地球</button>
  <button class="arcade-tab" data-game="bulletdepths" type="button">第九层事故</button>
</div>

<div id="arcade-panel-flappy" class="arcade-panel is-active">
  <div id="arcade-flappy"></div>
</div>
<div id="arcade-panel-rubik" class="arcade-panel" style="display:none;">
  <div id="arcade-rubik"></div>
</div>
<div id="arcade-panel-particles" class="arcade-panel" style="display:none;">
  <div id="particle-stage" class="particle-stage">
    <p class="particle-stage-tip">此效果需开启摄像头识别手势：握拳收拢粒子、张手散开粒子、移动手掌控制旋转。<br>仅支持 PC 网页。</p>
  </div>
</div>
<div id="arcade-panel-bulletdepths" class="arcade-panel" style="display:none;">
  <div class="arcade-bd-wrap">
    <p class="arcade-bd-tip">《第九层事故 BULLET DEPTHS》· 房间制弹幕肉鸽地牢，需要<b>键盘与鼠标</b>，仅支持 PC 网页，进度自动保存在浏览器本地。首次进入约需加载 2MB 游戏资源，请稍候。</p>
    <div class="arcade-bd-toolbar">
      <button class="arcade-bd-btn" id="arcade-bd-fullscreen" type="button">全屏游玩</button>
      <a class="arcade-bd-btn" href="https://muan1228.github.io/bullet-depths/" target="_blank" rel="noopener noreferrer" title="在新标签页打开游戏">独立页打开 ↗</a>
    </div>
    <div class="arcade-bd-frame-box" id="arcade-bd-frame-box">
      <div class="arcade-bd-loading" id="arcade-bd-loading">正在加载游戏…</div>
      <iframe id="arcade-bd-frame" title="第九层事故 BULLET DEPTHS" allow="autoplay; fullscreen; gamepad" allowfullscreen></iframe>
    </div>
  </div>
</div>

<script src="/lib/three.min.js" defer></script>
<script src="/js/rubik.js" defer></script>
<script src="/js/arcade.js?v=2"></script>
<script src="/js/flappy-bird.js?v=9"></script>
<script src="/js/gesture-particles.js"></script>
