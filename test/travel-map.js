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
    config: { root },
    extend: {
      generator: { register(name, callback) { if (name === 'travel-data') generator = callback; } },
      helper: { get(name) { return name === 'url_for' ? helper : undefined; } }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(repository, 'scripts/travel-data.js'), 'utf8'), { hexo });
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
  post('上海', 'shanghai'), post('陕西', 'shaanxi'),
  post('江苏', 'jiangsu'), post('浙江', 'zhejiang')
]);
const liveData = built ? JSON.parse(read('data/travel.json')) : data;
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
  const calls = { requests: [], removed: 0, maps: [] };
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: options.mobile ? 390 : 1280, configurable: true });
  window.matchMedia = query => ({
    matches: query.includes('reduced-motion') || (options.mobile && /max-width|pointer: coarse/.test(query)),
    media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
  });
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  const bounds = { x: 0, y: 0, left: 0, top: 0, right: 760, bottom: 520, width: 760, height: 520 };
  window.HTMLElement.prototype.getBoundingClientRect = function () { return bounds; };
  for (const key of ['clientWidth', 'offsetWidth']) Object.defineProperty(window.HTMLElement.prototype, key, { get: () => 760 });
  for (const key of ['clientHeight', 'offsetHeight']) Object.defineProperty(window.HTMLElement.prototype, key, { get: () => 520 });
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.callback([{ target, isIntersecting: true }], this); }
    unobserve() {}
    disconnect() {}
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

  await check('Hebei selection stays on page and has no fabricated record or dead category link', () => using({}, b => {
    const button = b.province('河北');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(b.find('#travel-selection-title').textContent, '河北');
    assert.equal(b.document.querySelectorAll('#travel-selection-posts a').length, 0);
    assert.ok(b.find('#travel-selection-summary').textContent.includes('游记') || b.find('#travel-selection-posts').textContent.includes('游记'));
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
