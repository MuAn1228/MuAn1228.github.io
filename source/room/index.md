---
title: 博客小屋
aside: false
---

<section id="blog-room" aria-labelledby="br-heading" data-period="day">
  <div class="br-heading-row">
    <div><p class="br-eyebrow">MU AN'S ROOM / 01</p><h2 id="br-heading">把日常，放进一间房。</h2><p class="br-intro">音乐、书、旅途和写代码的日子，都在这里。随便坐坐。</p></div>
    <div class="br-clock"><span id="br-period">小屋等你来探索</span><time id="br-time" aria-label="上海时间"></time><span class="br-clock-zone">杭州 · UTC+8</span></div>
  </div>
  <div class="br-scene" aria-label="书房互动物件">
    <div id="br-art" aria-hidden="true"><img src="/img/room/room.svg" alt="" width="960" height="760"></div>
    <div class="br-hotspots">
      <button class="br-hotspot" type="button" data-object="music" aria-label="探索唱片机" aria-controls="br-detail" aria-expanded="false" style="left:28%;top:70%" hidden><span class="br-hotspot-dot">01</span><span class="br-hotspot-label">唱片机</span></button>
      <button class="br-hotspot" type="button" data-object="arcade" aria-label="探索游戏机" aria-controls="br-detail" aria-expanded="false" style="left:71%;top:70%" hidden><span class="br-hotspot-dot">02</span><span class="br-hotspot-label">游戏机</span></button>
      <button class="br-hotspot" type="button" data-object="books" aria-label="探索书架" aria-controls="br-detail" aria-expanded="false" style="left:25%;top:43%" hidden><span class="br-hotspot-dot">03</span><span class="br-hotspot-label">书架</span></button>
      <button class="br-hotspot" type="button" data-object="travel" aria-label="探索照片墙" aria-controls="br-detail" aria-expanded="false" style="left:43%;top:30%" hidden><span class="br-hotspot-dot">04</span><span class="br-hotspot-label">照片墙</span></button>
      <button class="br-hotspot" type="button" data-object="work" aria-label="探索电脑" aria-controls="br-detail" aria-expanded="false" style="left:64%;top:48%" hidden><span class="br-hotspot-dot">05</span><span class="br-hotspot-label">电脑</span></button>
    </div>
    <p class="br-scene-note">一个人的小世界，欢迎你来逛逛。</p>
  </div>
  <p id="br-art-status" class="br-status" role="status"></p>
  <button id="br-retry" class="br-retry" type="button" hidden>重新加载插画</button>
  <p id="br-selection-status" class="br-sr-only" role="status"></p>
  <div class="br-bottom">
    <nav class="br-objects" aria-label="选择书房物件">
      <a href="/fun/music/" data-object="music" aria-controls="br-detail" class="br-shortcut"><span>01</span>唱片机</a>
      <a href="/fun/arcade/" data-object="arcade" aria-controls="br-detail" class="br-shortcut"><span>02</span>游戏机</a>
      <a href="/fun/books/" data-object="books" aria-controls="br-detail" class="br-shortcut"><span>03</span>书架</a>
      <a href="/travel/" data-object="travel" aria-controls="br-detail" class="br-shortcut"><span>04</span>照片墙</a>
      <a href="/showcase/" data-object="work" aria-controls="br-detail" class="br-shortcut"><span>05</span>电脑</a>
    </nav>
    <section id="br-detail" class="br-detail" aria-labelledby="br-detail-title" tabindex="-1">
      <button id="br-close" class="br-close" type="button" aria-label="收起物件介绍" hidden>×</button>
      <div class="br-detail-copy"><p id="br-detail-tag" class="br-eyebrow">MAKE YOURSELF AT HOME</p><h3 id="br-detail-title">欢迎，随便坐坐。</h3><p id="br-detail-description">选一件物品，看看它背后的故事。这里的每扇小门，都通向博客里的一角。</p><p id="br-music-status" class="br-music-status" role="status">唱片机安静地等着下一首歌。</p></div>
      <a id="br-enter" class="br-enter" hidden>进去看看 <span aria-hidden="true">↗</span></a>
    </section>
  </div>
  <p class="br-help">点选物件查看介绍，再进入对应页面。也可以用 Tab 选择、Enter 确认；Esc 收起介绍。小屋光线随上海时间变化。</p>
</section>

<script src="/js/blog-room.js?v=1"></script>
