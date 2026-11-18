// Run: node test/equipment-gallery.js [--built]
// Uses the actual Hexo tag and browser script; jsdom supplies only browser APIs
// it does not implement. Native dialog focus trapping and visual layout still
// require a real browser check.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const repository = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const assetRoot = path.join(repository, built ? 'public' : 'source');
const interaction = fs.readFileSync(path.join(assetRoot, 'js/equipment-gallery.js'), 'utf8');
const loader = fs.readFileSync(path.join(assetRoot, 'js/page-assets.js'), 'utf8');
const localAsset = url => path.join(assetRoot, decodeURIComponent(new URL(url, 'https://example.test').pathname));

function renderSource() {
  let render;
  const hexo = {
    source_dir: path.join(repository, 'source'),
    extend: { tag: { register(name, callback) {
      if (name === 'equipment_gallery') render = callback;
    } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(repository, 'scripts/equipment-gallery.js'), 'utf8'), {
    hexo, require
  }, { filename: 'scripts/equipment-gallery.js' });
  assert.equal(typeof render, 'function', 'the actual equipment_gallery Hexo tag must register');
  return render();
}

function readBuilt() {
  const html = fs.readFileSync(path.join(assetRoot, 'equipments/index.html'), 'utf8');
  const dom = new JSDOM(html);
  try {
    const root = dom.window.document.getElementById('equipment-gallery');
    assert.ok(root, 'the Hexo build must include the server-rendered collection');
    return root.outerHTML;
  } finally { dom.window.close(); }
}

const markup = built ? readBuilt() : renderSource();
const flush = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
const event = (window, name) => window.document.dispatchEvent(new window.Event(name));

function browser(route = '/equipments/', options = {}) {
  const dom = new JSDOM('<!doctype html><html><body>' + (options.empty ? '' : markup) + '</body></html>', {
    url: 'https://example.test' + route,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const window = dom.window;
  const document = window.document;
  const calls = { showModal: 0, close: 0 };
  const idle = [];
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  window.matchMedia = () => ({ matches: true });
  window.requestIdleCallback = callback => { idle.push(callback); return idle.length; };
  window.HTMLDialogElement.prototype.showModal = function () {
    calls.showModal++;
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    calls.close++;
    this.removeAttribute('open');
    const dialog = this;
    // In browsers, close is queued. Exercise cleanup against that ordering.
    window.queueMicrotask(() => dialog.dispatchEvent(new window.Event('close')));
  };
  if (options.interactions !== false && !options.empty) window.eval(interaction);
  return {
    dom, window, document, calls, idle,
    $(selector) { return document.querySelector(selector); },
    click(selector) {
      const element = document.querySelector(selector);
      assert.ok(element, 'missing expected control: ' + selector);
      element.click();
      return element;
    },
    visibleCards() { return [...document.querySelectorAll('[data-equipment-card]')].filter(card => !card.hidden); },
    title() { return document.querySelector('#eq-detail-name').textContent; },
    index() { return document.querySelector('.eq-detail-index').textContent; },
    data() { return JSON.parse(document.querySelector('#eq-data').textContent); },
    close() { dom.window.close(); }
  };
}

async function using(route, callback, options) {
  const instance = browser(route, options);
  try { await callback(instance); } finally { instance.close(); }
}

(async () => {
  let passed = 0;
  let failed = 0;
  async function check(name, callback) {
    try {
      await callback();
      passed++;
      console.log('PASS ' + name);
    } catch (error) {
      failed++;
      console.error('FAIL ' + name + '\n' + error.stack);
    }
  }

  await check('SSR contains all 13 real cards and official links before JavaScript runs', () =>
    using('/equipments/', b => {
      const cards = [...b.document.querySelectorAll('[data-equipment-card]')];
      assert.equal(cards.length, 13);
      assert.equal(new Set(cards.map(card => card.dataset.equipmentCard)).size, 13);
      for (const card of cards) {
        const image = card.querySelector('img');
        assert.ok(image && image.alt.trim(), 'every equipment has an accessible image');
        assert.ok(fs.existsSync(localAsset(image.getAttribute('src'))), 'missing local product image: ' + image.getAttribute('src'));
        assert.ok(card.querySelector('h3').textContent.trim(), 'every equipment has a server-rendered name');
        const official = card.querySelector('a[target="_blank"]');
        assert.ok(['https:', 'http:'].includes(new URL(official.href).protocol), 'official link must be a web URL');
        assert.match(official.rel, /noopener/);
      }
    }, { interactions: false }));

  await check('SSR categories contain 5 everyday, 3 imaging, 4 desktop and 1 power device', () =>
    using('/equipments/', b => {
      const counts = {};
      for (const card of b.document.querySelectorAll('[data-equipment-card]')) {
        counts[card.dataset.category] = (counts[card.dataset.category] || 0) + 1;
      }
      assert.deepEqual(counts, { imaging: 3, everyday: 5, desktop: 4, power: 1 });
      assert.equal(b.document.querySelectorAll('[data-filter]:not([data-filter="all"])').length, 4);
    }, { interactions: false }));

  await check('confirmed phone and mouse colors, white mouse model and everyday watch have real local assets', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      const phone = items.find(item => item.id === 'oneplus-ace3-pro');
      const mouse = items.find(item => item.id === 'logitech-g304');
      const watch = items.find(item => item.id === 'redmi-watch4');
      assert.ok(phone && mouse && watch, 'the confirmed devices must be present');
      assert.equal(phone.color, '钛空镜银');
      assert.equal(mouse.color, '白色');
      assert.match(mouse.model, /white/, 'the 3D model must match the confirmed white mouse');
      assert.equal(watch.category, 'everyday');
      for (const item of items) {
        assert.ok(fs.statSync(localAsset(item.image)).size > 0, 'missing or empty product image: ' + item.image);
        if (item.model) {
          const model = fs.readFileSync(localAsset(item.model));
          assert.ok(model.length >= 12, 'missing or empty GLB: ' + item.model);
          assert.equal(model.toString('ascii', 0, 4), 'glTF', 'model must be an actual GLB: ' + item.model);
        }
      }
    }, { interactions: false }));

  await check('a linked category URL initializes the visible cards and pressed filter', () =>
    using('/equipments/?category=imaging', b => {
      assert.equal(b.visibleCards().length, 3);
      assert.ok(b.visibleCards().every(card => card.dataset.category === 'imaging'));
      assert.equal(b.$('[data-filter="imaging"]').getAttribute('aria-pressed'), 'true');
      assert.equal(b.$('[data-filter="all"]').getAttribute('aria-pressed'), 'false');
      assert.match(b.$('.eq-result-count').textContent, /3/);
    }));

  await check('unknown category URLs safely show the full collection', () =>
    using('/equipments/?category=unknown', b => {
      assert.equal(b.visibleCards().length, 13);
      assert.equal(b.$('[data-filter="all"]').getAttribute('aria-pressed'), 'true');
    }));

  await check('filter changes preserve unrelated query and hash, and all removes category', () =>
    using('/equipments/?from=nav#eq-collection', b => {
      b.click('[data-filter="desktop"]');
      assert.equal(b.visibleCards().length, 4);
      let url = new URL(b.window.location.href);
      assert.equal(url.searchParams.get('category'), 'desktop');
      assert.equal(url.searchParams.get('from'), 'nav');
      assert.equal(url.hash, '#eq-collection');
      b.click('[data-filter="all"]');
      url = new URL(b.window.location.href);
      assert.equal(url.searchParams.has('category'), false);
      assert.equal(url.searchParams.get('from'), 'nav');
      assert.equal(b.visibleCards().length, 13);
    }));

  await check('browser history restoration reapplies the URL category', () =>
    using('/equipments/', b => {
      b.window.history.replaceState({}, '', '/equipments/?category=power');
      b.window.dispatchEvent(new b.window.PopStateEvent('popstate'));
      assert.equal(b.visibleCards().length, 1);
      assert.equal(b.visibleCards()[0].dataset.equipmentCard, 'ugreen-100w');
    }));

  await check('a card opens named details, focuses close and locks page scrolling', () =>
    using('/equipments/', b => {
      b.click('[data-equipment-card="oppo-pad5"] .eq-card-stage');
      assert.equal(b.$('.eq-dialog').open, true);
      assert.equal(b.title(), 'OPPO Pad 5');
      assert.equal(b.document.activeElement, b.$('.eq-close'));
      assert.equal(b.document.documentElement.classList.contains('eq-modal-open'), true);
      assert.equal(b.$('.eq-dialog').getAttribute('aria-labelledby'), 'eq-detail-name');
      assert.equal(b.$('.eq-detail-image-wrap img').getAttribute('src'), '/img/equipment/oppo-pad5.webp');
    }));

  await check('closing details restores opener focus, scrolling and zoom state', () =>
    using('/equipments/', async b => {
      const opener = b.$('[data-equipment-card="oppo-pad5"] .eq-card-stage');
      opener.focus();
      opener.click();
      b.click('.eq-zoom');
      assert.equal(b.$('.eq-zoom').getAttribute('aria-pressed'), 'true');
      b.click('.eq-close');
      await flush();
      assert.equal(b.$('.eq-dialog').open, false);
      assert.equal(b.document.documentElement.classList.contains('eq-modal-open'), false);
      assert.equal(b.document.activeElement, opener);
      assert.equal(b.$('.eq-zoom').getAttribute('aria-pressed'), 'false');
      assert.equal(b.$('.eq-detail-image-wrap').classList.contains('is-zoomed'), false);
    }));

  await check('filtered card navigation stays in its category and wraps both directions', () =>
    using('/equipments/?category=everyday', b => {
      const names = b.data().items.filter(item => item.category === 'everyday').map(item => item.name);
      b.click('[data-equipment-card="oneplus-ace3-pro"] .eq-card-stage');
      assert.equal(b.index(), '01 / 05');
      b.click('[data-step="-1"]');
      assert.equal(b.title(), names.at(-1));
      assert.equal(b.index(), '05 / 05');
      b.click('[data-step="1"]');
      assert.equal(b.title(), names[0]);
      b.click('[data-step="1"]');
      assert.equal(b.title(), names[1]);
      assert.equal(b.index(), '02 / 05');
    }));

  await check('an off-category spotlight keeps the full dialog queue until it closes', () =>
    using('/equipments/?category=everyday', b => {
      const items = b.data().items;
      assert.equal(b.$('.eq-hero-stage').dataset.equipment, 'sony-zve10');
      b.click('.eq-hero-stage');
      assert.equal(b.title(), items[0].name);
      assert.equal(b.index(), '01 / 13');
      b.click('[data-step="1"]');
      assert.equal(b.title(), items[1].name);
      assert.equal(b.index(), '02 / 13', 'entering a filtered-category item must not change the queue');
      b.click('[data-step="-1"]');
      assert.equal(b.title(), items[0].name, 'previous must return to the item just viewed');
      assert.equal(b.index(), '01 / 13');
      b.click('[data-step="-1"]');
      assert.equal(b.title(), items.at(-1).name);
      assert.equal(b.index(), '13 / 13');
    }));

  await check('reopening a filtered card resets a previous full spotlight queue', () =>
    using('/equipments/?category=everyday', async b => {
      b.click('.eq-hero-stage');
      b.click('.eq-close');
      await flush();
      b.click('[data-equipment-card="oneplus-ace3-pro"] .eq-card-stage');
      assert.equal(b.index(), '01 / 05');
      b.click('[data-step="-1"]');
      assert.equal(b.title(), 'Redmi Watch 4');
    }));

  await check('keyboard arrows advance exactly one item and leave focus on the control', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      b.click('.eq-hero-stage');
      const next = b.$('[data-step="1"]');
      next.focus();
      const key = new b.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      next.dispatchEvent(key);
      assert.equal(b.title(), items[1].name);
      assert.equal(key.defaultPrevented, true);
      assert.equal(b.document.activeElement, next);
    }));

  await check('PJAX send closes the modal, unlocks scrolling and detaches old controls', () =>
    using('/equipments/', async b => {
      const oldRoot = b.$('#equipment-gallery');
      b.click('.eq-hero-stage');
      assert.equal(b.calls.showModal, 1);
      event(b.window, 'pjax:send');
      await flush();
      assert.equal(oldRoot.querySelector('.eq-dialog').open, false);
      assert.equal(b.document.documentElement.classList.contains('eq-modal-open'), false);
      oldRoot.querySelector('.eq-hero-stage').click();
      assert.equal(b.calls.showModal, 1, 'old DOM handlers must be removed on navigation');
      b.document.body.replaceChildren();
      b.window.history.replaceState({}, '', '/about-site/');
      event(b.window, 'pjax:complete');
      assert.equal(b.document.documentElement.classList.contains('eq-modal-open'), false);
    }));

  await check('PJAX return and accidental script re-evaluation bind each control once', () =>
    using('/equipments/', async b => {
      for (let round = 0; round < 3; round++) {
        event(b.window, 'pjax:send');
        b.document.body.innerHTML = '<main>Other page</main>';
        b.window.history.replaceState({}, '', '/about-site/');
        event(b.window, 'pjax:complete');
        b.document.body.innerHTML = markup;
        b.window.history.replaceState({}, '', '/equipments/');
        event(b.window, 'pjax:complete');
        b.window.eval(interaction);
        b.click('.eq-hero-stage');
        const count = b.calls.showModal;
        b.click('[data-step="1"]');
        assert.equal(b.title(), '一加 Ace 3 Pro', 'one click must move one item after re-entry');
        assert.equal(b.calls.showModal, count, 'switching an open dialog must not reopen it');
        b.click('.eq-zoom');
        assert.equal(b.$('.eq-zoom').getAttribute('aria-pressed'), 'true', 'one click must toggle once');
        b.click('.eq-close');
        await flush();
      }
    }));

  await check('page-assets loads equipment only when present and injects it only once', () =>
    using('/about-site/', b => {
      b.window.eval(loader);
      const equipmentScripts = () => [...b.document.scripts].filter(script => /\/js\/equipment-gallery\.js(?:\?|$)/.test(script.src));
      assert.equal(equipmentScripts().length, 0, 'unrelated pages must not download the gallery');
      b.document.body.innerHTML = markup;
      b.window.history.replaceState({}, '', '/equipments/');
      event(b.window, 'pjax:complete');
      assert.equal(equipmentScripts().length, 1);
      event(b.window, 'pjax:complete');
      assert.equal(equipmentScripts().length, 1, 'PJAX re-entry must not duplicate the asset');
    }, { empty: true, interactions: false }));

  console.log('RESULT: EQUIPMENT_GALLERY_' + (failed ? 'FAIL' : 'PASS') + ' (' + passed + ' passed, ' + failed + ' failed; ' + (built ? 'built' : 'source') + ')');
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
