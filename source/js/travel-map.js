// 旅行足迹：本地省界底图、按需卫星影像与真实游记。
(function () {
  'use strict';
  if (window.__blogTravelMap) { window.__blogTravelMap.init(); return; }
  var script = document.currentScript;
  var base = script && script.src ? new URL('../', script.src) : new URL('/', location.href);
  var satelliteURL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
  var activeRoot = null;
  var cleanup = function () {};
  var explorationKey = 'blog-travel-echoes-v1';
  var memoryAwakened = [];

  function region(name) {
    var world = window.__travelWorld;
    return world && world.regions && world.regions[name] || {
      glyph: 'waystone', relic: '未命名的回响', caption: ''
    };
  }

  function shortName(name) {
    return name.replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/, '');
  }

  function init() {
    var root = document.getElementById('travel-atlas');
    if (root && root === activeRoot) return;
    cleanup();
    if (!root) return;
    activeRoot = root;
    var mount = root.querySelector('#travel-map');
    var status = root.querySelector('#travel-map-status');
    var retry = root.querySelector('#travel-map-retry');
    var provinceList = root.querySelector('#travel-provinces');
    var help = root.querySelector('#travel-map-help');
    var postList = root.querySelector('#travel-selection-posts');
    var sealList = root.querySelector('#travel-seals');
    var selectionCover = root.querySelector('#travel-selection-cover');
    var selectionQuote = root.querySelector('#travel-selection-quote');
    var controller = new AbortController();
    var cleanups = [];
    var disposed = false;
    var map = null, outlines = null, satellite = null, effects = null;
    var data = null, geo = null;
    var dataError = false, geoError = false;
    var selected = null, view = 'atlas', extent = 'overview';
    var layers = Object.create(null), visited = Object.create(null);
    var awakened = new Set();
    var coarse = window.matchMedia('(pointer: coarse)');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var interactive = !coarse.matches;
    var effectsEnabled = !reduced.matches;
    var resizeObserver = null, frame = 0;

    function listen(target, event, callback, options) {
      target.addEventListener(event, callback, options);
      cleanups.push(function () { target.removeEventListener(event, callback, options); });
    }
    function text(selector, value) { root.querySelector(selector).textContent = value; }
    function say(message) { status.textContent = message; status.hidden = !message; }
    function refreshStatus() {
      retry.hidden = !dataError && !geoError;
      if (dataError) say('旅行记录暂时未能加载，请重试。');
      else if (geoError) say('地图暂时未能加载，仍可在下方选择省份阅读游记。');
      else if (!data || !geo) say('正在展开旅行地图…');
      else say('');
      root.setAttribute('aria-busy', String(!dataError && !geoError && (!data || !geo)));
    }
    function loadJSON(file) {
      return fetch(new URL(file, base).href, { signal: controller.signal }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    }
    function safeURL(value) {
      if (typeof value !== 'string' || !value) return null;
      try {
        var url = new URL(value, location.href);
        if (url.origin === location.origin && /^https?:$/.test(url.protocol)) return url.href;
      } catch (error) { /* Malformed links do not become travel records. */ }
      return null;
    }
    function safeImageURL(value) {
      var destination = safeURL(value);
      if (!destination) return null;
      try {
        var url = new URL(destination);
        var path = decodeURIComponent(url.pathname);
        if (url.username || url.password || path.indexOf(base.pathname + 'img/') !== 0) return null;
        if (!/\.(?:avif|gif|jpe?g|png|webp)$/i.test(path) || /\\/.test(path)) return null;
        return url.href;
      } catch (error) { return null; }
    }
    function photo(image, post, cover) {
      image.hidden = true;
      image.removeAttribute('src');
      var destination = post && safeImageURL(post.cover);
      if (!destination) return;
      image.loading = 'lazy'; image.decoding = 'async';
      image.alt = post.title + ' · 旅行照片';
      image.hidden = false;
      image.src = destination;
      if (!cover) image.addEventListener('error', function () { image.hidden = true; }, { once: true });
    }
    function loadAwakened() {
      var names = memoryAwakened;
      try {
        var saved = JSON.parse(localStorage.getItem(explorationKey) || 'null');
        if (Array.isArray(saved)) names = saved;
      } catch (error) { /* The in-memory collection works when browser storage is unavailable. */ }
      awakened = new Set(names.filter(function (name) { return typeof name === 'string' && visited[name]; }));
      memoryAwakened = Array.from(awakened);
      try { localStorage.setItem(explorationKey, JSON.stringify(memoryAwakened)); } catch (error) { /* Storage is optional. */ }
    }
    function renderDiscovery(message) {
      if (!data) return;
      var count = awakened.size, total = data.visited.length;
      root.dataset.awakenedCount = String(count);
      var counter = root.querySelector('#travel-discovery-count');
      var maximum = root.querySelector('#travel-discovery-total');
      var announcement = root.querySelector('#travel-discovery-status');
      if (counter) counter.textContent = count;
      if (maximum) maximum.textContent = total;
      if (announcement) announcement.textContent = message || (total && count === total
        ? '山海已回应，沐安的 ' + total + ' 枚足迹刻印都已唤醒。'
        : '已唤醒 ' + count + '/' + total + ' 枚刻印，点选足迹，收集旅途的回响。');
      if (sealList) sealList.querySelectorAll('button[data-province]').forEach(function (button) {
        var name = button.dataset.province;
        var unlocked = awakened.has(name);
        button.classList.toggle('is-awakened', unlocked);
        button.classList.toggle('is-selected', selected === name);
        button.setAttribute('aria-pressed', String(selected === name));
        button.setAttribute('aria-label', name + ' · ' + region(name).relic + ' · ' + (unlocked ? '已唤醒' : '待唤醒'));
        button.querySelector('.travel-seal-state').textContent = unlocked ? '已唤醒' : '待唤醒';
      });
      if (effects && effects.setAwakened) effects.setAwakened(Array.from(awakened));
    }
    function buildSeals() {
      if (!sealList || !data) return;
      var marks = { city: '▥', bridge: '⌒', lotus: '✧', ruin: '▤', waystone: '◇' };
      sealList.replaceChildren();
      data.visited.forEach(function (name) {
        var emblem = region(name);
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'travel-seal';
        button.dataset.province = name; button.dataset.glyph = emblem.glyph;
        var mark = document.createElement('span');
        mark.className = 'travel-seal-mark'; mark.setAttribute('aria-hidden', 'true');
        if (window.__createTravelSealGlyph) mark.appendChild(window.__createTravelSealGlyph(emblem.glyph));
        else mark.textContent = marks[emblem.glyph] || marks.waystone;
        var title = document.createElement('span'); title.className = 'travel-seal-name'; title.textContent = emblem.relic;
        var state = document.createElement('span'); state.className = 'travel-seal-state';
        button.appendChild(mark); button.appendChild(title); button.appendChild(state);
        sealList.appendChild(button);
      });
    }
    function awaken(name) {
      if (!visited[name] || awakened.has(name)) return;
      awakened.add(name);
      memoryAwakened = Array.from(awakened);
      try { localStorage.setItem(explorationKey, JSON.stringify(memoryAwakened)); } catch (error) { /* Keep exploring within this tab. */ }
      var message = '已唤醒「' + region(name).relic + '」 · ' + awakened.size + '/' + data.visited.length;
      if (awakened.size === data.visited.length) message += ' · 山海已回应，全部足迹刻印收集完成。';
      renderDiscovery(message);
    }
    function records(name) {
      if (!data) return [];
      return (data.posts[name] || []).filter(function (post) {
        return post && typeof post.title === 'string' && safeURL(post.url);
      });
    }
    function updatePaths() {
      Object.keys(layers).forEach(function (name) {
        var path = layers[name].getElement();
        if (!path) return;
        path.classList.toggle('is-visited', !!visited[name]);
        path.classList.toggle('is-selected', name === selected);
        path.setAttribute('aria-pressed', String(name === selected));
        path.setAttribute('aria-label', name + (data ? (visited[name] ? '，已到访，' + (data.counts[name] || 0) + ' 篇游记' : '，尚无足迹') : '，记录加载中'));
      });
      root.querySelectorAll('button[data-province]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.province === selected));
        button.classList.toggle('is-selected', button.dataset.province === selected);
      });
      if (effects) effects.select(selected);
      var focus = root.querySelector('#travel-map-focus');
      if (focus) focus.textContent = selected ? selected + (visited[selected] ? ' · ' + region(selected).relic : ' · 待探索') : (extent === 'visited' ? '已点亮的山河' : '全国足迹');
    }
    function renderSelection() {
      if (!data) return;
      postList.replaceChildren();
      if (selectionCover) { selectionCover.hidden = true; selectionCover.removeAttribute('src'); }
      if (selectionQuote) { selectionQuote.hidden = true; selectionQuote.textContent = ''; }
      var relic = root.querySelector('#travel-selection-relic');
      if (relic) { relic.textContent = selected ? region(selected).relic : ''; relic.hidden = !selected; }
      var posts = [];
      if (selected) {
        var count = data.counts[selected] || 0;
        text('#travel-selection-label', visited[selected] ? '走过的地方' : '下一程的灵感');
        text('#travel-selection-title', selected);
        var caption = region(selected).caption;
        text('#travel-selection-summary', visited[selected]
          ? ((caption || (count ? '重温途中的风景。' : '足迹已点亮，游记还在整理中。')) + (count ? ' 这里留有 ' + count + ' 篇旅行手记。' : ''))
          : '这里的风景，留给下一次出发。');
        posts = records(selected);
        if (selectionCover && posts[0]) photo(selectionCover, posts[0], true);
        if (selectionQuote && posts[0] && typeof posts[0].excerpt === 'string' && posts[0].excerpt.trim()) {
          selectionQuote.textContent = posts[0].excerpt; selectionQuote.hidden = false;
        }
      } else {
        text('#travel-selection-label', '足迹概览');
        text('#travel-selection-title', '下一站，仍在路上');
        text('#travel-selection-summary', '已走过 ' + data.visited.length + ' 个省级地区，写下 ' + data.totalPosts + ' 篇游记。选择一处足迹，重温旅行记忆。');
        var seen = Object.create(null);
        data.visited.forEach(function (name) {
          records(name).forEach(function (post) {
            if (!seen[post.url]) { seen[post.url] = true; posts.push(post); }
          });
        });
        posts.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        posts = posts.slice(0, 3);
      }
      posts.forEach(function (post) {
        var card = document.createElement('a');
        card.className = 'travel-map-post'; card.href = safeURL(post.url);
        if (!selected && safeImageURL(post.cover)) {
          var image = document.createElement('img'); image.className = 'travel-map-post-cover';
          photo(image, post, false); card.appendChild(image);
        }
        var title = document.createElement('strong'); title.textContent = post.title;
        if (/^\d{4}-\d{2}-\d{2}$/.test(post.date)) {
          var date = document.createElement('time');
          date.dateTime = post.date; date.textContent = post.date.replace(/-/g, '.');
          card.appendChild(date);
        }
        card.appendChild(title); postList.appendChild(card);
      });
      if (!posts.length) {
        var empty = document.createElement('p'); empty.className = 'travel-map-empty';
        empty.textContent = selected && visited[selected] ? '先收集风景，再慢慢写成故事。' : '新的故事，等下一次出发。';
        postList.appendChild(empty);
      }
      updatePaths();
    }
    function fit(bounds, maxZoom, animate) {
      if (map && bounds && bounds.isValid()) {
        map.stop();
        map.fitBounds(bounds, { padding: [22, 22], maxZoom: maxZoom, animate: !!animate && !reduced.matches });
      }
    }
    function fitExtent(animate) {
      if (!map || !outlines) return;
      if (extent === 'selection' && layers[selected]) fit(layers[selected].getBounds(), 7, animate);
      else if (extent === 'visited' && data) {
        var bounds = L.latLngBounds([]);
        data.visited.forEach(function (name) { if (layers[name]) bounds.extend(layers[name].getBounds()); });
        fit(bounds.isValid() ? bounds : outlines.getBounds(), 6, animate);
      } else fit(outlines.getBounds(), 5, animate);
    }
    function select(name, zoom) {
      if (!data) return;
      selected = name; extent = name ? 'selection' : 'overview';
      if (name) awaken(name);
      renderSelection();
      if (zoom) fitExtent(true);
    }
    function renderEffects() {
      if (!map || !geo || !data || effects || !window.__createTravelAtlasEffects) return;
      effects = window.__createTravelAtlasEffects(map, root, geo, data.visited, { reduced: reduced, coarse: coarse, onSelect: function (name) { select(name, true); } });
      effects.select(selected);
      effects.setView(view);
      if (effects.setAwakened) effects.setAwakened(Array.from(awakened));
    }
    function syncEffects() {
      root.dataset.mapEffects = effectsEnabled ? 'on' : 'off';
      var button = root.querySelector('[data-map-action="effects"]');
      if (button) {
        button.setAttribute('aria-pressed', String(effectsEnabled));
        button.textContent = effectsEnabled ? '关闭动效' : '开启动效';
      }
      if (effects) effects.setEnabled(effectsEnabled);
    }
    function syncInteraction() {
      var button = root.querySelector('[data-map-action="interact"]');
      button.setAttribute('aria-pressed', String(interactive));
      button.textContent = interactive ? '完成操作' : '操作地图';
      mount.dataset.interactive = String(interactive);
      if (map) {
        if (interactive) { map.dragging.enable(); map.touchZoom.enable(); map.doubleClickZoom.enable(); map.scrollWheelZoom.enable(); }
        else { map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable(); map.scrollWheelZoom.disable(); }
      }
      help.textContent = coarse.matches ? (interactive ? '可拖动或双指缩放；点「完成操作」继续滚动页面。' : '点省份查看记录；点「操作地图」开启拖动和双指缩放。') : '点击省份查看记录；滚轮或左上角按钮缩放，拖动地图平移。';
    }
    function buildMap() {
      if (!window.L) throw new Error('Leaflet unavailable');
      map = L.map(mount, {
        center: [34, 104], zoom: 3, minZoom: 2, maxZoom: 10,
        zoomControl: false, attributionControl: true, scrollWheelZoom: interactive,
        dragging: interactive, touchZoom: interactive, doubleClickZoom: interactive,
        zoomSnap: 0.25, zoomDelta: 0.5, worldCopyJump: false,
        maxBounds: [[-10, 60], [65, 150]], maxBoundsViscosity: 0.8,
        fadeAnimation: !reduced.matches, zoomAnimation: !reduced.matches
      });
      L.control.zoom({ position: 'topleft', zoomInTitle: '放大地图', zoomOutTitle: '缩小地图' }).addTo(map);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>');
      outlines = L.geoJSON(geo, {
        style: function (feature) {
          var name = shortName((feature.properties && feature.properties.name) || '');
          return { className: name ? 'travel-province-shape' : 'travel-map-boundary', weight: 1, fillOpacity: 1, interactive: !!name };
        },
        onEachFeature: function (feature, layer) {
          var name = shortName((feature.properties && feature.properties.name) || '');
          if (!name) return;
          layers[name] = layer;
          var label = document.createElement('span'); label.textContent = name;
          layer.bindTooltip(label, { sticky: true, className: 'travel-map-tooltip' });
          layer.on('click', function () { select(name, true); });
          layer.on('add', function () {
            var path = layer.getElement();
            if (!path) return;
            path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button');
            listen(path, 'keydown', function (event) {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); event.stopPropagation(); select(name, true);
              }
            });
          });
        }
      }).addTo(map);
      map.on('dragstart', function () { extent = 'manual'; });
      syncInteraction(); updatePaths(); renderEffects(); fitExtent(false);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(function () {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(function () {
            frame = 0;
            if (!map || disposed) return;
            map.invalidateSize({ pan: false });
            if (extent !== 'manual') fitExtent(false);
          });
        });
        resizeObserver.observe(mount);
      }
    }
    function switchView(next) {
      if (!map || !geo || view === next) return;
      view = next; mount.dataset.mapView = view;
      if (effects) effects.setView(view);
      root.querySelectorAll('button[data-map-view]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.mapView === view));
      });
      if (view === 'satellite') {
        if (!satellite) {
          satellite = L.tileLayer(satelliteURL, {
            subdomains: ['1', '2', '3', '4'], maxZoom: 10, noWrap: true,
            attribution: '卫星影像 &copy; 高德地图'
          });
          satellite.on('tileerror', function () {
            if (!disposed && view === 'satellite') {
              switchView('atlas'); say('卫星影像暂时不可用，已返回足迹底图。');
            }
          });
        }
        say(''); satellite.addTo(map);
      } else if (satellite && map.hasLayer(satellite)) { map.removeLayer(satellite); refreshStatus(); }
    }

    listen(root, 'click', function (event) {
      var button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button === retry) { cleanup(); init(); return; }
      if (button.hasAttribute('data-province')) select(button.dataset.province, true);
      else if (button.hasAttribute('data-map-view')) switchView(button.dataset.mapView);
      else {
        var action = button.dataset.mapAction;
        if (action === 'overview' || action === 'visited') {
          selected = null; extent = action; renderSelection(); fitExtent(true);
        } else if (action === 'interact') { interactive = !interactive; syncInteraction(); }
        else if (action === 'effects') { effectsEnabled = !effectsEnabled; syncEffects(); }
      }
    });
    if (coarse.addEventListener) listen(coarse, 'change', function () { interactive = !coarse.matches; syncInteraction(); });
    if (selectionCover) listen(selectionCover, 'error', function () { selectionCover.hidden = true; });

    // The resources fail independently: records remain usable without geometry.
    root.setAttribute('aria-busy', 'true'); mount.dataset.mapView = 'atlas';
    root.querySelectorAll('button[data-map-view]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.mapView === 'atlas'));
    });
    text('#travel-stat-provinces', '—'); text('#travel-stat-posts', '—');
    provinceList.replaceChildren(); postList.replaceChildren();
    if (sealList) sealList.replaceChildren();
    if (selectionCover) { selectionCover.hidden = true; selectionCover.removeAttribute('src'); }
    if (selectionQuote) { selectionQuote.hidden = true; selectionQuote.textContent = ''; }
    var initialRelic = root.querySelector('#travel-selection-relic');
    if (initialRelic) { initialRelic.hidden = true; initialRelic.textContent = ''; }
    text('#travel-selection-label', '足迹概览'); text('#travel-selection-title', '下一站，仍在路上');
    text('#travel-selection-summary', '正在整理途中的旅行记录…');
    root.querySelector('#travel-all-posts').href = new URL('categories/' + encodeURIComponent('旅行') + '/', base).href;
    refreshStatus(); syncInteraction(); syncEffects();

    loadJSON('data/travel.json').then(function (value) {
      if (disposed) return;
      if (!value || !Array.isArray(value.visited) || !value.counts || !value.posts || typeof value.totalPosts !== 'number') throw new Error('Invalid travel data');
      data = value; data.visited = Array.from(new Set(data.visited));
      data.visited.forEach(function (name) {
        visited[name] = true;
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'travel-province'; button.dataset.province = name;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = name + ' · ' + (data.counts[name] ? data.counts[name] + ' 篇' : '待整理');
        provinceList.appendChild(button);
      });
      loadAwakened(); buildSeals(); renderDiscovery();
      text('#travel-stat-provinces', data.visited.length); text('#travel-stat-posts', data.totalPosts);
      renderSelection(); renderEffects(); refreshStatus();
    }).catch(function () {
      if (disposed) return;
      dataError = true;
      text('#travel-selection-summary', '记录暂时未能加载，可重试或查看全部旅行记录。');
      refreshStatus();
    });
    loadJSON('lib/china.json').then(function (value) {
      if (disposed) return;
      if (!value || value.type !== 'FeatureCollection' || !Array.isArray(value.features) || !value.features.length) throw new Error('Invalid geometry');
      geo = value; buildMap(); refreshStatus();
    }).catch(function () {
      if (disposed) return;
      geoError = true;
      if (effects) { effects.destroy(); effects = null; }
      if (map) { map.remove(); map = null; }
      refreshStatus();
    });
    cleanup = function () {
      disposed = true; controller.abort();
      if (resizeObserver) resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      cleanups.forEach(function (remove) { remove(); });
      if (effects) { effects.destroy(); effects = null; }
      if (map) { map.remove(); map = null; }
      activeRoot = null; cleanup = function () {};
    };
  }
  window.__blogTravelMap = { init: init };
  document.addEventListener('pjax:send', function () { cleanup(); });
  document.addEventListener('pjax:complete', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
