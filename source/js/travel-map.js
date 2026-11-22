// 旅行足迹：本地省界底图、按需卫星影像与真实游记。
(function () {
  'use strict';
  if (window.__blogTravelMap) { window.__blogTravelMap.init(); return; }
  var script = document.currentScript;
  var base = script && script.src ? new URL('../', script.src) : new URL('/', location.href);
  var satelliteURL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
  var activeRoot = null;
  var cleanup = function () {};

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
    var controller = new AbortController();
    var cleanups = [];
    var disposed = false;
    var map = null, outlines = null, satellite = null, labels = null;
    var data = null, geo = null;
    var dataError = false, geoError = false;
    var selected = null, view = 'atlas', extent = 'overview';
    var layers = Object.create(null), visited = Object.create(null);
    var coarse = window.matchMedia('(pointer: coarse)');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var interactive = !coarse.matches;
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
      provinceList.querySelectorAll('button[data-province]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.province === selected));
      });
    }
    function renderSelection() {
      if (!data) return;
      postList.replaceChildren();
      var posts = [];
      if (selected) {
        var count = data.counts[selected] || 0;
        text('#travel-selection-label', visited[selected] ? '走过的地方' : '下一程的灵感');
        text('#travel-selection-title', selected);
        text('#travel-selection-summary', visited[selected] ? (count ? '留下了 ' + count + ' 篇旅行记录，重温途中的风景。' : '足迹已点亮，游记还在整理中。') : '这里的风景，留给下一次出发。');
        posts = records(selected);
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
      renderSelection();
      if (zoom) fitExtent(true);
    }
    function renderLabels() {
      if (!map || !geo || !data) return;
      if (labels) map.removeLayer(labels);
      labels = L.layerGroup();
      geo.features.forEach(function (feature) {
        var properties = feature.properties || {};
        var name = shortName(properties.name || '');
        var point = properties.centroid || properties.center;
        if (!visited[name] || !Array.isArray(point)) return;
        var label = document.createElement('span'); label.textContent = name;
        L.tooltip({ permanent: true, direction: 'center', className: 'travel-province-label', interactive: false, opacity: 1 })
          .setLatLng([point[1], point[0]]).setContent(label).addTo(labels);
      });
      if (map.getZoom() >= 3.5) labels.addTo(map);
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
      map.on('zoomend', function () {
        if (!labels) return;
        if (map.getZoom() >= 3.5 && !map.hasLayer(labels)) labels.addTo(map);
        else if (map.getZoom() < 3.5 && map.hasLayer(labels)) map.removeLayer(labels);
      });
      map.on('dragstart', function () { extent = 'manual'; });
      syncInteraction(); updatePaths(); renderLabels(); fitExtent(false);
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
      }
    });
    if (coarse.addEventListener) listen(coarse, 'change', function () { interactive = !coarse.matches; syncInteraction(); });

    // The resources fail independently: records remain usable without geometry.
    root.setAttribute('aria-busy', 'true'); mount.dataset.mapView = 'atlas';
    root.querySelectorAll('button[data-map-view]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.mapView === 'atlas'));
    });
    text('#travel-stat-provinces', '—'); text('#travel-stat-posts', '—');
    provinceList.replaceChildren(); postList.replaceChildren();
    text('#travel-selection-label', '足迹概览'); text('#travel-selection-title', '下一站，仍在路上');
    text('#travel-selection-summary', '正在整理途中的旅行记录…');
    root.querySelector('#travel-all-posts').href = new URL('categories/' + encodeURIComponent('旅行') + '/', base).href;
    refreshStatus(); syncInteraction();

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
      text('#travel-stat-provinces', data.visited.length); text('#travel-stat-posts', data.totalPosts);
      renderSelection(); renderLabels(); refreshStatus();
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
      if (map) { map.remove(); map = null; }
      refreshStatus();
    });
    cleanup = function () {
      disposed = true; controller.abort();
      if (resizeObserver) resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      cleanups.forEach(function (remove) { remove(); });
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
