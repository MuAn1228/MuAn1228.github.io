// ===== 书籍模块「漂移墙」DriftWall（reactbits.dev 的 vanilla 移植）=====
// 读取 /data/books.json，把书籍封面渲染成带 3D 透视 + 视差 + 悬停抬升的漂移墙
(function () {
  'use strict';

  var mount = document.getElementById('book-driftwall');
  if (!mount) return;

  var DEFAULTS = {
    tileWidth: 150,
    tileHeight: 200,
    gap: 20,
    radius: 12,
    tilt: 16,
    turn: -14,
    roll: 0,
    perspective: 1400,
    depth: 130,
    speed: 34,
    direction: 'up',
    variance: 0.5,
    parallax: 0.6,
    pauseOnHover: false,
    lift: 44,
    fade: 0.6,
    dim: 0.92,
    grayscale: false,
    overlayColor: '#17102b'
  };

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function columnFactor(index, variance) {
    var pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
    return 1 + variance * pseudo;
  }

  fetch('/data/books.json')
    .then(function (r) { return r.json(); })
    .then(function (books) {
      var items = books.map(function (b) {
        return { image: b.img, title: b.name || '', sub: b.sub || '', note: b.note || '', href: undefined };
      }).filter(function (it) { return it.image; });
      if (!items.length) { mount.textContent = ''; return; }
      new DriftWall(mount, items, DEFAULTS);
    })
    .catch(function () {
      mount.innerHTML = '<p style="color:#999;text-align:center;">书籍加载失败</p>';
    });

  function DriftWall(container, items, conf) {
    this.items = items;
    this.conf = Object.assign({}, DEFAULTS, conf || {});

    // 桌面端固定四列（能看到全部书），移动端两列
    this.columns = (window.innerWidth <= 768) ? 2 : 4;

    this.columnItems = [];
    for (var c = 0; c < this.columns; c++) this.columnItems.push([]);
    items.forEach(function (it, i) { this.columnItems[i % this.columns].push(it); }, this);

    this.offsets = [];
    this.velocities = [];
    this.baseVelocities = [];
    this.trackEls = [];
    this.hoveredCol = -1;
    this.wallHovered = false;
    this.pointer = { x: 0, y: 0 };
    this.pointerDamped = { x: 0, y: 0 };
    this.lastTs = null;
    this.activeId = null;
    this.itemsById = {};
    this.tipId = null;
    this.reduced = prefersReducedMotion();

    var self = this;
    if (typeof window.matchMedia === 'function') {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', function (e) { self.reduced = e.matches; });
    }

    this.createTip();
    this.build(container);
    this.computeVelocities();
    this.attachEvents(container);
    this.raf = requestAnimationFrame(function (ts) { self.tick(ts); });
  }

  DriftWall.prototype.computeUnit = function () {
    return this.conf.tileHeight + this.conf.gap;
  };

  DriftWall.prototype.copyHeightOf = function (col) {
    var unit = this.computeUnit();
    return Math.max(unit, col.length * unit);
  };

  DriftWall.prototype.copiesOf = function (copyHeight) {
    // 用固定可见高度估算副本数，避免 ResizeObserver 反复重建 DOM
    var visible = 640 * 1.6;
    return Math.max(2, Math.ceil(visible / copyHeight) + 1);
  };

  DriftWall.prototype.build = function (container) {
    var conf = this.conf;
    var css = {
      '--dw-tile-w': conf.tileWidth + 'px',
      '--dw-tile-h': conf.tileHeight + 'px',
      '--dw-gap': conf.gap + 'px',
      '--dw-radius': conf.radius + 'px',
      '--dw-perspective': conf.perspective + 'px',
      '--dw-lift': conf.lift + 'px',
      '--dw-dim': conf.dim,
      '--dw-gray': conf.grayscale ? 1 : 0,
      '--dw-overlay': conf.overlayColor,
      '--dw-edge': Math.max(0, (1 - conf.fade) * 100) + '%'
    };
    Object.keys(css).forEach(function (k) { container.style.setProperty(k, css[k]); });

    container.classList.add('drift-wall');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', '书籍漂移墙');

    var plane = document.createElement('div');
    plane.className = 'drift-wall__plane';
    container.appendChild(plane);

    var self = this;
    this.columnItems.forEach(function (col, c) {
      var copyHeight = self.copyHeightOf(col);
      var copies = self.copiesOf(copyHeight);

      var colEl = document.createElement('div');
      colEl.className = 'drift-wall__col';

      var track = document.createElement('div');
      track.className = 'drift-wall__track';

      for (var k = 0; k < copies; k++) {
        col.forEach(function (item, i) {
          track.appendChild(self.renderTile(item, c + '-' + k + '-' + i, c));
        });
      }

      colEl.appendChild(track);
      plane.appendChild(colEl);
      self.trackEls.push(track);

      self.offsets.push(copyHeight * ((c * 0.37) % 1));
      self.velocities.push(0);
    });

    this.plane = plane;
  };

  DriftWall.prototype.renderTile = function (item, id, colIndex) {
    this.itemsById[id] = item;
    var inner = document.createElement('span');
    inner.className = 'drift-wall__inner';

    var img = document.createElement('img');
    img.src = item.image;
    img.alt = item.title || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    inner.appendChild(img);

    var overlay = document.createElement('span');
    overlay.className = 'drift-wall__overlay';
    overlay.setAttribute('aria-hidden', 'true');
    inner.appendChild(overlay);

    if (item.title) {
      var caption = document.createElement('span');
      caption.className = 'drift-wall__caption';
      var t = document.createElement('span');
      t.className = 'drift-wall__title';
      t.textContent = item.title;
      caption.appendChild(t);
      if (item.sub) {
        var s = document.createElement('span');
        s.className = 'drift-wall__sub';
        s.textContent = item.sub;
        caption.appendChild(s);
      }
      inner.appendChild(caption);
    }

    var tile;
    if (item.href) {
      tile = document.createElement('a');
      tile.href = item.href;
      tile.target = '_blank';
      tile.rel = 'noreferrer noopener';
    } else {
      tile = document.createElement('div');
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', item.title || 'tile');
    }
    tile.className = 'drift-wall__tile';
    tile.setAttribute('data-tile-id', id);
    tile.setAttribute('data-col', colIndex);
    tile.appendChild(inner);
    return tile;
  };

  DriftWall.prototype.computeVelocities = function () {
    var conf = this.conf;
    var dirSign = conf.direction === 'up' ? 1 : -1;
    this.baseVelocities = this.columnItems.map(function (_, c) {
      var altSign = c % 2 === 0 ? 1 : -1;
      return conf.speed * columnFactor(c, conf.variance) * dirSign * altSign;
    });
  };

  DriftWall.prototype.attachEvents = function (container) {
    var self = this;
    container.addEventListener('pointermove', function (e) {
      var rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (self.conf.parallax > 0 && !self.reduced) {
        self.pointer.x = (e.clientX - rect.left) / rect.width - 0.5;
        self.pointer.y = (e.clientY - rect.top) / rect.height - 0.5;
      }
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var tile = hit && hit.closest ? hit.closest('[data-tile-id]') : null;
      if (!tile) {
        self.hideTip();
        return;
      }
      var id = tile.getAttribute('data-tile-id');
      self.showTip(id, self.itemsById[id], e.clientX, e.clientY);
      if (id !== self.activeId) {
        self.activeId = id;
        self.hoveredCol = Number(tile.getAttribute('data-col'));
        self.applyActive();
      }
    });
    container.addEventListener('pointerenter', function () { self.wallHovered = true; });
    container.addEventListener('pointerleave', function () {
      self.wallHovered = false;
      self.pointer.x = 0;
      self.pointer.y = 0;
      self.activeId = null;
      self.hoveredCol = -1;
      self.applyActive();
      self.hideTip();
    });
  };

  DriftWall.prototype.createTip = function () {
    var tip = document.createElement('div');
    tip.className = 'driftwall-tip';
    tip.innerHTML =
      '<div class="dt-title"></div>' +
      '<div class="dt-sub"></div>' +
      '<div class="dt-note"></div>';
    document.body.appendChild(tip);
    this.tip = {
      el: tip,
      title: tip.querySelector('.dt-title'),
      sub: tip.querySelector('.dt-sub'),
      note: tip.querySelector('.dt-note')
    };
  };

  DriftWall.prototype.showTip = function (id, item, x, y) {
    if (!item) { this.hideTip(); return; }
    if (id !== this.tipId) {
      this.tipId = id;
      this.tip.title.textContent = item.title || '';
      this.tip.sub.textContent = item.sub || '';
      if (item.note) {
        this.tip.note.textContent = item.note;
        this.tip.note.classList.remove('is-empty');
      } else {
        this.tip.note.textContent = '理解待补充…';
        this.tip.note.classList.add('is-empty');
      }
    }
    this.tip.el.classList.add('show');
    var tw = this.tip.el.offsetWidth;
    var th = this.tip.el.offsetHeight;
    var left = x + 18;
    var top = y + 18;
    if (left + tw > window.innerWidth - 10) left = x - tw - 18;
    if (top + th > window.innerHeight - 10) top = y - th - 18;
    left = Math.max(10, left);
    top = Math.max(10, top);
    this.tip.el.style.left = left + 'px';
    this.tip.el.style.top = top + 'px';
  };

  DriftWall.prototype.hideTip = function () {
    this.tipId = null;
    if (this.tip) this.tip.el.classList.remove('show');
  };

  DriftWall.prototype.applyActive = function () {
    var tiles = this.plane.querySelectorAll('.drift-wall__tile');
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (t.getAttribute('data-tile-id') === this.activeId) {
        t.classList.add('is-active');
      } else {
        t.classList.remove('is-active');
      }
    }
  };

  DriftWall.prototype.applyPlaneTransform = function (px, py) {
    var conf = this.conf;
    if (!this.plane) return;
    this.plane.style.transform =
      'translate(-50%, -50%) scale(1.18) ' +
      'rotateX(' + (conf.tilt + py) + 'deg) ' +
      'rotateY(' + (conf.turn + px) + 'deg) ' +
      'rotateZ(' + conf.roll + 'deg) ' +
      'translateZ(' + (-conf.depth) + 'px)';
  };

  DriftWall.prototype.tick = function (ts) {
    var self = this;
    if (this.lastTs === null) this.lastTs = ts;
    var dt = Math.min(0.05, Math.max(0, ts - this.lastTs) / 1000);
    this.lastTs = ts;

    var conf = this.conf;
    var maxTilt = conf.parallax * 8;
    var targetX = this.pointer.x * maxTilt;
    var targetY = -this.pointer.y * maxTilt;
    var damp = 1 - Math.exp(-dt / 0.12);
    this.pointerDamped.x += (targetX - this.pointerDamped.x) * damp;
    this.pointerDamped.y += (targetY - this.pointerDamped.y) * damp;
    this.applyPlaneTransform(this.pointerDamped.x, this.pointerDamped.y);

    var pausedGlobal = this.wallHovered && conf.pauseOnHover;
    for (var c = 0; c < this.trackEls.length; c++) {
      var el = this.trackEls[c];
      var copyHeight = this.copyHeightOf(this.columnItems[c]);
      var factor = (pausedGlobal || this.hoveredCol === c || this.reduced) ? 0 : 1;
      var target = this.baseVelocities[c] * factor;
      var ease = 1 - Math.exp(-dt / (target === 0 ? 0.16 : 0.28));
      this.velocities[c] += (target - this.velocities[c]) * ease;
      var next = this.offsets[c] + this.velocities[c] * dt;
      next = ((next % copyHeight) + copyHeight) % copyHeight;
      this.offsets[c] = next;
      if (el) el.style.transform = 'translate3d(0,' + (-next) + 'px,0)';
    }

    this.raf = requestAnimationFrame(function (t2) { self.tick(t2); });
  };
})();