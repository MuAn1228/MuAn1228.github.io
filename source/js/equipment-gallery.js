// Equipment-only interactions. All collection content is rendered by Hexo.
(function () {
  'use strict';
  if (window.__blogEquipmentGallery) {
    window.__blogEquipmentGallery.init();
    return;
  }
  var cleanup = function () {};
  var viewerReady = null;

  function loadViewer() {
    if (!viewerReady) {
      viewerReady = import('/lib/model-viewer/model-viewer.min.js?v=4.1.0').catch(function (error) {
        viewerReady = null;
        throw error;
      });
    }
    return viewerReady;
  }

  function init() {
    cleanup();
    var root = document.getElementById('equipment-gallery');
    if (!root) return;
    var data;
    try { data = JSON.parse(root.querySelector('#eq-data').textContent); }
    catch (error) { return; }
    var items = data.items;
    var byId = Object.create(null);
    items.forEach(function (item) { byId[item.id] = item; });
    var categories = data.categories;
    var cards = Array.from(root.querySelectorAll('[data-equipment-card]'));
    var filters = Array.from(root.querySelectorAll('[data-filter]'));
    var dialog = root.querySelector('.eq-dialog');
    var currentItem = null;
    var detailSequence = [];
    var returnFocus = null;
    var activeCategory = 'all';
    var hero = root.querySelector('.eq-hero-stage');
    var spotlightIndex = 0;
    var spotButtons = Array.from(root.querySelectorAll('[data-spotlight]'));
    var imageWrap = root.querySelector('.eq-detail-image-wrap');
    var zoomButton = root.querySelector('.eq-zoom');
    var modelViewer = null;
    var modelRequest = 0;
    var cleanups = [];
    var frame = 0;
    var tilted = null;
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function listen(target, name, fn, options) {
      target.addEventListener(name, fn, options);
      cleanups.push(function () { target.removeEventListener(name, fn, options); });
    }
    function text(selector, value) { root.querySelector(selector).textContent = value || ''; }
    function number(value) { return String(value).padStart(2, '0'); }
    function visibleItems() {
      return items.filter(function (item) { return activeCategory === 'all' || item.category === activeCategory; });
    }
    function resetTilt() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (tilted) {
        tilted.style.removeProperty('--eq-rx');
        tilted.style.removeProperty('--eq-ry');
        tilted = null;
      }
    }
    function applyFilter(category, updateUrl) {
      activeCategory = categories.some(function (entry) { return entry.id === category; }) ? category : 'all';
      cards.forEach(function (card) { card.hidden = activeCategory !== 'all' && card.dataset.category !== activeCategory; });
      filters.forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.filter === activeCategory)); });
      text('.eq-result-count', '共 ' + visibleItems().length + ' 件装备');
      if (updateUrl) {
        var url = new URL(window.location.href);
        if (activeCategory === 'all') url.searchParams.delete('category');
        else url.searchParams.set('category', activeCategory);
        window.history.replaceState(window.history.state, '', url.href);
      }
      resetTilt();
    }
    function readFilter() { applyFilter(new URL(window.location.href).searchParams.get('category'), false); }
    function spotlight(id) {
      var item = byId[id];
      if (!item) return;
      spotlightIndex = items.indexOf(item);
      hero.dataset.equipment = id;
      hero.setAttribute('aria-label', '查看 ' + item.name + ' 详情');
      var image = hero.querySelector('img');
      image.src = item.image;
      image.alt = item.name + (item.color ? ' · ' + item.color : '') + ' 官方产品图';
      text('.eq-spot-brand', item.brand);
      text('.eq-spot-name', item.name);
      text('.eq-spot-note', categories.find(function (category) { return category.id === item.category; }).name);
      spotButtons.forEach(function (tab) { tab.setAttribute('aria-pressed', String(tab.dataset.spotlight === id)); });
      text('.eq-spot-count', number(spotlightIndex + 1) + ' / ' + number(items.length));
      resetTilt();
    }
    function stepSpotlight(direction) {
      spotlight(items[(spotlightIndex + direction + items.length) % items.length].id);
    }
    function unzoom() {
      imageWrap.classList.remove('is-zoomed');
      zoomButton.setAttribute('aria-pressed', 'false');
      zoomButton.textContent = '放大图片 ＋';
    }
    function resetViewer() {
      modelRequest++;
      if (modelViewer) modelViewer.remove();
      modelViewer = null;
      imageWrap.classList.remove('is-model');
      imageWrap.querySelector('img').hidden = false;
      zoomButton.hidden = false;
      root.querySelectorAll('[data-view]').forEach(function (button) {
        button.disabled = false;
        button.setAttribute('aria-pressed', String(button.dataset.view === 'image'));
      });
      text('.eq-model-status', '');
    }
    function showModel() {
      if (!currentItem || !currentItem.model || modelViewer) return;
      var item = currentItem;
      var request = ++modelRequest;
      var modelButton = root.querySelector('[data-view="model"]');
      modelButton.disabled = true;
      text('.eq-model-status', '正在加载官方 3D 模型…');
      loadViewer().then(function () {
        if (request !== modelRequest || !root.isConnected || !dialog.open || currentItem !== item) return;
        var viewer = document.createElement('model-viewer');
        modelViewer = viewer;
        viewer.setAttribute('src', item.model);
        viewer.setAttribute('alt', item.name + ' 官方三维模型，可拖动旋转和缩放');
        viewer.setAttribute('camera-controls', '');
        viewer.setAttribute('touch-action', 'pan-y');
        viewer.setAttribute('interaction-prompt', 'none');
        viewer.setAttribute('shadow-intensity', '1');
        viewer.setAttribute('camera-orbit', '30deg 65deg 105%');
        viewer.addEventListener('load', function () {
          if (request !== modelRequest) return;
          modelButton.disabled = false;
          text('.eq-model-status', '拖动旋转 · 滚轮或双指缩放');
        }, { once: true });
        viewer.addEventListener('error', function () {
          if (request !== modelRequest) return;
          resetViewer();
          text('.eq-model-status', '3D 暂不可用，可以查看官方图片或重试。');
        }, { once: true });
        unzoom();
        resetTilt();
        imageWrap.querySelector('img').hidden = true;
        imageWrap.classList.add('is-model');
        zoomButton.hidden = true;
        root.querySelectorAll('[data-view]').forEach(function (button) {
          button.setAttribute('aria-pressed', String(button.dataset.view === 'model'));
        });
        imageWrap.appendChild(viewer);
      }).catch(function () {
        if (request !== modelRequest || !root.isConnected) return;
        resetViewer();
        text('.eq-model-status', '3D 暂不可用，可以查看官方图片或重试。');
      });
    }
    function showItem(id, opener) {
      var item = byId[id];
      if (!item) return;
      if (typeof dialog.showModal !== 'function') {
        window.open(item.officialUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      currentItem = item;
      resetViewer();
      root.querySelector('.eq-view-modes').hidden = !item.model;
      var modelButton = root.querySelector('[data-view="model"]');
      modelButton.textContent = item.modelSize ? '官方 3D · ' + item.modelSize : '官方 3D ↻';
      modelButton.title = item.modelSize ? '点击后加载约 ' + item.modelSize + ' 的官方模型' : '点击后加载官方模型';
      imageWrap.dataset.item = id;
      unzoom();
      resetTilt();
      text('.eq-detail-brand', item.brand);
      text('.eq-detail-category', categories.find(function (category) { return category.id === item.category; }).name);
      text('#eq-detail-name', item.name);
      text('.eq-detail-note', item.description || item.note);
      text('.eq-config-note', item.configNote);
      text('.eq-detail-source-note', item.sourceNote);
      text('.eq-detail-footnote', item.color ? '图片配色：' + item.color + '。未注明的硬件配置以实物为准。' : '图片为官方展示配色，具体配置以实际设备为准。');
      if (!dialog.open) {
        detailSequence = visibleItems();
        // Keep the initial sequence until close, including when a spotlight
        // item lies outside the selected category.
        if (detailSequence.indexOf(item) === -1) detailSequence = items;
      }
      text('.eq-detail-index', number(detailSequence.indexOf(item) + 1) + ' / ' + number(detailSequence.length));
      var image = imageWrap.querySelector('img');
      image.src = item.image;
      image.alt = item.name + (item.color ? ' · ' + item.color : '') + ' 官方产品图';
      var specs = root.querySelector('.eq-specs');
      specs.replaceChildren();
      item.specs.forEach(function (spec) {
        var row = document.createElement('div');
        var term = document.createElement('dt');
        var description = document.createElement('dd');
        term.textContent = spec.label;
        description.textContent = spec.value;
        row.append(term, description);
        specs.appendChild(row);
      });
      var sourceLinks = root.querySelector('.eq-spec-sources');
      sourceLinks.replaceChildren();
      (item.specSources || []).forEach(function (source) {
        if (!/^https?:\/\//i.test(source.url)) return;
        var link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title;
        sourceLinks.appendChild(link);
      });
      root.querySelector('.eq-spec-provenance').hidden = sourceLinks.children.length === 0;
      root.querySelector('.eq-detail-copy').scrollTop = 0;
      dialog.scrollTop = 0;
      var official = root.querySelector('.eq-official-link');
      official.href = item.officialUrl;
      official.setAttribute('aria-label', '查看 ' + item.name + ' 官方资料（新窗口）');
      if (!dialog.open) {
        returnFocus = opener || document.activeElement;
        dialog.showModal();
        document.documentElement.classList.add('eq-modal-open');
        root.querySelector('.eq-close').focus();
      }
    }
    function step(direction) {
      if (!currentItem) return;
      var index = (detailSequence.indexOf(currentItem) + direction + detailSequence.length) % detailSequence.length;
      showItem(detailSequence[index].id);
    }
    function onClose() {
      document.documentElement.classList.remove('eq-modal-open');
      currentItem = null;
      detailSequence = [];
      resetViewer();
      unzoom();
      resetTilt();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    }

    listen(root, 'click', function (event) {
      var target = event.target.closest('button');
      if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-filter')) applyFilter(target.dataset.filter, true);
      else if (target.hasAttribute('data-spotlight')) spotlight(target.dataset.spotlight);
      else if (target.hasAttribute('data-spot-step')) stepSpotlight(Number(target.dataset.spotStep));
      else if (target.hasAttribute('data-equipment')) showItem(target.dataset.equipment, target);
      else if (target.hasAttribute('data-view')) {
        if (target.dataset.view === 'model') showModel();
        else resetViewer();
      }
      else if (target.classList.contains('eq-close')) dialog.close();
      else if (target.hasAttribute('data-step')) step(Number(target.dataset.step));
      else if (target === zoomButton) {
        var zoomed = imageWrap.classList.toggle('is-zoomed');
        zoomButton.setAttribute('aria-pressed', String(zoomed));
        zoomButton.textContent = zoomed ? '还原图片 −' : '放大图片 ＋';
        resetTilt();
      }
    });
    listen(dialog, 'click', function (event) {
      if (event.target !== dialog) return;
      var bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    listen(dialog, 'close', onClose);
    listen(dialog, 'keydown', function (event) {
      // The 3D viewer uses arrow keys to orbit its camera.
      if (event.target.closest('model-viewer')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    listen(root, 'pointermove', function (event) {
      if (motion.matches || event.pointerType !== 'mouse') return;
      var stage = event.target.closest('[data-eq-tilt]');
      if (!stage || imageWrap.classList.contains('is-zoomed') || stage.classList.contains('is-model')) { resetTilt(); return; }
      if (tilted !== stage) resetTilt();
      tilted = stage;
      var bounds = stage.getBoundingClientRect();
      var x = (event.clientX - bounds.left) / bounds.width - 0.5;
      var y = (event.clientY - bounds.top) / bounds.height - 0.5;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(function () {
        stage.style.setProperty('--eq-rx', (-y * 12).toFixed(2) + 'deg');
        stage.style.setProperty('--eq-ry', (x * 16).toFixed(2) + 'deg');
        frame = 0;
      });
    }, { passive: true });
    listen(root, 'pointerout', function (event) {
      if (tilted && !tilted.contains(event.relatedTarget)) resetTilt();
    }, { passive: true });
    listen(document, 'visibilitychange', function () { if (document.hidden) resetTilt(); });
    listen(window, 'popstate', readFilter);
    listen(document, 'pjax:send', function () { cleanup(); });
    readFilter();

    cleanup = function () {
      if (dialog.open) dialog.close();
      // The close event may be queued until after PJAX replaces this tree.
      onClose();
      cleanups.forEach(function (remove) { remove(); });
      cleanups = [];
      cleanup = function () {};
    };
  }

  window.__blogEquipmentGallery = { init: init };
  document.addEventListener('pjax:complete', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
