// Decorative constellations use province centres, not inferred travel routes.
(function () {
  'use strict';
  if (window.__createTravelAtlasEffects) return;
  var NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attributes, parent) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attributes || {}).forEach(function (name) { node.setAttribute(name, attributes[name]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  function shortName(name) {
    return name.replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/, '');
  }
  function gradient(defs, id, colours, radial) {
    var node = svg(radial ? 'radialGradient' : 'linearGradient', { id: id }, defs);
    if (!radial) { node.setAttribute('x2', '1'); node.setAttribute('y2', '1'); }
    colours.forEach(function (colour, index) {
      svg('stop', { offset: (index / (colours.length - 1) * 100) + '%', 'stop-color': colour }, node);
    });
  }
  function constellationEdges(nodes) {
    // Minimum spanning tree: visually connect footprints without inventing an itinerary.
    var connected = [0], remaining = nodes.map(function (_, index) { return index; }).slice(1), edges = [];
    while (remaining.length) {
      var best = null;
      connected.forEach(function (from) {
        remaining.forEach(function (to) {
          var distance = nodes[from].latlng.distanceTo(nodes[to].latlng);
          if (!best || distance < best.distance) best = { from: from, to: to, distance: distance };
        });
      });
      edges.push(best); connected.push(best.to); remaining.splice(remaining.indexOf(best.to), 1);
    }
    return edges;
  }

  // Original miniature scenery: every seal has its own silhouette and palette.
  function drawLandmark(parent, glyph) {
    function path(d, name) { return svg('path', { d: d, class: 'landmark-' + name }, parent); }
    function rect(x, y, width, height, name) { return svg('rect', { x: x, y: y, width: width, height: height, class: 'landmark-' + name }, parent); }
    svg('ellipse', { cx: 0, cy: 13, rx: 27, ry: 7, class: 'landmark-shadow' }, parent);
    path('M-25 9L-9 2L24 7L13 18L-15 18Z', 'stone');
    if (glyph === 'city') {
      path('M-21 9V-13L-12-18L-8-14V9M8 9V-26L15-32L23-26V9', 'ink');
      path('M-4 9V-34H3V9M-1-34V-43M-8-6H7L3 0H-4Z', 'stone');
      svg('circle', { cx: -0.5, cy: -23, r: 6, class: 'landmark-light' }, parent);
      path('M11-24V4M19-24V4M-18-10V4', 'light');
      [-10, -4, 2].forEach(function (y) { rect(-16, y, 3, 2, 'window'); rect(13, y - 8, 3, 2, 'window'); });
      path('M-26 14Q-10 10 0 14T26 14M-20 19H20', 'water');
    } else if (glyph === 'bridge') {
      path('M-23-8V-23H-8V-7M9-8V-18H21V-2', 'stone');
      path('M-28-23L-16-32L-3-23ZM4-18L15-27L27-18Z', 'roof');
      rect(-19, -20, 4, 5, 'window'); rect(13, -15, 4, 5, 'window');
      path('M-27 7Q0-15 27 7V16H18Q0-4-18 16H-27ZM-27 5Q0-17 27 5', 'stone');
      path('M-22 2V-5M-11-3V-11M0-5V-13M11-3V-11M22 2V-5', 'ink');
      path('M-27 19Q-13 15 0 19T27 19M-18 24Q-6 20 12 24', 'water');
      path('M-27 6Q-34-1-29-10Q-21-5-27 6M24 9Q32 4 29-6', 'leaf');
    } else if (glyph === 'lotus') {
      svg('ellipse', { cx: 0, cy: 14, rx: 29, ry: 9, class: 'landmark-water' }, parent);
      path('M-14-3V-18M14-3V-18M-18-2H18M-10-2V-13H10V-2', 'stone');
      path('M-22-18Q-9-21 0-31Q9-21 22-18L16-14H-16ZM-1-31V-37', 'roof');
      path('M0 13Q-10 5-7-3Q1-2 4 10M0 13Q9 3 15 5Q15 14 0 17M0 13Q-11 4-18 8Q-16 17 0 17M0 16Q2 4 7 0Q14 9 7 17', 'light');
      path('M-25 17Q-13 12-2 18M9 21Q18 16 27 19', 'water');
      path('M-22 7Q-13 0-6 8Q-14 16-22 7', 'leaf');
    } else if (glyph === 'ruin') {
      path('M-25 11V-22H-19V-27H-13V-21H-7V-28H1V-22H8V-27H15V-21H22V11H9V-3Q0-16-9-3V11ZM-29 11H28V17H-29Z', 'stone');
      path('M-19-17V6M16-17V6M-7-17H7M-17-11H-12M12-11H17', 'ink');
      path('M0-31Q-11-42-2-49Q-2-39 5-43Q13-34 0-31Z', 'light');
      path('M-20-27L-15-33M18-26L22-32M-8 18L-13 23M8 18L15 23', 'roof');
      svg('circle', { cx: 0, cy: -8, r: 3, class: 'landmark-window' }, parent);
    } else {
      path('M-12 6L-10-29L0-37L12-29L14 7L5 11H-5ZM-19 8H21V16H-19Z', 'stone');
      path('M-7-24L-2-29L7-23V-7L0-1L-7-7ZM-5-10L0-20L5-10M-3-15H3', 'light');
      path('M-25 15L-23 7L-18 13M20 16L24 8L27 14M-12 20H14', 'leaf');
      svg('circle', { cx: -19, cy: -15, r: 1.5, class: 'landmark-window' }, parent);
      path('M18-24V-15Q25-17 23-20M18-24L23-27', 'light');
    }
  }

  function drawCompass(parent, count) {
    var group = svg('g', { class: 'travel-world-compass' }, parent);
    svg('circle', { r: 39, class: 'compass-ring' }, group);
    svg('circle', { r: 29, class: 'compass-ring compass-ring-inner' }, group);
    svg('path', { d: 'M0-37L7-8L0-13L-7-8ZM37 0L8 7L13 0L8-7ZM0 37L-7 8L0 13L7 8ZM-37 0L-8-7L-13 0L-8 7Z', class: 'compass-points' }, group);
    // The mountain M and river A form Mu An's own compass seal.
    svg('path', { d: 'M-14 8V-9L-6 2L2-9V8M3 8L11-9L19 8M6 2H16M-17 15Q-8 9 0 15T19 15', class: 'compass-sigil' }, group);
    for (var index = 0; index < count; index++) {
      var angle = index / count * Math.PI * 2 - Math.PI / 2;
      svg('circle', { cx: (Math.cos(angle) * 33).toFixed(2), cy: (Math.sin(angle) * 33).toFixed(2), r: 1.8, class: 'compass-memory' }, group);
    }
    var north = svg('text', { x: 0, y: -46, 'text-anchor': 'middle', class: 'compass-north' }, group);
    north.textContent = '北';
    return group;
  }

  window.__createTravelSealGlyph = function (glyph) {
    var symbol = svg('svg', { viewBox: '-36 -54 72 82', class: 'travel-seal-art', 'data-glyph': glyph, 'aria-hidden': 'true' });
    drawLandmark(symbol, glyph);
    return symbol;
  };

  window.__createTravelAtlasEffects = function (map, root, geo, visited, options) {
    options = options || {};
    var reduced = options.reduced || window.matchMedia('(prefers-reduced-motion: reduce)');
    var coarse = options.coarse || window.matchMedia('(pointer: coarse)');
    var enabled = root.dataset.mapEffects !== 'off';
    var destroyed = false, visible = true, satellite = false, raf = 0, lastPaint = -Infinity;
    var cleanups = [], selection = null, awakened = Object.create(null);
    var world = window.__travelWorld || { regions: {} };
    var selectedSet = Object.create(null);
    visited.forEach(function (name) { selectedSet[name] = true; });
    var nodes = [];
    geo.features.forEach(function (feature) {
      var properties = feature.properties || {};
      var name = shortName(properties.name || '');
      var centre = properties.centroid || properties.center;
      if (selectedSet[name] && Array.isArray(centre)) {
        var region = (world.regions && world.regions[name]) || { glyph: 'waystone' };
        nodes.push({ name: name, glyph: region.glyph || 'waystone', latlng: L.latLng(centre[1], centre[0]) });
      }
    });
    var edges = nodes.length ? constellationEdges(nodes) : [];
    var stage = root.querySelector('.travel-map-stage');
    var canvas = document.createElement('canvas');
    canvas.className = 'travel-starfield'; canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
    var context = null;
    try { context = canvas.getContext('2d'); } catch (error) { /* SVG remains available without canvas. */ }
    var starWidth = 0, starHeight = 0, stars = [];

    function listen(target, name, callback) {
      target.addEventListener(name, callback);
      cleanups.push(function () { target.removeEventListener(name, callback); });
    }
    function drawStars(time) {
      if (!context) return;
      context.clearRect(0, 0, starWidth, starHeight);
      stars.forEach(function (star) {
        var x = (star.x + Math.sin(time * 0.00012 + star.phase) * 0.008 * star.depth) * starWidth;
        var y = ((star.y - time * 0.0000018 * star.depth + 1) % 1) * starHeight;
        context.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(time * 0.00065 + star.phase));
        context.fillStyle = star.colour;
        context.beginPath(); context.arc(x, y, star.radius, 0, Math.PI * 2); context.fill();
        if (star.radius > 1.4) {
          context.globalAlpha *= 0.35; context.strokeStyle = star.colour; context.lineWidth = 0.6;
          context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x + 4, y);
          context.moveTo(x, y - 4); context.lineTo(x, y + 4); context.stroke();
        }
      });
      context.globalAlpha = 1;
    }
    function resizeStars() {
      if (destroyed || !context) return;
      starWidth = Math.max(1, map.getSize().x); starHeight = Math.max(1, map.getSize().y);
      var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(starWidth * ratio); canvas.height = Math.round(starHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      var identity = String(world.sigil || 'MuAn-Mountains-And-Seas') + visited.join('|');
      var seed = 72311;
      for (var letter = 0; letter < identity.length; letter++) seed = ((seed << 5) - seed + identity.charCodeAt(letter)) >>> 0;
      function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      stars = [];
      var count = Math.min(coarse.matches ? 28 : 55, Math.round(starWidth * starHeight / 9500));
      for (var index = 0; index < count; index++) {
        stars.push({ x: random(), y: random(), radius: 0.45 + random(), phase: random() * 6.28, depth: 0.25 + random(), colour: index % 3 ? '#e6cc83' : '#9fe4bd' });
      }
      drawStars(0);
    }
    function animate(time) {
      raf = 0;
      if (destroyed || !enabled || !visible || satellite || document.hidden || reduced.matches) return;
      if (time - lastPaint >= (coarse.matches ? 100 : 65)) { drawStars(time); lastPaint = time; }
      raf = requestAnimationFrame(animate);
    }
    function syncMotion() {
      var running = enabled && visible && !document.hidden && !reduced.matches && !destroyed;
      var starRunning = running && !satellite;
      root.dataset.mapPaused = String(!running);
      if (!starRunning && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (starRunning && !raf && context) { lastPaint = -Infinity; raf = requestAnimationFrame(animate); }
      if (!starRunning && !satellite && !destroyed) drawStars(0);
    }

    var depthPane = map.getPane('travel-depth') || map.createPane('travel-depth');
    depthPane.style.zIndex = '390'; depthPane.style.pointerEvents = 'none';
    var depth = L.geoJSON(geo, {
      pane: 'travel-depth', interactive: false,
      filter: function (feature) { return !!(feature.properties && feature.properties.name); },
      style: function (feature) {
        var name = shortName(feature.properties.name);
        return { className: 'travel-province-depth' + (selectedSet[name] ? ' is-visited' : ''), interactive: false, weight: 0, fillOpacity: 1 };
      }
    }).addTo(map);
    var pane = map.getPane('travel-stars') || map.createPane('travel-stars');
    pane.style.zIndex = '450'; pane.style.pointerEvents = 'none';

    var StarLayer = L.Layer.extend({
      onAdd: function () {
        this.container = svg('svg', { class: 'travel-constellation leaflet-zoom-hide', role: 'group', 'aria-label': '旅行记忆地标', 'pointer-events': 'none' }, pane);
        var defs = svg('defs', {}, this.container);
        gradient(defs, 'travel-land-gradient', ['#53645b', '#364b46', '#223c39']);
        gradient(defs, 'travel-visited-gradient', ['#dac08a', '#a98b56', '#768962']);
        gradient(defs, 'travel-selected-gradient', ['#f0dba3', '#c7b178', '#91baa0']);
        gradient(defs, 'travel-link-gradient', ['#d6c087', '#9fe3c8', '#cca982']);
        var glow = svg('filter', { id: 'travel-node-glow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
        svg('feGaussianBlur', { stdDeviation: '2', result: 'halo' }, glow);
        var merge = svg('feMerge', {}, glow);
        svg('feMergeNode', { in: 'halo' }, merge); svg('feMergeNode', { in: 'SourceGraphic' }, merge);
        this.grid = svg('g', { class: 'travel-star-grid' }, this.container);
        this.gridPaths = [];
        var terrainNames = ['新疆', '西藏', '青海', '甘肃', '四川', '内蒙古', '黑龙江', '云南', '湖南', '福建', '广东', '辽宁'];
        var terrain = svg('g', { class: 'travel-world-terrain' }, this.container);
        this.terrainElements = [];
        geo.features.forEach(function (feature, index) {
          var properties = feature.properties || {};
          var name = shortName(properties.name || '');
          var centre = properties.centroid || properties.center;
          if (terrainNames.indexOf(name) === -1 || !Array.isArray(centre)) return;
          var group = svg('g', {}, terrain);
          if (index % 3) {
            svg('path', { class: 'travel-world-mountain', d: 'M-20 7L-9-12L2 7M-4 7L8-18L24 7M-13-6L-9-2L-5-6M3-10L8-5L12-11M-22 11H26' }, group);
          } else {
            svg('path', { class: 'travel-world-tree', d: 'M-13 8V-13M-22-2L-13-17L-4-2ZM-24 4L-13-10L-2 4ZM9 10V-10M1 1L9-15L18 1ZM-1 6L9-7L20 6Z' }, group);
            svg('path', { class: 'travel-world-river', d: 'M-22 16Q-11 10-1 16T24 16M-12 20Q0 14 14 20' }, group);
          }
          this.terrainElements.push({ group: group, latlng: L.latLng(centre[1], centre[0]) });
          for (var ring = 0; ring < 3; ring++) {
            var points = [];
            for (var segment = 0; segment <= 24; segment++) {
              var angle = segment / 24 * Math.PI * 2;
              var radius = (0.65 + ring * 0.37) * (1 + Math.sin(angle * 3 + index) * 0.14);
              points.push([centre[1] + Math.sin(angle) * radius, centre[0] + Math.cos(angle) * radius * 1.6]);
            }
            this.gridPaths.push({ node: svg('path', {}, this.grid), points: points });
          }
        }, this);
        this.links = edges.map(function (edge, index) {
          var line = svg('path', { class: 'travel-star-link' }, this.container);
          var comet = svg('path', { class: 'travel-star-comet', pathLength: '100' }, this.container);
          comet.style.animationDelay = (-index * 0.75) + 's';
          return { edge: edge, line: line, comet: comet };
        }, this);
        this.nodeElements = nodes.map(function (node, index) {
          var group = svg('g', { class: 'travel-star-node', 'data-province': node.name, 'data-glyph': node.glyph, role: 'button', tabindex: '0' }, this.container);
          function activate(event) {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event.type === 'click' && map.dragging && map.dragging.moved()) return;
            event.preventDefault(); event.stopPropagation();
            if (options.onSelect) options.onSelect(node.name);
          }
          group.addEventListener('click', activate); group.addEventListener('keydown', activate);
          group.style.setProperty('--star-delay', (-index * 0.52) + 's');
          svg('circle', { class: 'travel-star-aura', r: '18' }, group);
          svg('circle', { class: 'travel-star-orbit', r: '10' }, group);
          svg('circle', { class: 'travel-star-core', r: '3.5' }, group);
          var leader = svg('path', { class: 'travel-star-label-leader' }, group);
          var landmark = svg('g', { class: 'travel-landmark', 'data-glyph': node.glyph }, group);
          drawLandmark(landmark, node.glyph);
          var name = svg('text', { class: 'travel-star-name', x: '0', y: '0', 'text-anchor': 'middle' }, group);
          name.textContent = node.name;
          return { group: group, name: name, leader: leader, landmark: landmark };
        }, this);
        this.compass = drawCompass(this.container, nodes.length);
        this.draw();
      },
      getEvents: function () { return { viewreset: this.draw, move: this.draw, zoom: this.draw, resize: this.draw }; },
      onRemove: function () { if (this.container) this.container.remove(); },
      draw: function () {
        if (!this.container || destroyed) return;
        var origin = map.containerPointToLayerPoint([0, 0]);
        var size = map.getSize();
        L.DomUtil.setPosition(this.container, origin);
        this.container.setAttribute('width', size.x); this.container.setAttribute('height', size.y);
        this.container.setAttribute('viewBox', [origin.x, origin.y, size.x, size.y].join(' '));
        function point(latlng) { return map.latLngToLayerPoint(latlng); }
        this.gridPaths.forEach(function (line) {
          line.node.setAttribute('d', line.points.map(function (latlng, index) {
            var location = point(latlng);
            return (index ? 'L' : 'M') + location.x + ',' + location.y;
          }).join('') + 'Z');
        });
        this.terrainElements.forEach(function (element) {
          var location = point(element.latlng);
          element.group.setAttribute('transform', 'translate(' + location.x + ',' + location.y + ') scale(' + (coarse.matches ? 0.65 : 0.85) + ')');
        });
        this.compass.setAttribute('transform', 'translate(' + (origin.x + size.x - 62) + ',' + (origin.y + size.y - 70) + ') scale(' + (coarse.matches ? 0.75 : 0.9) + ')');
        var positions = nodes.map(function (node) { return point(node.latlng); });
        this.links.forEach(function (link, index) {
          var from = positions[link.edge.from], to = positions[link.edge.to];
          var dx = to.x - from.x, dy = to.y - from.y, distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var bend = Math.min(85, Math.max(16, distance * 0.22)) * (index % 2 ? 1 : -1);
          var controlX = (from.x + to.x) / 2 - dy / distance * bend;
          var controlY = (from.y + to.y) / 2 + dx / distance * bend;
          var curve = 'M' + from.x + ',' + from.y + 'Q' + controlX.toFixed(1) + ',' + controlY.toFixed(1) + ' ' + to.x + ',' + to.y;
          link.line.setAttribute('d', curve); link.comet.setAttribute('d', curve);
        });
        var occupied = [];
        var drawingOrder = nodes.map(function (_, index) { return index; });
        drawingOrder.sort(function (a, b) { return positions[a].y - positions[b].y || positions[a].x - positions[b].x; });
        var preferred = { city: [48, -18], bridge: [-44, 22], lotus: [25, 43], ruin: [-35, -28], waystone: [0, -40] };
        drawingOrder.forEach(function (index) {
          var element = this.nodeElements[index];
          var position = positions[index];
          element.group.setAttribute('transform', 'translate(' + position.x + ',' + position.y + ')');
          element.group.classList.toggle('is-selected', nodes[index].name === selection);
          element.group.classList.toggle('is-awakened', !!awakened[nodes[index].name]);
          element.group.setAttribute('aria-pressed', String(nodes[index].name === selection));
          var region = world.regions && world.regions[nodes[index].name];
          element.group.setAttribute('aria-label', nodes[index].name + (region ? ' · ' + region.relic : '') + (awakened[nodes[index].name] ? ' · 已唤醒' : ' · 待唤醒'));
          var inView = position.x >= origin.x - 18 && position.x <= origin.x + size.x + 18 && position.y >= origin.y - 18 && position.y <= origin.y + size.y + 18;
          element.group.style.display = inView ? '' : 'none';
          element.group.setAttribute('tabindex', inView ? '0' : '-1');
          if (!inView) return;
          var scale = coarse.matches ? 0.6 : 0.76;
          var choices = [map.getZoom() >= 5 ? [0, -12] : (preferred[nodes[index].glyph] || [0, -35]), [55, -32], [-60, -24], [56, 35], [-58, 42], [0, -72], [76, 4], [-80, 6], [22, 78]];
          var offsetX = 0, offsetY = 0;
          for (var attempt = 0; attempt < choices.length; attempt++) {
            offsetX = Math.max(origin.x + 30 - position.x, Math.min(origin.x + size.x - 30 - position.x, choices[attempt][0]));
            offsetY = Math.max(origin.y + 55 - position.y, Math.min(origin.y + size.y - 42 - position.y, choices[attempt][1]));
            var centreX = position.x + offsetX, centreY = position.y + offsetY;
            var collision = occupied.some(function (area) { return Math.abs(area.x - centreX) < 57 && Math.abs(area.y - centreY) < 57; });
            if (!collision) break;
          }
          element.landmark.setAttribute('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')');
          element.name.setAttribute('x', offsetX); element.name.setAttribute('y', offsetY + 28 * scale + 7);
          element.leader.setAttribute('d', 'M0,0L' + offsetX + ',' + offsetY);
          occupied.push({ x: position.x + offsetX, y: position.y + offsetY });
        }, this);
      }
    });
    var layer = new StarLayer().addTo(map);
    var observer = null;
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) { return entry.isIntersecting; }); syncMotion();
      }, { threshold: 0 });
      observer.observe(stage);
    }
    listen(document, 'visibilitychange', syncMotion);
    if (reduced.addEventListener) listen(reduced, 'change', syncMotion);
    map.on('resize', resizeStars);
    resizeStars(); syncMotion();

    return {
      select: function (name) { selection = name; layer.draw(); },
      setAwakened: function (names) {
        awakened = Object.create(null);
        names.forEach(function (name) { if (selectedSet[name]) awakened[name] = true; });
        layer.draw();
      },
      setEnabled: function (value) { enabled = !!value; syncMotion(); },
      setView: function (value) { satellite = value === 'satellite'; syncMotion(); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (observer) observer.disconnect();
        cleanups.forEach(function (remove) { remove(); });
        map.off('resize', resizeStars);
        map.removeLayer(layer); map.removeLayer(depth); canvas.remove();
      }
    };
  };
})();
