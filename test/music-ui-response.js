// node test/music-ui-response.js [--built]
// Loading/interaction regressions with delayed scripts and a delayed audio engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..', process.argv.includes('--built') ? 'public' : 'source');
const loader = fs.readFileSync(path.join(root, 'js/page-assets.js'), 'utf8');
const grid = fs.readFileSync(path.join(root, 'js/music-playlist-grid.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const songs = Array.from({ length: 391 }, (_, index) => ({
  id: index + 1, name: 'Song ' + index, artist: 'Artist ' + index, cover: '/cover.jpg'
}));
const event = (w, name, detail) => w.document.dispatchEvent(new w.CustomEvent(name, { detail }));

function loaderBrowser(route, readyState = 'complete') {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test' + route, runScripts: 'outside-only' });
  const w = dom.window;
  const idle = [];
  Object.defineProperty(w.document, 'readyState', { value: readyState });
  w.requestIdleCallback = callback => { idle.push(callback); return idle.length; };
  w.eval(loader);
  return { dom, w, idle, scripts: () => [...w.document.querySelectorAll('script')],
    finish() {
      const scripts = this.scripts();
      for (let i = 0; i < scripts.length; i++) {
        scripts[i].dispatchEvent(new w.Event('load'));
        for (const script of this.scripts()) if (!scripts.includes(script)) scripts.push(script);
      }
      return scripts.map(s => new URL(s.src).pathname);
    } };
}

async function gridBrowser(options = {}) {
  const dom = new JSDOM('<!doctype html><header id="page-header"><div id="page-site-info"></div></header>', {
    url: 'https://example.test/fun/music/', runScripts: 'outside-only'
  });
  const w = dom.window;
  let resolvePlaylist;
  let rejectPlaylist;
  const calls = { selects: [], registrations: 0, loadRequests: 0, fetches: 0 };
  w.fetch = () => {
    calls.fetches++;
    return options.deferPlaylist ? new Promise((resolve, reject) => { resolvePlaylist = resolve; rejectPlaylist = reject; })
      : Promise.resolve({ ok: true, json: () => Promise.resolve(songs) });
  };
  w.document.addEventListener('blog-music-load', () => calls.loadRequests++);
  let state = { owner: 'mini', index: 0, name: 'Mini', artist: 'Mini artist', playing: false, time: 0 };
  const engine = {
    ap: {},
    registerPlaylist(list) { assert.equal(list.length, songs.length); calls.registrations++; },
    getState: () => state,
    select(index, autoplay) {
      calls.selects.push({ index, autoplay });
      state = { owner: 'big', index, name: songs[index].name, artist: songs[index].artist, playing: autoplay, time: 0 };
      event(w, 'blog-music-statechange', state);
      return true;
    },
    pause() { state.playing = false; event(w, 'blog-music-statechange', state); },
    toggle() { state.playing = !state.playing; event(w, 'blog-music-statechange', state); },
    next() { this.select((state.index + 1) % songs.length, true); },
    previous() { this.select((state.index - 1 + songs.length) % songs.length, true); }
  };
  if (options.ready) w.__blogMusic = engine;
  w.eval(grid);
  await flush();
  return { dom, w, calls, engine,
    click(index) { w.document.querySelector('.mf-row[data-i="' + index + '"]').click(); },
    ready() { w.__blogMusic = engine; event(w, 'blog-music-ready'); },
    deliverPlaylist(response) { resolvePlaylist(response || { ok: true, json: () => Promise.resolve(songs) }); },
    rejectPlaylist() { rejectPlaylist(new Error('offline')); },
    state(update) { Object.assign(state, update); event(w, 'blog-music-statechange', state); },
    text() { return w.document.getElementById('mf-now-text').textContent; }
  };
}

(async () => {
  let passed = 0;
  async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

  await check('music page starts dependencies immediately and keeps the ordered chain', () => {
    const b = loaderBrowser('/fun/music/');
    try {
      assert.equal(b.scripts().length, 1);
      assert.equal(new URL(b.scripts()[0].src).pathname, '/lib/APlayer.min.js');
      assert.deepEqual(b.finish(), ['/lib/APlayer.min.js', '/js/music-playback-guard.js', '/js/music-continuous.js', '/js/music-diagnostics.js', '/js/music-playlist.js']);
      b.idle.forEach(fn => fn());
      event(b.w, 'pjax:complete');
      assert.equal(b.scripts().length, 5);
    } finally { b.dom.window.close(); }
  });
  await check('music dependencies start while the document is still loading without DOMContentLoaded', () => {
    const b = loaderBrowser('/fun/music/', 'loading');
    try {
      assert.equal(b.idle.length, 0, 'DOMContentLoaded has not run boot');
      assert.equal(b.scripts().length, 1);
      assert.equal(new URL(b.scripts()[0].src).pathname, '/lib/APlayer.min.js');
      assert.equal(b.finish().length, 5);
      event(b.w, 'DOMContentLoaded'); event(b.w, 'pjax:complete');
      b.idle.forEach(fn => fn());
      assert.equal(b.scripts().length, 5, 'later lifecycle events must not duplicate dependencies');
    } finally { b.dom.window.close(); }
    const other = loaderBrowser('/travel/', 'loading');
    try {
      assert.equal(other.scripts().length, 0);
      event(other.w, 'DOMContentLoaded');
      assert.equal(other.scripts().length, 0, 'other pages still wait for the idle callback');
      other.idle[0]();
      assert.equal(new URL(other.scripts()[0].src).pathname, '/lib/APlayer.min.js');
    } finally { other.dom.window.close(); }
  });
  await check('other pages remain idle; PJAX into music starts before the idle callback', () => {
    const b = loaderBrowser('/travel/');
    try {
      assert.equal(b.scripts().length, 0);
      b.w.history.pushState({}, '', '/fun/music/'); event(b.w, 'pjax:complete');
      assert.equal(new URL(b.scripts()[0].src).pathname, '/lib/APlayer.min.js');
    } finally { b.dom.window.close(); }
  });
  await check('an explicit music request starts early and a failed dependency can retry', () => {
    const b = loaderBrowser('/travel/');
    try {
      let failed = 0; b.w.document.addEventListener('blog-music-load-error', () => failed++);
      event(b.w, 'blog-music-load');
      b.scripts()[0].dispatchEvent(new b.w.Event('error'));
      assert.equal(failed, 1); assert.equal(b.scripts().length, 0);
      event(b.w, 'blog-music-load');
      assert.equal(b.finish().length, 5);
    } finally { b.dom.window.close(); }
  });
  await check('last clicked song is visibly pending and starts once after engine readiness', async () => {
    const b = await gridBrowser();
    try {
      b.click(5); b.click(12);
      assert.match(b.text(), /Song 12.*正在加载/);
      assert(b.w.document.querySelector('[data-i="12"] .fa-spinner'));
      assert.equal(b.calls.selects.length, 0);
      b.ready(); b.ready();
      assert.deepEqual(b.calls.selects, [{ index: 12, autoplay: true }]);
      assert.equal(b.calls.registrations, 1);
      assert.equal(b.text(), 'Song 12 - Artist 12');
      assert(!b.w.document.querySelector('.fa-spinner'));
    } finally { b.dom.window.close(); }
  });
  await check('clicking a pending song again or using pause cancels a deferred selection', async () => {
    for (const cancel of ['same', 'pause']) {
      const b = await gridBrowser();
      try {
        b.click(4);
        if (cancel === 'same') b.click(4); else b.w.document.getElementById('mf-toggle').click();
        assert(!/正在加载/.test(b.text())); b.ready();
        assert.equal(b.calls.selects.length, 0);
      } finally { b.dom.window.close(); }
    }
  });
  await check('play before playlist arrival and next while loading retain the final requested track', async () => {
    const b = await gridBrowser({ ready: true, deferPlaylist: true });
    try {
      b.w.document.getElementById('mf-toggle').click();
      assert.equal(b.text(), '正在加载歌单…');
      b.deliverPlaylist(); await flush();
      assert.deepEqual(b.calls.selects, [{ index: 0, autoplay: true }]);
    } finally { b.dom.window.close(); }
    const c = await gridBrowser();
    try {
      c.click(4); c.w.document.getElementById('mf-next').click(); c.ready();
      assert.deepEqual(c.calls.selects, [{ index: 5, autoplay: true }]);
    } finally { c.dom.window.close(); }
  });
  await check('leaving the page cancels the request and ignores delayed readiness or playlist responses', async () => {
    const b = await gridBrowser();
    try { b.click(7); event(b.w, 'pjax:send'); b.ready(); assert.equal(b.calls.selects.length, 0); }
    finally { b.dom.window.close(); }
    const c = await gridBrowser({ deferPlaylist: true });
    try {
      c.w.document.getElementById('mf-toggle').click(); event(c.w, 'pjax:send'); c.ready(); c.deliverPlaylist(); await flush();
      assert.equal(c.calls.selects.length, 0); assert.equal(c.w.document.querySelectorAll('.mf-row').length, 0);
    } finally { c.dom.window.close(); }
  });
  await check('network and HTTP playlist failures clear pending state and only retry after an explicit play', async () => {
    for (const failFirst of ['network', 'http']) {
      const b = await gridBrowser({ deferPlaylist: true });
      try {
        b.w.document.getElementById('mf-toggle').click();
        assert.equal(b.text(), '正在加载歌单…');
        let parsedErrorBody = false;
        if (failFirst === 'http') b.deliverPlaylist({ ok: false, status: 503,
          json() { parsedErrorBody = true; return Promise.resolve(songs); } });
        else b.rejectPlaylist();
        await flush();
        assert.equal(parsedErrorBody, false, 'HTTP failure must be rejected before parsing');
        assert.match(b.w.document.getElementById('mf-pldesc').textContent, /加载失败.*重试/);
        assert(!/正在加载/.test(b.text()));
        assert.equal(b.calls.fetches, 1);
        b.ready(); event(b.w, 'blog-music-statechange'); await flush();
        assert.equal(b.calls.fetches, 1, 'readiness must not trigger background retries');
        assert.equal(b.calls.selects.length, 0);
        b.w.document.getElementById('mf-toggle').click();
        assert.equal(b.calls.fetches, 2);
        assert.equal(b.text(), '正在加载歌单…');
        b.w.document.getElementById('mf-next').click();
        assert.equal(b.calls.fetches, 2, 'an in-flight playlist request is shared');
        b.deliverPlaylist(); await flush();
        assert.equal(b.w.document.querySelectorAll('.mf-row').length, songs.length);
        assert.equal(b.calls.registrations, 1);
        assert.deepEqual(b.calls.selects, [{ index: 0, autoplay: true }]);
      } finally { b.dom.window.close(); }
    }
  });
  await check('progress-only events make no DOM writes and switching only repaints the two involved rows', async () => {
    const b = await gridBrowser({ ready: true });
    try {
      b.click(0);
      const observer = new b.w.MutationObserver(() => {});
      observer.observe(b.w.document.getElementById('page-header'), { attributes: true, childList: true, characterData: true, subtree: true });
      for (let i = 0; i < 100; i++) b.state({ time: i });
      assert.equal(observer.takeRecords().length, 0);
      b.state({ owner: 'big', index: 1, name: songs[1].name, artist: songs[1].artist });
      const changedRows = new Set(observer.takeRecords().map(record => record.target.closest && record.target.closest('.mf-row')).filter(Boolean).map(row => Number(row.dataset.i)));
      assert.deepEqual([...changedRows].sort(), [0, 1]);
      event(b.w, 'blog-music-error', { owner: 'big', index: 1, name: songs[1].name });
      assert(b.w.document.querySelector('[data-i="1"] .fa-lock'));
      assert(!b.w.document.querySelector('[data-i="1"]').classList.contains('mf-active'));
      observer.disconnect();
    } finally { b.dom.window.close(); }
  });
  console.log('RESULT: PASS_' + passed + '_F0');
})().catch(error => { console.error(error); process.exitCode = 1; });
