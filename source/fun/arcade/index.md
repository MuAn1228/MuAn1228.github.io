---
title: 小游戏
---

<div class="arcade-tabs">
  <button class="arcade-tab is-active" data-game="flappy" type="button">Flappy Bird</button>
  <button class="arcade-tab" data-game="rubik" type="button">魔方</button>
  <button class="arcade-tab" data-game="particles" type="button">光点地球</button>
</div>

<div id="arcade-panel-flappy" class="arcade-panel is-active">
  <div id="arcade-flappy"></div>
</div>
<div id="arcade-panel-rubik" class="arcade-panel" style="display:none;">
  <div id="arcade-rubik"></div>
</div>
<div id="arcade-panel-particles" class="arcade-panel" style="display:none;">
  <div id="particle-stage" class="particle-stage">
    <p class="particle-stage-tip">此效果需开启摄像头识别手势：握拳收拢粒子、张手散开粒子、移动手掌控制旋转。仅支持 PC 网页。</p>
  </div>
</div>
