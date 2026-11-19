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

function assertSpotlight(b, item) {
  const data = b.data();
  const hero = b.$('.eq-hero-stage');
  assert.equal(hero.dataset.equipment, item.id);
  assert.equal(hero.querySelector('img').getAttribute('src'), item.image);
  assert.ok(hero.querySelector('img').alt.includes(item.name), 'the main image must name the selected equipment');
  assert.equal(b.$('.eq-spot-name').textContent.trim(), item.name);
  assert.equal(b.$('.eq-spot-brand').textContent.trim(), item.brand);
  assert.equal(b.$('.eq-spot-note').textContent.trim(), data.categories.find(category => category.id === item.category).name);
  const index = data.items.findIndex(entry => entry.id === item.id);
  assert.equal(b.$('.eq-spot-count').textContent.trim(), String(index + 1).padStart(2, '0') + ' / ' + String(data.items.length).padStart(2, '0'));
  const selected = [...b.document.querySelectorAll('[data-spotlight][aria-pressed="true"]')];
  assert.equal(selected.length, 1, 'exactly one equipment selector must be pressed');
  assert.equal(selected[0].dataset.spotlight, item.id);
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

  await check('SSR shows 13 equipment selectors by real name and omits the old promotional column', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      const buttons = [...b.document.querySelectorAll('[data-spotlight]')];
      assert.equal(buttons.length, 13);
      assert.deepEqual(buttons.map(button => button.dataset.spotlight), items.map(item => item.id));
      for (const item of items) {
        const button = buttons.find(entry => entry.dataset.spotlight === item.id);
        assert.ok(button.textContent.includes(item.name), 'equipment selector must display its actual name: ' + item.name);
      }
      assert.equal(b.$('.eq-hero-copy'), null);
      const heroText = b.$('.eq-hero').textContent.replace(/\s/g, '');
      for (const phrase of ['数码 · 影像 · 创作', '把热爱，', '装进日常。', '桌面上的灵感，背包里的远方。', '那些陪我创作、记录和探索的小伙伴。', '逛逛我的装备']) {
        assert.equal(heroText.includes(phrase.replace(/\s/g, '')), false, 'removed promotional text must not remain: ' + phrase);
      }
    }, { interactions: false }));

  await check('every equipment selector updates the main image, name, brand, category and selection', () =>
    using('/equipments/', b => {
      for (const item of b.data().items) {
        b.click('[data-spotlight="' + item.id + '"]');
        assertSpotlight(b, item);
        assert.equal(b.$('.eq-dialog').open, false, 'selecting a main image must not open details');
      }
    }));

  await check('main image previous and next controls cycle through all 13 devices in both directions', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      assertSpotlight(b, items[0]);
      b.click('[data-spot-step="-1"]');
      assertSpotlight(b, items.at(-1));
      b.click('[data-spot-step="1"]');
      assertSpotlight(b, items[0]);
      for (let offset = 1; offset <= items.length; offset++) {
        b.click('[data-spot-step="1"]');
        assertSpotlight(b, items[offset % items.length]);
      }
      for (let offset = 1; offset <= items.length; offset++) {
        b.click('[data-spot-step="-1"]');
        assertSpotlight(b, items[(items.length - offset) % items.length]);
      }
    }));

  await check('selecting Redmi Watch 4 resets main-image navigation and opens the selected device details', () =>
    using('/equipments/?category=imaging', b => {
      const items = b.data().items;
      const index = items.findIndex(item => item.id === 'redmi-watch4');
      assert.ok(index >= 0);
      b.click('[data-spotlight="redmi-watch4"]');
      assertSpotlight(b, items[index]);
      b.click('[data-spot-step="1"]');
      assertSpotlight(b, items[(index + 1) % items.length]);
      b.click('[data-spot-step="-1"]');
      assertSpotlight(b, items[index]);
      b.click('[data-spot-step="-1"]');
      assertSpotlight(b, items[(index - 1 + items.length) % items.length]);
      b.click('[data-spot-step="1"]');
      assertSpotlight(b, items[index]);
      assert.equal(b.visibleCards().length, 3, 'main-image selection must preserve the collection filter');
      b.click('.eq-hero-stage');
      assert.equal(b.$('.eq-dialog').open, true);
      assert.equal(b.title(), 'Redmi Watch 4');
      assert.equal(b.$('.eq-detail-image-wrap img').getAttribute('src'), items[index].image);
      assert.equal(b.index(), String(index + 1).padStart(2, '0') + ' / 13');
    }));

  await check('main image controls move once after repeated PJAX returns and script re-evaluation', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      const watchIndex = items.findIndex(item => item.id === 'redmi-watch4');
      for (let round = 0; round < 3; round++) {
        event(b.window, 'pjax:send');
        b.document.body.innerHTML = '<main>Other page</main>';
        b.window.history.replaceState({}, '', '/about-site/');
        event(b.window, 'pjax:complete');
        b.document.body.innerHTML = markup;
        b.window.history.replaceState({}, '', '/equipments/');
        event(b.window, 'pjax:complete');
        b.window.eval(interaction);
        assertSpotlight(b, items[0]);
        b.click('[data-spot-step="1"]');
        assertSpotlight(b, items[1]);
        b.click('[data-spotlight="redmi-watch4"]');
        assertSpotlight(b, items[watchIndex]);
        b.click('[data-spot-step="-1"]');
        assertSpotlight(b, items[(watchIndex - 1 + items.length) % items.length]);
        b.click('[data-spot-step="1"]');
        assertSpotlight(b, items[watchIndex]);
      }
    }));

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

  await check('all 13 detail pages render complete descriptions, specification rows and official provenance', () =>
    using('/equipments/', b => {
      const items = b.data().items;
      assert.equal(items.length, 13);
      b.click('.eq-hero-stage');
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        assert.ok(typeof item.description === 'string' && item.description.trim(), 'missing detailed product introduction: ' + item.name);
        assert.ok(item.specs.length >= 6, 'details must contain substantive product specifications: ' + item.name);
        assert.equal(b.title(), item.name);
        assert.equal(b.$('.eq-detail-note').textContent, item.description);
        assert.equal(b.$('.eq-config-note').textContent, item.configNote || '');
        const rows = Array.from(b.document.querySelectorAll('.eq-specs > div'), row => ({
          label: row.querySelector('dt').textContent,
          value: row.querySelector('dd').textContent
        }));
        assert.deepEqual(rows, item.specs, 'all specifications must render once and in order: ' + item.name);
        const sources = (item.specSources || []).filter(source => /^https?:\/\//i.test(source.url));
        assert.ok(sources.length, 'detailed product facts must have an official source: ' + item.name);
        const links = Array.from(b.document.querySelectorAll('.eq-spec-sources a'));
        assert.deepEqual(links.map(link => ({ title: link.textContent, url: link.href })),
          sources.map(source => ({ title: source.title, url: new URL(source.url).href })));
        for (const link of links) {
          assert.equal(link.target, '_blank');
          assert.match(link.rel, /noopener/);
          assert.match(link.rel, /noreferrer/);
        }
        assert.equal(b.$('.eq-spec-provenance').hidden, false);
        if (index < items.length - 1) b.click('[data-step="1"]');
      }
    }));

  await check('switching equipment clears previous notes, specs and provenance when the next item has none', () =>
    using('/equipments/', b => {
      const data = b.data();
      Object.assign(data.items[0], {
        description: 'First product introduction.',
        configNote: 'Only the first equipment has this configuration note.',
        specs: [{ label: 'First exclusive specification', value: 'First exclusive value' }],
        specSources: [{ title: 'First official specification', url: 'https://example.test/official-first' }]
      });
      Object.assign(data.items[1], {
        description: 'Second product introduction.',
        configNote: '',
        specs: [{ label: 'Second specification', value: 'Second value' }],
        specSources: []
      });
      b.$('#eq-data').textContent = JSON.stringify(data);
      b.window.eval(interaction);
      b.click('.eq-hero-stage');
      assert.equal(b.$('.eq-spec-provenance').hidden, false);
      assert.equal(b.$('.eq-spec-sources a').textContent, 'First official specification');
      b.click('[data-step="1"]');
      assert.equal(b.$('.eq-detail-note').textContent, 'Second product introduction.');
      assert.equal(b.$('.eq-config-note').textContent, '');
      assert.equal(b.document.querySelectorAll('.eq-specs > div').length, 1);
      assert.equal(b.$('.eq-specs dt').textContent, 'Second specification');
      assert.equal(b.$('.eq-specs dd').textContent, 'Second value');
      assert.equal(b.document.querySelectorAll('.eq-spec-sources a').length, 0);
      assert.equal(b.$('.eq-spec-provenance').hidden, true);
      assert.equal(b.$('.eq-detail-copy').textContent.includes('First exclusive'), false);
    }, { interactions: false }));

  await check('changing equipment and reopening details reset both dialog scroll positions', () =>
    using('/equipments/', async b => {
      b.click('.eq-hero-stage');
      const copy = b.$('.eq-detail-copy');
      const dialog = b.$('.eq-dialog');
      copy.scrollTop = 380;
      dialog.scrollTop = 140;
      assert.equal(copy.scrollTop, 380);
      assert.equal(dialog.scrollTop, 140);
      b.click('[data-step="1"]');
      assert.equal(copy.scrollTop, 0, 'the newly selected equipment must start at its introduction');
      assert.equal(dialog.scrollTop, 0, 'mobile dialog scroll must also return to the beginning');
      b.click('.eq-close');
      await flush();
      copy.scrollTop = 270;
      dialog.scrollTop = 90;
      b.click('.eq-hero-stage');
      assert.equal(copy.scrollTop, 0);
      assert.equal(dialog.scrollTop, 0);
    }));

  await check('confirmed laptop hardware and phone memory survive in the rendered product details', () =>
    using('/equipments/', async b => {
      const items = b.data().items;
      const laptop = items.find(item => /天选/.test(item.name));
      const phone = items.find(item => /Ace\s*3\s*Pro/i.test(item.name));
      assert.ok(laptop && phone, 'the confirmed laptop and phone must be present');
      function open(item) {
        b.click('[data-equipment-card="' + item.id + '"] .eq-card-stage');
        return b.$('.eq-specs').textContent;
      }
      const laptopText = open(laptop);
      assert.match(laptopText, /i7/i);
      assert.match(laptopText, /RTX\s*5060/i);
      assert.match(laptopText, /16\s*GB/i);
      assert.match(laptopText, /954\s*GB/i, 'the reported installed storage must not be replaced with an assumed capacity');
      b.click('.eq-close');
      await flush();
      const phoneText = open(phone);
      assert.match(phoneText, /16\s*GB/i);
      assert.match(phoneText, /512\s*GB/i);
      assert.match(phoneText, /钛空镜银/);
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
