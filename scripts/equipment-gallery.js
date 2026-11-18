'use strict';

// Render the collection at build time: images, names and official links also
// remain available when JavaScript is disabled or a network request fails.
const fs = require('node:fs');
const path = require('node:path');
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

hexo.extend.tag.register('equipment_gallery', function () {
  const collection = JSON.parse(fs.readFileSync(path.join(hexo.source_dir, 'data/equipment.json'), 'utf8'));
  const items = collection.items;
  const number = value => String(value).padStart(2, '0');
  const categories = collection.categories;
  const categoryName = id => categories.find(category => category.id === id).name;
  const image = (item, eager) => `<img class="eq-product-img no-lightbox" src="${escape(item.image)}" alt="${escape(item.name + (item.color ? ' · ' + item.color : ''))} 官方产品图" width="1000" height="1000" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}>`;
  const featured = items.filter(item => item.featured);
  const first = featured[0];
  const cards = items.map((item, index) => `
    <article class="eq-card" data-equipment-card="${escape(item.id)}" data-category="${escape(item.category)}">
      <div class="eq-card-top"><span>${escape(item.brand)}</span><span class="eq-card-number">${number(index + 1)}</span></div>
      <button class="eq-card-stage" type="button" data-equipment="${escape(item.id)}" data-eq-tilt aria-label="查看 ${escape(item.name)} 详情">
        <span class="eq-card-halo" aria-hidden="true"></span>${image(item, false)}${item.model ? '<span class="eq-model-badge">官方 3D</span>' : ''}<span class="eq-expand" aria-hidden="true">↗</span>
      </button>
      <div class="eq-card-info"><span class="eq-category-label">${escape(categoryName(item.category))}</span>
        <h3><button type="button" data-equipment="${escape(item.id)}">${escape(item.name)}</button></h3>
        <p>${escape(item.note)}</p><div class="eq-card-bottom"><span>${escape(item.tags.join(' / '))}</span><a href="${escape(item.officialUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(item.name)} 官方资料">官方 ↗</a></div>
      </div>
    </article>`).join('');
  return `<div id="equipment-gallery">
    <section class="eq-hero" aria-labelledby="eq-title">
      <div class="eq-hero-copy"><p class="eq-eyebrow">数码 · 影像 · 创作</p><h2 class="eq-hero-heading" id="eq-title">把热爱，<br>装进<span>日常。</span></h2>
        <p class="eq-intro">桌面上的灵感，背包里的远方。<br>那些陪我创作、记录和探索的小伙伴。</p>
        <a class="eq-collection-link" href="#eq-collection">逛逛我的装备 <span aria-hidden="true">↓</span></a>
        <div class="eq-hero-meta"><span><b>${number(items.length)}</b> 件装备</span><span><b>${number(categories.length)}</b> 种日常</span></div>
      </div>
      <div class="eq-exhibit">
        <div class="eq-exhibit-head"><span>日常里的小伙伴</span><span class="eq-spot-count">01 / ${number(featured.length)}</span></div>
        <button class="eq-hero-stage" data-equipment="${escape(first.id)}" data-eq-tilt type="button" aria-label="查看 ${escape(first.name)} 详情">
          <span class="eq-orbit eq-orbit-one" aria-hidden="true"></span><span class="eq-orbit eq-orbit-two" aria-hidden="true"></span><span class="eq-exhibit-word" aria-hidden="true">${escape(first.scene)}</span>
          ${image(first, true)}<span class="eq-stage-hint"><i aria-hidden="true">＋</i> 近距离看看</span>
        </button>
        <div class="eq-exhibit-caption"><div><span class="eq-spot-brand">${escape(first.brand)}</span><h3 class="eq-spot-name">${escape(first.name)}</h3></div><span class="eq-spot-note">${escape(first.sceneLabel)}</span></div>
        <div class="eq-spot-tabs" aria-label="切换主视觉设备">${featured.map((item, index) => `<button type="button" data-spotlight="${escape(item.id)}" aria-pressed="${index === 0}"><span>${number(index + 1)}</span> ${escape(item.sceneLabel)}</button>`).join('')}</div>
      </div>
    </section>
    <section class="eq-collection" id="eq-collection" aria-labelledby="eq-collection-title">
      <div class="eq-section-heading"><div><p class="eq-eyebrow">记录生活，也记录热爱</p><h2 id="eq-collection-title">我的装备架</h2></div><p class="eq-result-count" aria-live="polite">共 ${items.length} 件装备</p></div>
      <div class="eq-filter-row"><div class="eq-filters" role="group" aria-label="按设备用途筛选"><button type="button" data-filter="all" aria-pressed="true">全部 <span>${number(items.length)}</span></button>${categories.map(category => `<button type="button" data-filter="${escape(category.id)}" aria-pressed="false">${escape(category.name)} <span>${number(items.filter(item => item.category === category.id).length)}</span></button>`).join('')}</div><span class="eq-filter-note">小物件，也有大乐趣。</span></div>
      <div class="eq-grid">${cards}</div>
      <noscript><p>设备详情可通过每张卡片的「官方」链接查看。</p></noscript>
    </section>
    <footer class="eq-colophon"><div><span class="eq-eyebrow">记录技术，也记录生活</span><p>工具各有分工，生活由自己定义。</p></div><p>产品图片来自品牌官方资料<br>未注明的配色以官方示意为准</p><a href="#eq-title" aria-label="回到装备页顶部">↑</a></footer>
    <dialog class="eq-dialog" aria-labelledby="eq-detail-name"><div class="eq-detail-shell">
      <button class="eq-close" type="button" aria-label="关闭设备详情">×</button>
      <div class="eq-detail-visual"><div class="eq-view-modes" hidden role="group" aria-label="设备展示方式"><button type="button" data-view="image" aria-pressed="true">官方图片</button><button type="button" data-view="model" aria-pressed="false">官方 3D ↻</button></div><div class="eq-detail-image-wrap" data-eq-tilt><img class="eq-product-img no-lightbox" src="${escape(first.image)}" alt="" width="1000" height="1000" loading="lazy"></div><p class="eq-model-status" role="status"></p><div class="eq-detail-controls"><button type="button" data-step="-1" aria-label="上一件设备">←</button><button type="button" class="eq-zoom" aria-pressed="false">放大图片 ＋</button><button type="button" data-step="1" aria-label="下一件设备">→</button></div><span class="eq-detail-index"></span></div>
      <div class="eq-detail-copy"><p class="eq-eyebrow eq-detail-brand"></p><span class="eq-category-label eq-detail-category"></span><h2 id="eq-detail-name"></h2><p class="eq-detail-note"></p><dl class="eq-specs"></dl><p class="eq-detail-source-note"></p><a class="eq-official-link" target="_blank" rel="noopener noreferrer">查看官方资料 <span aria-hidden="true">↗</span></a><p class="eq-detail-footnote">图片为官方展示配色，具体配置以实际设备为准。</p></div>
    </div></dialog>
    <script type="application/json" id="eq-data">${JSON.stringify(collection).replace(/</g, '\\u003c')}</script>
  </div>`;
});
