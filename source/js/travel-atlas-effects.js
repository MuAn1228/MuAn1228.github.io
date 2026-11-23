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

  window.__createTravelAtlasEffects = function (map, root, geo, visited, options) {
    options = options || {};
    var reduced = options.reduced || window.matchMedia('(prefers-reduced-motion: reduce)');
    var coarse = options.coarse || window.matchMedia('(pointer: coarse)');
    var enabled = root.dataset.mapEffects !== 'off';
    var destroyed = false, visible = true, satellite = false, raf = 0, lastPaint = -Infinity;
    var cleanups = [], selection = null;
    var selectedSet = Object.create(null);
    visited.forEach(function (name) { selectedSet[name] = true; });
    var nodes = [];
    geo.features.forEach(function (feature) {
      var properties = feature.properties || {};
      var name = shortName(properties.name || '');
      var centre = properties.centroid || properties.center;
      if (selectedSet[name] && Array.isArray(centre)) nodes.push({ name: name, latlng: L.latLng(centre[1], centre[0]) });
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
        var x = ((star.x + time * 0.0000009 * star.depth) % 1) * starWidth;
        var y = star.y * starHeight;
        context.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(time * 0.00065 + star.phase));
        context.fillStyle = star.colour;
        context.beginPath(); context.arc(x, y, star.radius, 0, Math.PI * 2); context.fill();
        if (star.radius > 1.25) {
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
      var seed = 72311;
      function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      stars = [];
      var count = Math.min(coarse.matches ? 45 : 90, Math.round(starWidth * starHeight / 6500));
      for (var index = 0; index < count; index++) {
        stars.push({ x: random(), y: random(), radius: 0.5 + random(), phase: random() * 6.28, depth: 0.25 + random(), colour: index % 3 ? '#9dcaff' : '#d6b7ff' });
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
        this.container = svg('svg', { class: 'travel-constellation leaflet-zoom-hide', 'aria-hidden': 'true', 'pointer-events': 'none' }, pane);
        var defs = svg('defs', {}, this.container);
        gradient(defs, 'travel-land-gradient', ['#203858', '#17243e', '#101b32']);
        gradient(defs, 'travel-visited-gradient', ['#6ce0ef', '#7575da', '#a85bce']);
        gradient(defs, 'travel-selected-gradient', ['#affbff', '#8bafff', '#c77ee7']);
        gradient(defs, 'travel-link-gradient', ['#81eff3', '#aba0ff', '#f2a1e8']);
        var glow = svg('filter', { id: 'travel-node-glow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
        svg('feGaussianBlur', { stdDeviation: '2', result: 'halo' }, glow);
        var merge = svg('feMerge', {}, glow);
        svg('feMergeNode', { in: 'halo' }, merge); svg('feMergeNode', { in: 'SourceGraphic' }, merge);
        this.grid = svg('g', { class: 'travel-star-grid' }, this.container);
        this.gridPaths = [];
        for (var latitude = 0; latitude <= 60; latitude += 10) this.gridPaths.push({ node: svg('path', {}, this.grid), ends: [[latitude, 55], [latitude, 150]] });
        for (var longitude = 60; longitude <= 150; longitude += 10) this.gridPaths.push({ node: svg('path', {}, this.grid), ends: [[-5, longitude], [65, longitude]] });
        this.links = edges.map(function (edge, index) {
          var line = svg('path', { class: 'travel-star-link' }, this.container);
          var comet = svg('path', { class: 'travel-star-comet', pathLength: '100' }, this.container);
          comet.style.animationDelay = (-index * 0.75) + 's';
          return { edge: edge, line: line, comet: comet };
        }, this);
        this.nodeElements = nodes.map(function (node, index) {
          var group = svg('g', { class: 'travel-star-node', 'data-province': node.name }, this.container);
          group.style.setProperty('--star-delay', (-index * 0.52) + 's');
          svg('circle', { class: 'travel-star-aura', r: '18' }, group);
          svg('circle', { class: 'travel-star-orbit', r: '10' }, group);
          svg('circle', { class: 'travel-star-core', r: '3.5' }, group);
          var leader = svg('path', { class: 'travel-star-label-leader' }, group);
          var name = svg('text', { class: 'travel-star-name', x: '0', y: '-17', 'text-anchor': 'middle' }, group);
          name.textContent = node.name;
          return { group: group, name: name, leader: leader };
        }, this);
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
          var a = point(line.ends[0]), b = point(line.ends[1]);
          line.node.setAttribute('d', 'M' + a.x + ',' + a.y + 'L' + b.x + ',' + b.y);
        });
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
        this.nodeElements.forEach(function (element, index) {
          var position = positions[index];
          element.group.setAttribute('transform', 'translate(' + position.x + ',' + position.y + ')');
          element.group.classList.toggle('is-selected', nodes[index].name === selection);
          var offsetX = 0, offsetY = -17;
          // Move nearby province labels apart at the national overview scale.
          for (var attempt = 0; attempt < 6; attempt++) {
            var collision = occupied.some(function (label) { return Math.abs(label.x - position.x - offsetX) < 42 && Math.abs(label.y - position.y - offsetY) < 19; });
            if (!collision) break;
            offsetX = attempt % 2 ? 29 : -29; offsetY = attempt < 2 ? 24 : -32 - attempt * 5;
          }
          element.name.setAttribute('x', offsetX); element.name.setAttribute('y', offsetY);
          element.leader.setAttribute('d', offsetX ? 'M0,0L' + offsetX + ',' + (offsetY + (offsetY > 0 ? -10 : 5)) : '');
          occupied.push({ x: position.x + offsetX, y: position.y + offsetY });
        });
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
