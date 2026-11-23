// Run: node test/travel-map.js [--built]
// Real generator and vendored Leaflet; jsdom supplies layout/SVG browser APIs.
// Responsive layout, touch gestures and satellite availability need browser QA.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const repository = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const assetRoot = path.join(repository, built ? 'public' : 'source');
const read = file => fs.readFileSync(path.join(assetRoot, file), 'utf8');
const interaction = read('js/travel-map.js');
const world = read('js/travel-world.js');
const effects = read('js/travel-atlas-effects.js');
const leaflet = read('lib/leaflet/leaflet.js');
const geography = JSON.parse(read('lib/china.json'));
const page = read(built ? 'travel/index.html' : 'travel/index.md');
const sourceDom = new JSDOM(page);
const section = sourceDom.window.document.querySelector('#travel-atlas');
assert.ok(section, 'travel page must contain the map interface');
const markup = section.outerHTML;
sourceDom.window.close();

function generate(posts, root = '/', helper) {
  let generator;
  const hexo = {
    config: { root, url: 'https://MuAn1228.github.io/' },
    source_dir: path.join(repository, 'source'),
    extend: {
      generator: { register(name, callback) { if (name === 'travel-data') generator = callback; } },
      helper: { get(name) { return name === 'url_for' ? helper : undefined; } }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(repository, 'scripts/travel-data.js'), 'utf8'), { hexo, require });
  assert.equal(typeof generator, 'function');
  const result = generator({ posts });
  assert.equal(result.path, 'data/travel.json');
  return JSON.parse(result.data);
}

function post(province, name, date = '2026-10-01', extra = {}) {
  return {
    title: name, path: '2026/10/01/' + name + '/', date,
    categories: { data: [{ name: '旅行', _id: 'travel' }, { name: province, parent: 'travel' }] },
    ...extra
  };
}

const data = generate([
  ['上海', 'shanghai'], ['陕西', 'xian'], ['江苏', 'suzhou'], ['浙江', 'xihu']
].map(([province, filename]) => post(province, filename, '2026-10-01', {
  raw: fs.readFileSync(path.join(repository, 'source/_posts', filename + '.md'), 'utf8')
})));
const liveData = built ? JSON.parse(read('data/travel.json')) : data;
const echoStorageKey = 'blog-travel-echoes-v1';
const expectedGlyphs = { 上海: 'city', 江苏: 'bridge', 浙江: 'lotus', 陕西: 'ruin', 河北: 'waystone' };
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 10));
};

function browser(options = {}) {
  const dom = new JSDOM('<!doctype html><html data-theme="dark"><body>' + markup + '</body></html>', {
    url: 'https://example.test/travel/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const window = dom.window;
  const document = window.document;
  const calls = { requests: [], removed: 0, maps: [], observers: [], media: [], frames: new Map(), canvasDraws: 0, storageWrites: [], landmarkSelections: [] };
  if (options.storage !== undefined) window.localStorage.setItem(echoStorageKey, typeof options.storage === 'string' ? options.storage : JSON.stringify(options.storage));
  const setStorage = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = function (key, value) {
    calls.storageWrites.push({ key, value: String(value) });
    return setStorage.call(this, key, value);
  };
  if (options.storageUnavailable) Object.defineProperty(window, 'localStorage', {
    get() { throw new window.DOMException('Storage is unavailable', 'SecurityError'); }
  });
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: options.mobile ? 390 : 1280, configurable: true });
  window.matchMedia = query => {
    const listeners = new Set();
    const media = {
      matches: query.includes('reduced-motion') ? options.reducedMotion !== false : !!(options.mobile && /max-width|pointer: coarse/.test(query)),
      media: query,
      addEventListener(name, callback) { if (name === 'change') listeners.add(callback); },
      removeEventListener(name, callback) { if (name === 'change') listeners.delete(callback); },
      addListener(callback) { listeners.add(callback); },
      removeListener(callback) { listeners.delete(callback); },
      change(matches) { this.matches = matches; for (const callback of listeners) callback({ matches, media: query }); }
    };
    calls.media.push(media);
    return media;
  };
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    const frame = requestFrame(timestamp => { calls.frames.delete(frame); callback(timestamp); });
    calls.frames.set(frame, callback);
    return frame;
  };
  window.cancelAnimationFrame = frame => { calls.frames.delete(frame); cancelFrame(frame); };
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (options.noCanvas) return null;
    if (!this.context) {
      const noop = () => {};
      this.context = {
        canvas: this, setTransform: noop, resetTransform: noop, scale: noop, translate: noop,
        clearRect() { calls.canvasDraws++; }, fillRect() { calls.canvasDraws++; }, beginPath: noop, closePath: noop,
        moveTo: noop, lineTo: noop, arc: noop, fill: noop, stroke: noop, save: noop, restore: noop,
        createRadialGradient() { return { addColorStop: noop }; },
        createLinearGradient() { return { addColorStop: noop }; }
      };
    }
    return this.context;
  };
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  const bounds = { x: 0, y: 0, left: 0, top: 0, right: 760, bottom: 520, width: 760, height: 520 };
  window.HTMLElement.prototype.getBoundingClientRect = function () { return bounds; };
  for (const key of ['clientWidth', 'offsetWidth']) Object.defineProperty(window.HTMLElement.prototype, key, { get: () => 760 });
  for (const key of ['clientHeight', 'offsetHeight']) Object.defineProperty(window.HTMLElement.prototype, key, { get: () => 520 });
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); calls.observers.push(this); }
    observe(target) { this.targets.add(target); this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    change(isIntersecting) { this.callback([...this.targets].map(target => ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 })), this); }
  };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let dataFailures = options.failData || 0;
  let geographyFailures = options.failGeography || 0;
  window.fetch = async (url, fetchOptions = {}) => {
    const pathname = new URL(url, window.location.href).pathname;
    const request = { url: String(url), options: fetchOptions };
    calls.requests.push(request);
    if (options.pending) return new Promise(resolve => { request.resolve = resolve; });
    const isData = pathname.endsWith('/data/travel.json');
    if ((isData && dataFailures-- > 0) || (!isData && geographyFailures-- > 0)) {
      return { ok: false, status: 503, json: async () => ({ error: 'temporary unavailable' }) };
    }
    return { ok: true, status: 200, json: async () => isData ? (options.data || liveData) : geography };
  };
  window.eval(leaflet);
  window.eval(world);
  window.eval(effects);
  const createEffects = window.__createTravelAtlasEffects;
  window.__createTravelAtlasEffects = function (map, root, geometry, visited, effectOptions) {
    const onSelect = effectOptions.onSelect;
    return createEffects(map, root, geometry, visited, {
      ...effectOptions,
      onSelect(name) { calls.landmarkSelections.push(name); if (onSelect) onSelect(name); }
    });
  };
  const originalMap = window.L.map;
  window.L.map = function (...args) { const map = originalMap.apply(this, args); calls.maps.push(map); return map; };
  const originalRemove = window.L.Map.prototype.remove;
  window.L.Map.prototype.remove = function () { calls.removed++; return originalRemove.call(this); };
  const run = () => window.eval(interaction);
  if (!options.noLeaflet) run();
  else { delete window.L; run(); }
  const find = selector => document.querySelector(selector);
  return {
    dom, window, document, calls, run, find,
    async ready() { await flush(); },
    async wheel(deltaY) {
      const event = new window.WheelEvent('wheel', {
        deltaY, deltaMode: 0, clientX: 380, clientY: 260,
        bubbles: true, cancelable: true
      });
      find('#travel-map').dispatchEvent(event);
      // Wait for Leaflet's actual wheel debounce rather than invoking its handler.
      await new Promise(resolve => setTimeout(resolve, calls.maps[0].options.wheelDebounceTime + 30));
      await flush();
      return event;
    },
    click(selector) { const node = find(selector); assert.ok(node, 'missing control: ' + selector); node.click(); return node; },
    province(name) {
      const button = [...document.querySelectorAll('#travel-provinces button')].find(node => node.textContent.includes(name));
      assert.ok(button, 'missing province button: ' + name);
      button.click();
      return button;
    },
    event(name) { document.dispatchEvent(new window.Event(name)); },
    close() { document.dispatchEvent(new window.Event('pjax:send')); window.close(); }
  };
}

async function using(options, callback) {
  const b = browser(options);
  try { await b.ready(); await callback(b); } finally { b.close(); }
}

function selectionImage(b) {
  const cover = b.find('#travel-selection-cover');
  assert.ok(cover, 'selection photo must have an identifiable container');
  return cover.tagName === 'IMG' ? cover : cover.querySelector('img');
}

function assetExists(url) {
  const pathname = decodeURIComponent(new URL(url, 'https://example.test').pathname).replace(/^\//, '');
  return fs.existsSync(path.join(assetRoot, pathname));
}

(async () => {
  let passed = 0;
  let failed = 0;
  async function check(name, callback) {
    try { await callback(); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }

  await check('manual footprint has zero articles and adding its first article counts once', () => {
    const empty = generate([]);
    assert.deepEqual(empty.visited, ['河北']);
    assert.equal(empty.counts.河北, 0);
    assert.deepEqual(empty.posts.河北, []);
    assert.equal(empty.totalPosts, 0);
    const first = generate([post('河北省', 'hebei-first')]);
    assert.deepEqual(first.visited, ['河北']);
    assert.equal(first.counts.河北, 1);
    assert.equal(first.totalPosts, 1);
  });

  await check('published province categories are normalized and drafts/unrelated posts excluded', () => {
    const result = generate([
      post('广西壮族自治区', 'guangxi'), post('北京市', 'beijing'),
      post('上海', 'draft-a', undefined, { published: false }),
      post('浙江', 'draft-b', undefined, { draft: true }),
      post('江苏', 'draft-c', undefined, { layout: 'draft' }),
      post('广东', 'other', undefined, { categories: { data: [{ name: '生活' }, { name: '广东' }] } })
    ]);
    assert.deepEqual(result.visited.sort(), ['北京', '广西', '河北'].sort());
    assert.equal(result.totalPosts, 2);
  });

  await check('duplicate/multiple province categories do not inflate article totals', () => {
    const entry = post('浙江', 'joint');
    entry.categories.data.push({ name: '浙江省', parent: 'travel' }, { name: '江苏省', parent: 'travel' });
    const result = generate([entry, entry]);
    assert.equal(result.counts.浙江, 1);
    assert.equal(result.counts.江苏, 1);
    assert.equal(result.totalPosts, 1);
  });

  await check('records sort newest first and article URLs honor the configured root', () => {
    const result = generate([post('浙江', 'old', '2025-01-01'), post('浙江', 'new', '2026-11-01')], '/blog/');
    assert.deepEqual(result.posts.浙江.map(entry => entry.title), ['new', 'old']);
    assert.equal(result.posts.浙江[0].date, '2026-11-01');
    assert.equal(result.posts.浙江[0].url, '/blog/2026/10/01/new/');
  });

  await check('Hexo url_for helper is used for actual generated article paths', () => {
    const paths = [];
    const result = generate([post('陕西', 'route')], '/', function (value) { paths.push(value); return '/configured/' + value; });
    assert.deepEqual(paths, ['2026/10/01/route/']);
    assert.equal(result.posts.陕西[0].url, '/configured/2026/10/01/route/');
  });

  await check('travel media uses existing local photos and excerpts remain original readable text', () => {
    const photo = '/img/posts/xihu/001.webp';
    assert.ok(fs.existsSync(path.join(repository, 'source', photo)));
    const sentence = '清晨走过湖畔，远处的晨光照亮了水面。';
    const result = generate([post('浙江', 'photo', '2026-11-23', {
      raw: '![湖畔](' + photo + ')\n\n' + sentence
    })]);
    const entry = result.posts.浙江[0];
    assert.equal(entry.cover, photo);
    assert.equal(entry.excerpt, sentence);
    const html = generate([post('浙江', 'html', '2026-11-23', {
      content: '<p>站在<strong>湖畔</strong>，看见晨光。</p><p>记录完毕。</p>'
    })]).posts.浙江[0];
    assert.ok(html.excerpt.includes('湖畔'));
    assert.doesNotMatch(html.excerpt, /<[^>]*>/);
    assert.ok(html.excerpt.length <= 80);
    const rooted = generate([post('浙江', 'root-photo', '2026-11-23', {
      raw: sentence + '\n\n![湖畔](' + photo + ')'
    })], '/blog/').posts.浙江[0];
    assert.equal(rooted.cover, '/blog' + photo);
  });

  await check('missing text/photos never become invented media or broken remote cover URLs', () => {
    const empty = generate([post('河北', 'missing')]).posts.河北[0];
    assert.equal(empty.cover, '');
    assert.equal(empty.excerpt, '');
    for (const cover of ['/img/posts/does-not-exist.webp', 'https://other.test/photo.webp']) {
      const entry = generate([post('浙江', 'bad-photo', '2026-11-23', {
        cover, raw: '![照片](' + cover + ')'
      })]).posts.浙江[0];
      assert.equal(entry.cover, '');
      assert.equal(entry.excerpt, '');
    }
    for (const entries of Object.values(data.posts)) for (const entry of entries) {
      assert.ok(entry.cover && assetExists(entry.cover), 'real travel article must resolve its actual local photograph');
      assert.ok(entry.excerpt && entry.excerpt.length <= 80);
      assert.doesNotMatch(entry.excerpt, /<[^>]*>|^title:|^date:|^categories:/);
    }
  });

  await check('actual map has five footprints/four articles and loads no satellite tiles by default', () => using({}, b => {
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    assert.equal(b.find('#travel-stat-posts').textContent, '4');
    assert.equal(b.document.querySelectorAll('#travel-provinces button').length, 5);
    assert.equal(b.calls.maps.length, 1);
    assert.equal(b.document.querySelectorAll('.leaflet-tile').length, 0);
    assert.equal(b.document.querySelectorAll('.travel-province-shape.is-visited').length, 5);
    assert.ok(b.document.querySelectorAll('.travel-province-shape').length >= 34);
    assert.ok(b.find('.travel-map-boundary'), 'unnamed boundary feature must remain visible');
  }));

  await check('footprint landmarks are accessible while their decorative star chain stays unfocusable', () => using({}, b => {
    const constellation = b.find('.travel-constellation');
    assert.ok(constellation, 'footprint constellation must render with the actual map');
    assert.equal(b.document.querySelectorAll('.travel-constellation').length, 1);
    const nodes = [...constellation.querySelectorAll('g.travel-star-node[data-province]')];
    assert.deepEqual(nodes.map(node => node.dataset.province).sort(), [...liveData.visited].sort());
    assert.equal(nodes.length, 5, 'no unvisited province may become a glowing footprint');
    const links = [...constellation.querySelectorAll('path.travel-star-link')];
    const comets = [...constellation.querySelectorAll('path.travel-star-comet')];
    assert.equal(links.length, nodes.length - 1);
    assert.equal(comets.length, links.length);
    assert.deepEqual(comets.map(path => path.getAttribute('d')).sort(), links.map(path => path.getAttribute('d')).sort(), 'light flows must follow the actual decorative arcs');
    assert.ok(constellation.querySelector('.travel-star-grid'));
    assert.equal(constellation.getAttribute('role'), 'group');
    assert.ok(constellation.getAttribute('aria-label'));
    assert.notEqual(constellation.getAttribute('aria-hidden'), 'true', 'landmark controls must remain in the accessibility tree');
    const focusable = [...constellation.querySelectorAll('button, a, [role="button"], [tabindex="0"]')];
    assert.equal(focusable.length, 5);
    assert.ok(focusable.every(node => nodes.includes(node)), 'only the five actual landmarks may be interactive in the effects layer');
    for (const node of nodes) {
      assert.equal(node.getAttribute('role'), 'button');
      assert.equal(node.getAttribute('tabindex'), '0');
      assert.equal(node.getAttribute('aria-pressed'), 'false');
      assert.ok(node.getAttribute('aria-label').includes(node.dataset.province));
    }
    for (const decoration of constellation.querySelectorAll('.travel-star-link, .travel-star-comet, .travel-star-grid, .travel-world-terrain, .travel-world-compass')) {
      assert.notEqual(decoration.getAttribute('tabindex'), '0');
      assert.notEqual(decoration.getAttribute('role'), 'button');
      assert.equal(decoration.querySelectorAll('a, button, [role="button"], [tabindex="0"]').length, 0);
    }
    assert.equal(constellation.closest('.leaflet-pane').style.pointerEvents, 'none', 'empty areas of the effects pane must not intercept map interaction');
  }));

  await check('five personal landmarks use distinct SVG glyphs and original regional relics', () => using({}, b => {
    const regions = b.window.__travelWorld.regions;
    const seals = [...b.document.querySelectorAll('#travel-seals button.travel-seal')];
    assert.equal(seals.length, 5);
    assert.equal(b.find('#travel-discovery-total').textContent.trim(), '5');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '0');
    assert.ok(b.find('.travel-world-terrain'));
    assert.ok(b.find('.travel-world-compass'));
    const artwork = [];
    const relics = [];
    for (const [province, glyph] of Object.entries(expectedGlyphs)) {
      assert.equal(regions[province].glyph, glyph);
      assert.ok(regions[province].caption && regions[province].relic);
      relics.push(regions[province].relic);
      const seal = seals.find(seal => seal.dataset.province === province);
      assert.ok(seal);
      assert.equal(seal.dataset.glyph, glyph);
      const sealArt = seal.querySelector('svg.travel-seal-art');
      assert.ok(sealArt, 'each seal must reuse its personal SVG landmark');
      assert.equal(sealArt.dataset.glyph, glyph);
      assert.equal(sealArt.getAttribute('aria-hidden'), 'true');
      assert.ok(sealArt.querySelector('path, rect, polygon, polyline, line'));
      assert.equal(sealArt.querySelectorAll('.travel-landmark').length, 0, 'seal artwork must not inflate map landmark counts');
      const drawing = b.find('.travel-star-node[data-province="' + province + '"] .travel-landmark[data-glyph="' + glyph + '"]');
      assert.ok(drawing, 'missing personal landmark for ' + province);
      const forms = [...drawing.querySelectorAll('path, rect, polygon, polyline, line')];
      assert.ok(forms.length > 0, 'landmarks must have hand-drawn forms beyond generic circles');
      artwork.push(forms.map(node => [node.tagName, ...[...node.attributes].filter(attribute => /^(d|x|y|x1|y1|x2|y2|width|height|points)$/.test(attribute.name)).map(attribute => attribute.name + '=' + attribute.value)].join(':')).join('|'));
    }
    assert.equal(new Set(artwork).size, 5, 'the five landmarks must have visually different geometry');
    assert.equal(new Set(relics).size, 5);
  }));

  await check('clicking an offset landmark or pressing Enter/Space selects and awakens it exactly once', () => using({}, async b => {
    const glyph = province => b.find('.travel-star-node[data-province="' + province + '"] .travel-landmark');
    const node = province => b.find('.travel-star-node[data-province="' + province + '"]');
    const clickGlyph = province => {
      const drawing = glyph(province);
      assert.ok(drawing);
      const paintedPart = drawing.querySelector('path, rect, polygon, polyline, line');
      assert.ok(paintedPart);
      paintedPart.dispatchEvent(new b.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    // Repeated initialization and map redraws must not add another activation listener.
    b.run(); b.event('pjax:complete');
    await b.wheel(-120);
    b.click('[data-map-view="satellite"]'); b.click('[data-map-view="atlas"]');
    clickGlyph('上海');
    assert.deepEqual(b.calls.landmarkSelections, ['上海']);
    assert.equal(b.find('#travel-selection-title').textContent, '上海');
    assert.equal(node('上海').getAttribute('aria-pressed'), 'true');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
    assert.ok(b.find('#travel-seals [data-province="上海"]').classList.contains('is-awakened'));
    assert.ok(b.find('#travel-selection-posts a'));
    node('浙江').dispatchEvent(new b.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    assert.deepEqual(b.calls.landmarkSelections, ['上海']);
    const enter = new b.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    node('浙江').dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.equal(b.find('#travel-selection-title').textContent, '浙江');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '2');
    const space = new b.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    node('河北').dispatchEvent(space);
    assert.equal(space.defaultPrevented, true);
    assert.equal(b.find('#travel-selection-title').textContent, '河北');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '3');
    assert.equal(b.find('#travel-selection-posts').querySelectorAll('a').length, 0);
    clickGlyph('河北');
    assert.deepEqual(b.calls.landmarkSelections, ['上海', '浙江', '河北', '河北']);
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '3', 'reselecting a landmark must not awaken it twice');
    b.event('pjax:send');
    b.document.body.innerHTML = markup;
    b.event('pjax:complete');
    await b.ready();
    clickGlyph('江苏');
    assert.deepEqual(b.calls.landmarkSelections, ['上海', '浙江', '河北', '河北', '江苏']);
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '4');
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
  }));

  await check('selecting a real footprint awakens its seal once and preserves actual travel totals', () => using({}, b => {
    const choose = province => b.click('#travel-seals [data-province="' + province + '"]');
    choose('河北');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
    assert.equal(b.find('#travel-seals [data-province="河北"]').classList.contains('is-awakened'), true);
    assert.equal(b.find('.travel-star-node[data-province="河北"]').classList.contains('is-awakened'), true);
    assert.ok(b.find('#travel-selection-relic').textContent.includes(b.window.__travelWorld.regions.河北.relic));
    assert.equal(b.find('#travel-selection-posts').querySelectorAll('a').length, 0);
    choose('河北');
    b.province('河北');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
    assert.deepEqual(JSON.parse(b.window.localStorage.getItem(echoStorageKey)), ['河北']);
    for (const province of ['上海', '江苏', '浙江', '陕西']) choose(province);
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '5');
    assert.equal(b.document.querySelectorAll('#travel-seals .is-awakened').length, 5);
    assert.equal(b.document.querySelectorAll('.travel-star-node.is-awakened').length, 5);
    assert.deepEqual(JSON.parse(b.window.localStorage.getItem(echoStorageKey)).sort(), [...liveData.visited].sort());
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    assert.equal(b.find('#travel-stat-posts').textContent, '4');
    assert.ok(b.find('#travel-discovery-status').textContent.trim());
  }));

  await check('unvisited provinces can be inspected without inventing discoveries or articles', () => using({}, b => {
    const shape = b.find('.travel-province-shape[aria-label^="北京"]');
    assert.ok(shape);
    shape.dispatchEvent(new b.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '0');
    assert.equal(b.document.querySelectorAll('#travel-seals .is-awakened').length, 0);
    assert.equal(b.find('#travel-selection-posts').querySelectorAll('a').length, 0);
    const stored = b.window.localStorage.getItem(echoStorageKey);
    assert.ok(!stored || JSON.parse(stored).length === 0);
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    assert.equal(b.find('#travel-stat-posts').textContent, '4');
  }));

  await check('awakened seals persist across a fresh page and invalid stored provinces are filtered', async () => {
    let saved;
    await using({}, b => {
      b.province('上海'); b.province('浙江');
      saved = b.window.localStorage.getItem(echoStorageKey);
    });
    await using({ storage: saved }, b => {
      assert.equal(b.find('#travel-discovery-count').textContent.trim(), '2');
      assert.equal(b.document.querySelectorAll('#travel-seals .is-awakened').length, 2);
      assert.equal(b.find('.travel-star-node[data-province="上海"]').classList.contains('is-awakened'), true);
      assert.equal(b.find('.travel-star-node[data-province="浙江"]').classList.contains('is-awakened'), true);
      b.province('浙江');
      assert.equal(b.find('#travel-discovery-count').textContent.trim(), '2');
    });
    await using({ storage: ['上海', '上海', '北京', null, {}, 7, '__proto__', '河北'] }, b => {
      assert.equal(b.find('#travel-discovery-count').textContent.trim(), '2');
      assert.equal(b.document.querySelectorAll('.travel-star-node.is-awakened').length, 2);
      b.province('江苏');
      assert.deepEqual(JSON.parse(b.window.localStorage.getItem(echoStorageKey)).sort(), ['上海', '江苏', '河北'].sort());
    });
    for (const invalid of ['not json', '{"上海":true}', 'null']) await using({ storage: invalid }, b => {
      assert.equal(b.find('#travel-discovery-count').textContent.trim(), '0');
      b.province('河北');
      assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
    });
  });

  await check('blocked localStorage keeps map selection and in-memory discovery usable', () => using({ storageUnavailable: true }, b => {
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '0');
    b.province('浙江');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
    assert.equal(b.find('.travel-star-node[data-province="浙江"]').classList.contains('is-awakened'), true);
    assert.ok(b.find('#travel-selection-posts a'));
    b.province('浙江');
    assert.equal(b.find('#travel-discovery-count').textContent.trim(), '1');
  }));

  await check('selected travel memories show real local covers and original excerpts while Hebei stays honest', () => using({}, b => {
    for (const province of ['上海', '江苏', '浙江', '陕西']) {
      b.province(province);
      const record = liveData.posts[province][0];
      const image = selectionImage(b);
      assert.ok(image && image.getAttribute('src'));
      assert.equal(image.src, new URL(record.cover, b.window.location.href).href);
      assert.ok(assetExists(record.cover));
      assert.equal(image.closest('[hidden]'), null);
      const quote = b.find('#travel-selection-quote');
      assert.ok(quote.textContent.includes(record.excerpt));
      assert.equal(quote.querySelectorAll('img, script, iframe').length, 0);
      assert.ok(b.find('#travel-selection-relic').textContent.includes(b.window.__travelWorld.regions[province].relic));
    }
    b.province('河北');
    const image = selectionImage(b);
    assert.ok(!image || !image.getAttribute('src') || image.closest('[hidden]'));
    const quote = b.find('#travel-selection-quote');
    assert.ok(!quote.textContent.trim() || quote.hidden || quote.closest('[hidden]'));
    assert.equal(b.find('#travel-selection-posts').querySelectorAll('a').length, 0);
  }));

  await check('memory excerpts stay text and unsafe or failed cover images are hidden', async () => {
    const altered = JSON.parse(JSON.stringify(data));
    altered.posts.浙江[0].excerpt = '<img src=x onerror=alert(1)>这是原文摘录。';
    altered.posts.浙江[0].cover = 'https://other.test/fake.webp';
    await using({ data: altered }, b => {
      b.province('浙江');
      const quote = b.find('#travel-selection-quote');
      assert.ok(quote.textContent.includes(altered.posts.浙江[0].excerpt));
      assert.equal(quote.querySelectorAll('img, script').length, 0);
      const image = selectionImage(b);
      assert.ok(!image || !image.getAttribute('src') || image.closest('[hidden]'));
    });
    await using({}, b => {
      b.province('浙江');
      const image = selectionImage(b);
      assert.ok(image);
      image.dispatchEvent(new b.window.Event('error'));
      assert.ok(image.hidden || image.closest('[hidden]'), 'broken local photo must not leave a broken-image placeholder');
    });
  });

  await check('constellation node projection and arcs update after real wheel zoom', () => using({}, async b => {
    const node = b.find('.travel-star-node[data-province="河北"]');
    const link = b.find('.travel-star-link');
    assert.ok(node && link);
    const nodeBefore = node.getAttribute('transform');
    const arcBefore = link.getAttribute('d');
    await b.wheel(-120);
    const nodeAfter = b.find('.travel-star-node[data-province="河北"]').getAttribute('transform');
    const arcAfter = b.find('.travel-star-link').getAttribute('d');
    assert.notEqual(nodeAfter, nodeBefore);
    assert.notEqual(arcAfter, arcBefore);
    assert.doesNotMatch(nodeAfter + arcAfter, /NaN|Infinity|undefined/);
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
  }));

  await check('effects toggle preserves static footprints and always respects reduced motion', () => using({}, async b => {
    const root = b.find('#travel-atlas');
    assert.equal(root.dataset.mapEffects, 'off');
    assert.equal(b.find('[data-map-action="effects"]').getAttribute('aria-pressed'), 'false');
    b.click('[data-map-action="effects"]');
    assert.equal(root.dataset.mapEffects, 'on');
    assert.equal(root.dataset.mapPaused, 'true', 'explicit effects choice must still respect the system motion preference');
    const draws = b.calls.canvasDraws;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(b.calls.canvasDraws, draws, 'reduced motion must not start a canvas animation loop');
    b.click('[data-map-action="effects"]');
    assert.equal(root.dataset.mapEffects, 'off');
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5, 'switching motion off must retain static footprint context');
    assert.equal(b.document.querySelectorAll('.travel-star-link').length, 4);
  }));

  await check('constellation initializes once whichever independent resource finishes first', async () => {
    for (const order of [['travel.json', 'china.json'], ['china.json', 'travel.json']]) {
      await using({ pending: true }, async b => {
        for (const filename of order) {
          const request = b.calls.requests.find(request => request.url.endsWith(filename));
          assert.ok(request);
          request.resolve({ ok: true, json: async () => filename === 'travel.json' ? liveData : geography });
          await b.ready();
        }
        assert.equal(b.document.querySelectorAll('.travel-constellation').length, 1);
        assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
        assert.equal(b.document.querySelectorAll('.travel-star-link').length, 4);
      });
    }
  });

  await check('satellite view switches reuse the same footprint effects layer', () => using({}, b => {
    const original = b.find('.travel-constellation');
    for (let index = 0; index < 3; index++) {
      b.click('[data-map-view="satellite"]');
      b.click('[data-map-view="atlas"]');
    }
    assert.equal(b.find('.travel-constellation'), original);
    assert.equal(b.document.querySelectorAll('.travel-constellation').length, 1);
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
    assert.equal(b.find('#travel-atlas').querySelectorAll('canvas').length, 1);
  }));

  await check('starfield animation stops while hidden/offscreen/reduced and cleans up on navigation', () => using({ reducedMotion: false }, async b => {
    const root = b.find('#travel-atlas');
    assert.equal(root.dataset.mapEffects, 'on');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(b.calls.canvasDraws > 0, 'active starfield must draw through the real animation scheduler');
    Object.defineProperty(b.document, 'hidden', { value: true, configurable: true });
    b.event('visibilitychange');
    assert.equal(root.dataset.mapPaused, 'true');
    const hiddenDraws = b.calls.canvasDraws;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(b.calls.canvasDraws, hiddenDraws);
    assert.equal(b.calls.frames.size, 0);
    Object.defineProperty(b.document, 'hidden', { value: false, configurable: true });
    b.event('visibilitychange');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(b.calls.canvasDraws > hiddenDraws, 'foreground must resume an enabled starfield');
    for (const observer of b.calls.observers) observer.change(false);
    assert.equal(root.dataset.mapPaused, 'true');
    const offscreenDraws = b.calls.canvasDraws;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(b.calls.canvasDraws, offscreenDraws);
    assert.equal(b.calls.frames.size, 0);
    for (const observer of b.calls.observers) observer.change(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(b.calls.canvasDraws > offscreenDraws);
    b.calls.media.find(media => media.media.includes('reduced-motion')).change(true);
    assert.equal(root.dataset.mapPaused, 'true');
    const reducedDraws = b.calls.canvasDraws;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(b.calls.canvasDraws, reducedDraws);
    assert.equal(b.calls.frames.size, 0);
    b.event('pjax:send');
    assert.equal(root.querySelectorAll('canvas, .travel-constellation').length, 0);
    assert.equal(b.calls.frames.size, 0);
    assert.ok(b.calls.observers.every(observer => observer.targets.size === 0));
  }));

  await check('Hebei selection stays on page and has no fabricated record or dead category link', () => using({}, b => {
    const button = b.province('河北');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(b.find('#travel-selection-title').textContent, '河北');
    assert.equal(b.document.querySelectorAll('#travel-selection-posts a').length, 0);
    assert.ok(b.find('#travel-selection-summary').textContent.trim());
    assert.equal(liveData.counts.河北, 0);
    assert.equal(b.window.location.pathname, '/travel/');
    assert.equal(b.document.querySelectorAll('a[href*="%E6%B2%B3%E5%8C%97"], a[href*="河北"]').length, 0);
  }));

  await check('selecting a recorded province presents its real article URL', () => using({}, b => {
    b.province('浙江');
    const anchor = b.find('#travel-selection-posts a');
    assert.ok(anchor);
    assert.equal(anchor.href, new URL(liveData.posts.浙江[0].url, b.window.location.href).href);
    assert.ok(anchor.textContent.includes(liveData.posts.浙江[0].title));
    assert.equal(b.document.querySelectorAll('#travel-provinces button[aria-pressed="true"]').length, 1);
  }));

  await check('record titles render as text and unsafe article destinations are rejected', () => {
    const altered = JSON.parse(JSON.stringify(data));
    altered.posts.浙江 = [
      { title: '<img src=x onerror=alert(1)>', url: '/safe/', date: '2026-11-01' },
      { title: 'script', url: 'javascript:alert(1)', date: '2026-11-01' },
      { title: 'external', url: 'https://other.test/', date: '2026-11-01' }
    ];
    return using({ data: altered }, b => {
      b.province('浙江');
      assert.equal(b.document.querySelectorAll('#travel-selection-posts img').length, 0);
      const anchors = [...b.document.querySelectorAll('#travel-selection-posts a')];
      assert.equal(anchors.length, 1);
      assert.equal(anchors[0].href, 'https://example.test/safe/');
      assert.ok(anchors[0].textContent.includes('<img'));
    });
  });

  await check('satellite tiles are created only after selecting satellite and removed for atlas', () => using({}, b => {
    b.click('[data-map-view="satellite"]');
    assert.equal(b.find('[data-map-view="satellite"]').getAttribute('aria-pressed'), 'true');
    assert.ok(b.document.querySelectorAll('img.leaflet-tile').length > 0);
    b.click('[data-map-view="atlas"]');
    assert.equal(b.document.querySelectorAll('img.leaflet-tile').length, 0);
  }));

  await check('province paths can be selected with the keyboard', () => using({}, b => {
    const shape = b.find('.travel-province-shape[aria-label^="浙江"]');
    assert.ok(shape);
    assert.equal(shape.getAttribute('role'), 'button');
    assert.equal(shape.getAttribute('tabindex'), '0');
    shape.dispatchEvent(new b.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(b.find('#travel-selection-title').textContent, '浙江');
    assert.equal(shape.getAttribute('aria-pressed'), 'true');
    assert.ok(b.find('#travel-selection-posts a'));
  }));

  await check('desktop wheel events zoom the real Leaflet map in both directions', () => using({}, async b => {
    const map = b.calls.maps[0];
    const initial = map.getZoom();
    const zoomIn = await b.wheel(-120);
    assert.ok(map.getZoom() > initial, 'scrolling up on the map must zoom in');
    assert.equal(zoomIn.defaultPrevented, true, 'map zoom must consume the wheel event');
    const enlarged = map.getZoom();
    const zoomOut = await b.wheel(120);
    assert.ok(map.getZoom() < enlarged, 'scrolling down on the map must zoom out');
    assert.equal(zoomOut.defaultPrevented, true);
  }));

  await check('touch mode enables wheel zoom only during explicit map interaction', () => using({ mobile: true }, async b => {
    const map = b.calls.maps[0];
    assert.equal(map.dragging.enabled(), false);
    assert.equal(map.touchZoom.enabled(), false);
    assert.equal(map.scrollWheelZoom.enabled(), false);
    const initial = map.getZoom();
    const beforeInteraction = await b.wheel(-120);
    assert.equal(map.getZoom(), initial);
    assert.equal(beforeInteraction.defaultPrevented, false, 'inactive map must leave page scrolling available');
    b.click('[data-map-action="interact"]');
    assert.equal(map.dragging.enabled(), true);
    assert.equal(map.touchZoom.enabled(), true);
    assert.equal(map.scrollWheelZoom.enabled(), true);
    assert.equal(b.find('[data-map-action="interact"]').getAttribute('aria-pressed'), 'true');
    const duringInteraction = await b.wheel(-120);
    assert.ok(map.getZoom() > initial, 'wheel zoom must work after enabling map interaction');
    assert.equal(duringInteraction.defaultPrevented, true);
    const enlarged = map.getZoom();
    b.click('[data-map-action="interact"]');
    assert.equal(map.dragging.enabled(), false);
    assert.equal(map.touchZoom.enabled(), false);
    assert.equal(map.scrollWheelZoom.enabled(), false);
    const afterInteraction = await b.wheel(120);
    assert.equal(map.getZoom(), enlarged);
    assert.equal(afterInteraction.defaultPrevented, false, 'finishing map interaction must restore page scrolling');
  }));

  await check('satellite tile failure returns to the usable footprint basemap', () => using({}, b => {
    b.click('[data-map-view="satellite"]');
    let tiles;
    b.calls.maps[0].eachLayer(layer => { if (layer instanceof b.window.L.TileLayer) tiles = layer; });
    assert.ok(tiles);
    tiles.fire('tileerror');
    assert.equal(b.find('#travel-map').dataset.mapView, 'atlas');
    assert.equal(b.document.querySelectorAll('img.leaflet-tile').length, 0);
    assert.ok(b.find('#travel-map-status').textContent.includes('卫星'));
    b.province('浙江');
    assert.ok(b.find('#travel-selection-posts a'));
  }));

  await check('missing Leaflet still leaves the records and a useful retry action', () => using({ noLeaflet: true }, b => {
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    b.province('浙江');
    assert.ok(b.find('#travel-selection-posts a'));
    assert.equal(b.find('#travel-map-retry').hidden, false);
  }));

  await check('data HTTP failure preserves unknown totals and retry restores real footprints', () => using({ failData: 1 }, async b => {
    assert.notEqual(b.find('#travel-stat-provinces').textContent, '0');
    assert.notEqual(b.find('#travel-stat-posts').textContent, '0');
    assert.equal(b.find('#travel-map-retry').hidden, false);
    b.click('#travel-map-retry');
    await b.ready();
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    assert.equal(b.find('#travel-stat-posts').textContent, '4');
    assert.equal(b.find('#travel-map-retry').hidden, true);
  }));

  await check('geography failure keeps province records available and retry rebuilds the map', () => using({ failGeography: 1 }, async b => {
    assert.equal(b.find('#travel-stat-provinces').textContent, '5');
    b.province('浙江');
    assert.ok(b.find('#travel-selection-posts a'));
    assert.equal(b.find('#travel-map-retry').hidden, false);
    b.click('#travel-map-retry');
    await b.ready();
    assert.equal(b.document.querySelectorAll('.travel-province-shape.is-visited').length, 5);
  }));

  await check('repeat initialization and PJAX completion do not duplicate map/listeners', () => using({}, async b => {
    b.run();
    b.event('pjax:complete');
    await b.ready();
    assert.equal(b.calls.maps.length, 1);
    assert.equal(b.document.querySelectorAll('.leaflet-map-pane').length, 1);
    assert.equal(b.document.querySelectorAll('#travel-provinces button').length, 5);
    assert.equal(b.document.querySelectorAll('.travel-constellation').length, 1);
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
  }));

  await check('PJAX departure removes Leaflet and re-entry creates exactly one new map', () => using({}, async b => {
    b.event('pjax:send');
    assert.equal(b.calls.removed, 1);
    b.document.querySelector('#travel-atlas').remove();
    b.document.body.innerHTML = markup;
    b.event('pjax:complete');
    await b.ready();
    assert.equal(b.calls.maps.length, 2);
    assert.equal(b.document.querySelectorAll('.leaflet-map-pane').length, 1);
    assert.equal(b.document.querySelectorAll('#travel-provinces button').length, 5);
    assert.equal(b.document.querySelectorAll('.travel-constellation').length, 1);
    assert.equal(b.document.querySelectorAll('.travel-star-node').length, 5);
  }));

  await check('navigation aborts pending requests and late replies do not revive the old map', () => using({ pending: true }, async b => {
    assert.ok(b.calls.requests.length >= 2);
    b.event('pjax:send');
    assert.ok(b.calls.requests.every(request => request.options.signal && request.options.signal.aborted));
    b.document.querySelector('#travel-atlas').remove();
    for (const request of b.calls.requests) request.resolve({ ok: true, json: async () => request.url.includes('travel.json') ? data : geography });
    await b.ready();
    assert.equal(b.document.querySelectorAll('.leaflet-map-pane').length, 0);
  }));

  if (built) await check('every built travel record links to an existing generated page', () => {
    assert.equal(liveData.counts.河北, 0);
    assert.equal(liveData.totalPosts, 4);
    for (const entries of Object.values(liveData.posts)) for (const entry of entries) {
      const pathname = decodeURIComponent(new URL(entry.url, 'https://example.test').pathname).replace(/^\//, '');
      const filename = path.join(assetRoot, pathname, pathname.endsWith('/') ? 'index.html' : '');
      assert.ok(fs.existsSync(filename), 'missing generated article: ' + entry.url);
    }
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed' + (built ? ' (built assets)' : ''));
  process.exitCode = failed ? 1 : 0;
})();
