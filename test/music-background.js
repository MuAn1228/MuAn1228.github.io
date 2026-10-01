// Run with: node test/music-background.js [--built]
// Real vendored APlayer + the two production scripts; only browser media and HTTP
// are simulated. This catches competing ended handlers that an APlayer stub misses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assetRoot = process.argv.includes('--built') ? 'public' : 'source';
const aplayerSource = read(assetRoot + '/lib/APlayer.min.js');
const engineSource = read(assetRoot + '/js/music-playlist.js');
const gridSource = read(assetRoot + '/js/music-playlist-grid.js');
const cdn = 'https://cdn.jsdelivr.net/gh/MuAn1228/music-assets@master/';
const playlist = Array.from({ length: 5 }, (_, index) => ({
  id: 910001 + index,
  name: 'Background track ' + index,
  artist: 'Test artist',
  cover: '/img/music/test-' + index + '.jpg'
}));
const localIds = [2085859568, 910001, 910003];
const expectedUrl = index => localIds.includes(playlist[index].id)
  ? cdn + playlist[index].id + '.mp3'
  : 'https://music.163.com/song/media/outer/url?id=' + playlist[index].id + '.mp3';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, description) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out: ' + description);
    await delay(5);
  }
}

async function createBrowser(options = {}) {
  const pageErrors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => pageErrors.push(error));
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<header id="page-header"><div id="page-site-info"></div></header>' +
    '</body></html>', {
    url: 'https://muan1228.github.io' + (options.path || '/fun/music/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: console
  });
  const { window } = dom;
  const { document } = window;
  const actions = {};
  const requests = [];
  const plays = [];
  const sourceChanges = [];
  const stateEvents = [];
  let readyEvents = 0;
  let hidden = false;
  let autoPlaying = true;
  let releasePlaylist;
  const playlistResponse = options.deferPlaylistResponse
    ? new Promise(resolve => { releasePlaylist = resolve; }) : null;
  const mediaState = new WeakMap();
  const state = audio => {
    if (!mediaState.has(audio)) mediaState.set(audio, {
      paused: true, ended: false, time: 0, src: '', readyState: 0, generation: 0
    });
    return mediaState.get(audio);
  };
  const queue = callback => window.setTimeout(callback, 0);
  const event = (audio, name) => audio.dispatchEvent(new window.Event(name));
  const mediaProto = window.HTMLMediaElement.prototype;
  Object.defineProperties(mediaProto, {
    paused: { configurable: true, get() { return state(this).paused; } },
    ended: { configurable: true, get() { return state(this).ended; } },
    currentTime: {
      configurable: true,
      get() { return state(this).time; },
      set(value) { state(this).time = Number(value); }
    },
    duration: { configurable: true, get() { return 180; } },
    readyState: { configurable: true, get() { return state(this).readyState; } },
    buffered: { configurable: true, get() { return { length: 0 }; } },
    currentSrc: { configurable: true, get() { return state(this).src; } },
    src: {
      configurable: true,
      get() { return state(this).src; },
      set(value) {
        const data = state(this);
        const wasPlaying = !data.paused;
        data.src = value ? new URL(value, window.location.href).href : '';
        data.time = 0;
        data.paused = true;
        data.ended = false;
        data.readyState = 0;
        const generation = ++data.generation;
        sourceChanges.push(data.src);
        queue(() => {
          if (data.generation !== generation) return;
          if (wasPlaying) event(this, 'pause');
          event(this, 'emptied');
          event(this, 'loadstart');
          if (!data.src) return;
          data.readyState = 4;
          event(this, 'loadedmetadata');
          event(this, 'durationchange');
          event(this, 'canplay');
        });
      }
    }
  });
  mediaProto.load = function () {};
  mediaProto.canPlayType = () => 'probably';
  mediaProto.play = function () {
    const data = state(this);
    const wasPaused = data.paused;
    data.paused = false;
    data.ended = false;
    const generation = data.generation;
    plays.push({ src: data.src, hidden });
    return new Promise(resolve => queue(() => {
      if (data.generation !== generation || data.paused) { resolve(); return; }
      if (wasPaused) event(this, 'play');
      if (autoPlaying) event(this, 'playing');
      resolve();
    }));
  };
  mediaProto.pause = function () {
    const data = state(this);
    if (data.paused) return;
    data.paused = true;
    queue(() => event(this, 'pause'));
  };
  Object.defineProperties(document, {
    hidden: { configurable: true, get: () => hidden },
    visibilityState: { configurable: true, get: () => hidden ? 'hidden' : 'visible' }
  });
  if (options.mediaSession !== false) {
    Object.defineProperty(window.navigator, 'mediaSession', { value: {
      metadata: null,
      playbackState: 'none',
      setActionHandler(name, handler) { actions[name] = handler; },
      setPositionState(value) { this.positionState = value; }
    } });
    window.MediaMetadata = class MediaMetadata { constructor(value) { Object.assign(this, value); } };
  }
  window.fetch = async url => {
    requests.push(String(url));
    if (String(url).includes('/data/local-playlist-ids.json')) {
      return { ok: true, json: async () => [...localIds] };
    }
    if (String(url).includes('/data/music-playlist.json')) {
      if (playlistResponse) await playlistResponse;
      return { ok: true, json: async () => playlist.map(item => ({ ...item })) };
    }
    if (String(url).includes('api.injahow.cn/meting/')) {
      if (options.metingFails) throw new Error('Meting unavailable');
      const id = new URL(url).searchParams.get('id');
      return { ok: true, json: async () => [{ url: 'https://audio.example.test/' + id + '.mp3' }] };
    }
    throw new Error('Unexpected HTTP request: ' + url);
  };
  document.addEventListener('blog-music-ready', () => readyEvents++);
  document.addEventListener('blog-music-statechange', e => stateEvents.push(e.detail));
  if (options.saved) window.sessionStorage.setItem('blog-music-state', JSON.stringify(options.saved));
  window.eval(aplayerSource);
  if (options.grid !== false && options.gridFirst) window.eval(gridSource);
  window.eval(engineSource);
  await until(() => window.__blogMusic && window.__blogMusic.ap, 'engine initializes');
  await delay(20);
  if (options.grid !== false && !options.gridFirst) window.eval(gridSource);
  if (options.grid !== false) {
    await until(() => document.querySelectorAll('.mf-row').length === playlist.length, 'grid loads');
    await delay(20);
  }
  const engine = window.__blogMusic;
  const browser = {
    window, document, engine, actions, requests, plays, sourceChanges, stateEvents, pageErrors,
    readyCount: () => readyEvents,
    releasePlaylist() { if (releasePlaylist) releasePlaylist(); },
    setAutoPlaying(value) { autoPlaying = value; },
    hide(value = true) {
      hidden = value;
      document.dispatchEvent(new window.Event('visibilitychange'));
    },
    async clickTrack(index) {
      document.querySelector('.mf-row[data-i="' + index + '"]').click();
      await delay(20);
    },
    async finish() {
      const audio = engine.audio();
      const data = state(audio);
      assert.equal(data.paused, false, 'song must be playing before natural end');
      data.time = 180;
      data.ended = true;
      data.paused = true;
      event(audio, 'timeupdate');
      event(audio, 'pause');
      event(audio, 'ended');
      await delay(20);
    },
    async fail() {
      event(engine.audio(), 'error');
      await delay(20);
    },
    async navigateAway() {
      document.dispatchEvent(new window.Event('pjax:send'));
      document.getElementById('page-header').remove();
      window.history.replaceState(null, '', '/about-site/');
      document.dispatchEvent(new window.Event('pjax:complete'));
      await delay(20);
    },
    async enterMusic() {
      window.history.replaceState(null, '', '/fun/music/');
      const header = document.createElement('header');
      header.id = 'page-header';
      header.innerHTML = '<div id="page-site-info"></div>';
      document.body.prepend(header);
      window.eval(gridSource);
      document.dispatchEvent(new window.Event('pjax:complete'));
      await until(() => document.querySelectorAll('.mf-row').length === playlist.length, 'reentered grid loads');
      await delay(20);
    },
    close() { dom.window.close(); }
  };
  return browser;
}

function assertTrack(browser, owner, index) {
  const result = browser.engine.getState();
  assert.equal(result.owner, owner);
  assert.equal(result.index, index);
  assert.equal(browser.engine.ap.list.index, index);
  if (owner === 'big') assert.equal(result.src, expectedUrl(index));
  return result;
}

let passed = 0;
let failed = 0;
async function test(name, options, run) {
  let browser;
  try {
    browser = await createBrowser(options);
    await run(browser);
    assert.deepEqual(browser.pageErrors.map(error => error.message), [], 'no uncaught browser errors');
    passed++;
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n' + error.stack);
  } finally {
    if (browser) browser.close();
  }
}

(async () => {
  await test('real APlayer initializes mini queue and announces readiness once', {}, async b => {
    assert.ok(b.engine.ap instanceof b.window.APlayer);
    assert.equal(b.readyCount(), 1);
    assertTrack(b, 'mini', 0);
    assert.equal(b.engine.getState().src, cdn + '2085859568.mp3');
    assert.ok(b.engine.ap.list.audios.length > playlist.length);
    assert.ok(b.engine.ap.list.audios.some(item => item.url.startsWith('https://audio.example.test/')));
    b.window.eval(engineSource);
    assert.equal(b.readyCount(), 1);
    assert.equal(b.document.querySelectorAll('.aplayer').length, 1);
  });

  await test('grid started before engine registers full big queue using whitelist URLs', { gridFirst: true }, async b => {
    await b.clickTrack(2);
    assertTrack(b, 'big', 2);
    assert.deepEqual(Array.from(b.engine.ap.list.audios, item => item.url), playlist.map((_, i) => expectedUrl(i)));
    assert.equal(b.engine.getState().playing, true);
    assert.equal(b.document.querySelector('.mf-active').dataset.i, '2');
  });

  await test('hidden natural end switches once, starts next track once, never plays mini', {}, async b => {
    await b.clickTrack(0);
    b.hide();
    let switches = 0;
    b.engine.ap.on('listswitch', () => switches++);
    const previousPlays = b.plays.length;
    const previousSources = b.sourceChanges.length;
    await b.finish();
    assert.equal(switches, 1);
    assertTrack(b, 'big', 1);
    assert.equal(b.engine.getState().playing, true);
    assert.equal(b.plays.length - previousPlays, 1);
    assert.deepEqual(b.sourceChanges.slice(previousSources), [expectedUrl(1)]);
    assert.deepEqual(b.plays.slice(previousPlays).map(call => call.src), [expectedUrl(1)]);
    assert.equal(b.stateEvents.at(-1).index, 1);
  });

  await test('several hidden track endings keep order and wrap last track to first', {}, async b => {
    await b.clickTrack(0);
    b.hide();
    for (const index of [1, 2, 3, 4, 0, 1]) {
      await b.finish();
      assertTrack(b, 'big', index);
      assert.equal(b.engine.getState().playing, true);
    }
  });

  await test('removing music page during PJAX preserves queue and background continuation', {}, async b => {
    await b.clickTrack(1);
    const audio = b.engine.audio();
    const playCount = b.plays.length;
    await b.navigateAway();
    assert.equal(b.plays.length, playCount);
    b.hide();
    await b.finish();
    assertTrack(b, 'big', 2);
    await b.finish();
    assertTrack(b, 'big', 3);
    assert.equal(b.engine.audio(), audio);
    assert.equal(b.document.querySelector('.music-favs'), null);
  });

  await test('reentering music page mirrors current state without duplicate end handlers', {}, async b => {
    await b.clickTrack(0);
    for (let i = 0; i < 3; i++) {
      await b.navigateAway();
      await b.finish();
      await b.enterMusic();
      assertTrack(b, 'big', i + 1);
      assert.equal(b.document.querySelectorAll('.music-favs').length, 1);
      assert.equal(b.document.querySelector('.mf-active').dataset.i, String(i + 1));
    }
    let switches = 0;
    b.engine.ap.on('listswitch', () => switches++);
    await b.finish();
    assertTrack(b, 'big', 4);
    assert.equal(switches, 1);
    b.document.getElementById('mf-next').click();
    await delay(20);
    assertTrack(b, 'big', 0);
    assert.equal(switches, 2);
  });

  await test('manual pause stays paused across visibility and PJAX changes', {}, async b => {
    await b.clickTrack(0);
    b.engine.pause();
    await delay(20);
    const playCount = b.plays.length;
    b.hide();
    b.hide(false);
    await b.navigateAway();
    assert.equal(b.engine.getState().playing, false);
    assert.equal(b.plays.length, playCount);
  });

  await test('lock-screen Media Session play pause next previous use active queue', {}, async b => {
    await b.clickTrack(1);
    b.hide();
    for (const name of ['play', 'pause', 'nexttrack', 'previoustrack']) assert.equal(typeof b.actions[name], 'function');
    b.actions.pause();
    await delay(20);
    assert.equal(b.engine.getState().playing, false);
    assert.equal(b.window.navigator.mediaSession.playbackState, 'paused');
    b.actions.play();
    await delay(20);
    assert.equal(b.engine.getState().playing, true);
    b.actions.nexttrack();
    await delay(20);
    assertTrack(b, 'big', 2);
    assert.equal(b.window.navigator.mediaSession.metadata.title, playlist[2].name);
    b.actions.previoustrack();
    await delay(20);
    assertTrack(b, 'big', 1);
  });

  await test('three failures stop after two skipped tracks despite repeated play events', {}, async b => {
    b.setAutoPlaying(false);
    await b.clickTrack(0);
    b.hide();
    await b.fail();
    assertTrack(b, 'big', 1);
    await b.fail();
    assertTrack(b, 'big', 2);
    await b.fail();
    assertTrack(b, 'big', 2);
    assert.equal(b.engine.getState().playing, false);
    const playCount = b.plays.length;
    await delay(2150); // APlayer's own delayed error handler must not run later.
    assertTrack(b, 'big', 2);
    assert.equal(b.plays.length, playCount);
  });

  await test('successful playing resets consecutive-error budget', {}, async b => {
    b.setAutoPlaying(false);
    await b.clickTrack(0);
    await b.fail();
    assertTrack(b, 'big', 1);
    b.setAutoPlaying(true);
    b.engine.play();
    await delay(20);
    b.setAutoPlaying(false);
    await b.fail();
    assertTrack(b, 'big', 2);
    await b.fail();
    assertTrack(b, 'big', 3);
    assert.equal(b.engine.getState().playing, true);
  });

  await test('mini queue still advances naturally without Media Session or Meting', { grid: false, mediaSession: false, metingFails: true }, async b => {
    b.engine.play();
    await delay(20);
    b.hide();
    await b.finish();
    const result = assertTrack(b, 'mini', 1);
    assert.equal(result.src, 'https://music.163.com/song/media/outer/url?id=1496089152.mp3');
    assert.equal(result.playing, true);
  });

  await test('non-music page restores full saved big queue and refreshes stale URL', {
    grid: false,
    path: '/about-site/',
    saved: { owner: 'big', index: 1, src: 'https://expired.example.test/old.mp3',
      name: playlist[1].name, artist: playlist[1].artist, cover: playlist[1].cover, time: 42, playing: true }
  }, async b => {
    await until(() => b.engine.getState().owner === 'big', 'saved big queue restores');
    await delay(20);
    assertTrack(b, 'big', 1);
    assert.equal(b.engine.ap.list.audios.length, playlist.length);
    assert.equal(b.engine.audio().currentTime, 42);
    assert.ok(b.requests.some(url => url.includes('/data/music-playlist.json')));
    assert.equal(b.sourceChanges.includes('https://expired.example.test/old.mp3'), false);
    b.hide();
    await b.finish();
    assertTrack(b, 'big', 2);
  });

  await test('restoring paused big state leaves selected track paused with full queue', {
    grid: false,
    path: '/',
    saved: { owner: 'big', index: 3, src: expectedUrl(3), name: playlist[3].name,
      artist: playlist[3].artist, cover: playlist[3].cover, time: 24, playing: false }
  }, async b => {
    await until(() => b.engine.getState().owner === 'big', 'paused big queue restores');
    assertTrack(b, 'big', 3);
    assert.equal(b.engine.getState().playing, false);
    assert.equal(b.engine.audio().currentTime, 24);
    assert.equal(b.plays.length, 0);
    assert.equal(b.engine.ap.list.audios.length, playlist.length);
  });

  await test('clicking the same track pauses and resumes without resetting progress', {}, async b => {
    await b.clickTrack(1);
    b.engine.audio().currentTime = 37;
    const previousSources = b.sourceChanges.length;
    await b.clickTrack(1);
    assert.equal(b.engine.getState().playing, false);
    await b.clickTrack(1);
    assert.equal(b.engine.getState().playing, true);
    assert.equal(b.engine.audio().currentTime, 37);
    assert.equal(b.sourceChanges.length, previousSources);
  });

  await test('single-track loop and non-looping list retain native APlayer behavior', {}, async b => {
    await b.clickTrack(2);
    b.engine.ap.options.loop = 'one';
    b.hide();
    await b.finish();
    assertTrack(b, 'big', 2);
    assert.equal(b.engine.getState().playing, true);
    b.engine.ap.options.loop = 'none';
    b.engine.select(playlist.length - 1, true);
    await delay(20);
    await b.finish();
    assertTrack(b, 'big', 0);
    assert.equal(b.engine.getState().playing, false);
  });

  await test('native mini controls get a fresh retry budget after error stop', {}, async b => {
    b.setAutoPlaying(false);
    await b.clickTrack(0);
    await b.fail();
    await b.fail();
    await b.fail();
    assert.equal(b.engine.getState().playing, false);
    // The compact APlayer shows the active big queue and uses its own controls.
    b.engine.ap.list.switch(3);
    b.engine.ap.play();
    await delay(20);
    await b.fail();
    assertTrack(b, 'big', 4);
    assert.equal(b.engine.getState().playing, true);
  });

  await test('late saved-playlist response cannot replace a new native mini selection', {
    grid: false, path: '/', deferPlaylistResponse: true,
    saved: { owner: 'big', index: 1, time: 42, playing: true }
  }, async b => {
    assert.equal(b.readyCount(), 0);
    b.engine.ap.list.switch(4);
    b.engine.ap.play();
    await delay(20);
    b.releasePlaylist();
    await until(() => b.readyCount() === 1, 'late restore completes');
    assertTrack(b, 'mini', 4);
    assert.equal(b.engine.getState().playing, true);
    assert.equal(b.engine.audio().currentTime, 0);
  });

  await test('explicit pause while restoring a saved playlist prevents delayed autoplay', {
    grid: false, path: '/', deferPlaylistResponse: true,
    saved: { owner: 'big', index: 1, time: 42, playing: true }
  }, async b => {
    b.engine.pause();
    b.releasePlaylist();
    await until(() => b.readyCount() === 1, 'cancelled restore completes');
    assertTrack(b, 'mini', 0);
    assert.equal(b.engine.getState().playing, false);
    assert.equal(b.plays.length, 0);
  });

  console.log('RESULT: PASS_' + passed + '_F' + failed);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
