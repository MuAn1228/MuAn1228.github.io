// node test/music-background-check.js [--built]
// This verifies the diagnostic page, not Android background execution policies.
// The production script runs unchanged; only native media and Media Session are simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const project = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const assetRoot = built ? 'public' : 'source';
const read = file => fs.readFileSync(path.join(project, file), 'utf8');
const script = read(assetRoot + '/js/music-background-check.js');
const html = built ? read('public/music-check/index.html')
  : read('source/music-check/index.html').replace(/^---[\s\S]*?---\s*/, '');
const storageKey = 'blog-music-check-report-v1';
const wait = () => new Promise(resolve => setTimeout(resolve, 12));

function browser(options = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://muan1228.github.io/music-check/',
    runScripts: 'outside-only', // Theme scripts, inline scripts and remote resources never run.
    pretendToBeVisual: true,
    virtualConsole: console
  });
  const { window } = dom;
  const { document } = window;
  const audio = document.getElementById('mcheck-audio');
  assert.ok(audio, 'actual page contains diagnostic audio element');
  const media = { paused: true, ended: false, time: 0, ready: 0, src: '', generation: 0, error: null };
  let hidden = false;
  const calls = { play: [], pause: 0, sources: [], clipboard: [] };
  const pending = [];
  const handlers = {};
  const dispatch = (target, name) => target.dispatchEvent(new window.Event(name));
  const queue = fn => window.setTimeout(fn, 0);
  Object.defineProperties(audio, {
    paused: { get: () => media.paused },
    ended: { get: () => media.ended },
    currentTime: { get: () => media.time, set: value => { media.time = Number(value); } },
    duration: { get: () => 12 },
    readyState: { get: () => media.ready },
    error: { get: () => media.error },
    src: {
      get: () => media.src,
      set(value) {
        media.src = value ? new URL(value, window.location.href).href : '';
        media.time = 0;
        media.ended = false;
        media.paused = true;
        media.ready = 0;
        media.error = null;
        const generation = ++media.generation;
        calls.sources.push(media.src);
        queue(() => {
          if (generation !== media.generation) return;
          media.ready = 4;
          dispatch(audio, 'loadedmetadata');
        });
      }
    }
  });
  audio.play = function () {
    const generation = media.generation;
    const number = calls.play.length + 1;
    calls.play.push({ src: media.src, hidden, position: media.time, ended: media.ended });
    if (options.throwAt === number) throw new window.DOMException('Unsupported source', 'NotSupportedError');
    if (options.rejectAt === number) {
      media.paused = true;
      return Promise.reject(new window.DOMException('Autoplay rejected', 'NotAllowedError'));
    }
    const wasPaused = media.paused;
    media.paused = false;
    media.ended = false;
    return new Promise(resolve => {
      const complete = () => {
        if (generation === media.generation && !media.paused) {
          if (wasPaused) dispatch(audio, 'play');
          dispatch(audio, 'playing');
        }
        resolve();
      };
      if (options.deferAt === number) pending.push(complete);
      else queue(complete);
    });
  };
  audio.pause = function () {
    calls.pause++;
    if (media.paused) return;
    media.paused = true;
    queue(() => dispatch(audio, 'pause'));
  };
  audio.load = function () {};
  Object.defineProperties(document, {
    hidden: { configurable: true, get: () => hidden },
    visibilityState: { configurable: true, get: () => hidden ? 'hidden' : 'visible' }
  });
  if (options.mediaSession !== false) {
    Object.defineProperty(window.navigator, 'mediaSession', { value: {
      metadata: null,
      playbackState: 'none',
      setActionHandler(name, callback) { handlers[name] = callback; }
    } });
    window.MediaMetadata = class { constructor(value) { Object.assign(this, value); } };
  }
  Object.defineProperty(window.navigator, 'clipboard', { value: {
    writeText: async value => { calls.clipboard.push(value); }
  } });
  window.fetch = () => { throw new Error('Diagnostic page must not fetch external resources'); };
  if (options.saved !== undefined) window.sessionStorage.setItem(storageKey,
    typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved));
  window.eval(script);
  return {
    window, document, audio, media, calls, handlers, errors,
    report: () => JSON.parse(document.getElementById('mcheck-report').value || 'null'),
    saved: () => JSON.parse(window.sessionStorage.getItem(storageKey)),
    status: () => document.getElementById('mcheck-status').textContent,
    click: name => document.getElementById('mcheck-' + name).click(),
    event: name => dispatch(document, name),
    windowEvent: name => dispatch(window, name),
    audioEvent: name => dispatch(audio, name),
    hide(value = true) { hidden = value; dispatch(document, 'visibilitychange'); },
    finish() {
      assert.equal(media.paused, false, 'natural end requires active playback');
      media.time = 12;
      media.ended = true;
      media.paused = true;
      dispatch(audio, 'timeupdate');
      dispatch(audio, 'pause');
      dispatch(audio, 'ended');
    },
    settlePending() { pending.splice(0).forEach(resolve => resolve()); },
    reevaluate() { window.eval(script); },
    close() { window.close(); }
  };
}

let passed = 0;
let failed = 0;
async function test(name, options, run) {
  let b;
  try {
    b = browser(options);
    await run(b);
    await wait();
    assert.deepEqual(b.errors, [], 'no unhandled browser errors');
    passed++;
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n' + error.stack);
  } finally {
    if (b) b.close();
  }
}

(async () => {
  await test('standalone page loads only local diagnostic script and no blog engine', {}, async b => {
    assert.deepEqual(Array.from(b.document.scripts, node => node.getAttribute('src')),
      ['/js/music-background-check.js?v=1']);
    assert.equal(b.document.querySelectorAll('audio').length, 1);
    assert.equal(b.window.__blogMusic, undefined);
    assert.doesNotMatch(html, /APlayer|music-playlist|page-assets/);
  });

  await test('page starts idle and duplicate script does not duplicate listeners', {}, async b => {
    assert.equal(b.calls.play.length, 0);
    assert.equal(b.report(), null);
    b.reevaluate();
    b.click('start');
    await wait();
    assert.equal(b.calls.play.length, 1);
    assert.equal(b.report().events.filter(item => item.event === 'test-start').length, 1);
    assert.equal(b.report().audioInDocument, true);
  });

  await test('three hidden segments advance synchronously and report background completion', {}, async b => {
    b.click('start');
    await wait();
    b.hide();
    for (let completed = 1; completed <= 3; completed++) {
      b.finish();
      // Assert before waiting: next-track requests must not require foreground timers.
      assert.equal(b.calls.play.length, Math.min(completed + 1, 3));
      await wait();
    }
    const report = b.report();
    assert.equal(report.completedTracks, 3);
    assert.deepEqual(report.events.filter(item => item.event === 'ended').map(item => [item.track, item.hidden]),
      [[1, true], [2, true], [3, true]]);
    assert.equal(report.events.filter(item => item.event === 'play-resolved').length, 3);
    assert.equal(report.events.at(-1).event, 'test-complete');
    assert.deepEqual(b.calls.sources.map(src => new URL(src).pathname),
      ['/media/music-check/tone-a.wav', '/media/music-check/tone-b.wav', '/media/music-check/tone-a.wav']);
    assert.ok(b.calls.play.every(call => call.position === 0 && call.ended === false));
    assert.match(b.status(), /三段均在后台/);
    assert.deepEqual(b.saved(), report);
  });

  await test('foreground completion is not reported as verified background playback', {}, async b => {
    b.click('start');
    await wait();
    for (let i = 0; i < 3; i++) { b.finish(); await wait(); }
    assert.equal(b.report().completedTracks, 3);
    assert.match(b.status(), /前台/);
    assert.doesNotMatch(b.status(), /三段均在后台/);
  });

  await test('rejected next-track play is recorded and does not advance further', { rejectAt: 2 }, async b => {
    b.click('start');
    await wait();
    b.hide();
    b.finish();
    await wait();
    const rejection = b.report().events.find(item => item.event === 'play-rejected');
    assert.equal(rejection.reason, 'NotAllowedError');
    assert.equal(rejection.track, 2);
    assert.equal(rejection.hidden, true);
    assert.equal(b.report().completedTracks, 1);
    b.audioEvent('ended');
    assert.equal(b.calls.play.length, 2);
    assert.match(b.status(), /未能继续播放/);
  });

  await test('synchronous play exception is recorded without unhandled errors', { throwAt: 1 }, async b => {
    b.click('start');
    await wait();
    assert.equal(b.report().events.find(item => item.event === 'play-rejected').reason, 'NotSupportedError');
    assert.equal(b.report().completedTracks, 0);
    b.audioEvent('ended');
    assert.equal(b.calls.play.length, 1);
  });

  await test('stop invalidates pending play result and prevents ended from starting next segment', { deferAt: 1 }, async b => {
    b.click('start');
    b.click('stop');
    b.settlePending();
    await wait();
    assert.equal(b.audio.paused, true);
    assert.equal(b.report().events.at(-1).event, 'user-stop');
    assert.equal(b.report().events.some(item => item.event === 'play-resolved'), false);
    const snapshot = b.report();
    b.audioEvent('ended');
    b.hide();
    assert.equal(b.calls.play.length, 1);
    assert.deepEqual(b.report(), snapshot);
    b.click('start');
    await wait();
    assert.equal(b.calls.play.length, 2);
    assert.equal(b.report().completedTracks, 0);
    assert.equal(b.report().events.filter(item => item.event === 'test-start').length, 1);
  });

  await test('PJAX cleanup pauses audio and detached page cannot continue or record events', {}, async b => {
    b.click('start');
    await wait();
    b.event('pjax:send');
    b.document.getElementById('mcheck').remove();
    const saved = b.saved();
    b.audioEvent('ended');
    b.hide();
    b.event('freeze');
    b.event('resume');
    await wait();
    assert.equal(b.audio.paused, true);
    assert.equal(b.calls.play.length, 1);
    assert.deepEqual(b.saved(), saved);
    assert.equal(saved.events.at(-1).event, 'navigation-stop');
    assert.equal(b.handlers.play, null);
  });

  await test('PJAX cleanup also pauses a native-controls replay after diagnostic has stopped', {}, async b => {
    b.click('start');
    await wait();
    b.click('stop');
    await b.audio.play();
    assert.equal(b.audio.paused, false);
    b.event('pjax:send');
    assert.equal(b.audio.paused, true);
    b.audioEvent('ended');
    assert.equal(b.calls.play.length, 2);
  });

  await test('pagehide stops playback and a cached page can start a fresh run on return', {}, async b => {
    b.click('start');
    await wait();
    b.windowEvent('pagehide');
    await wait();
    assert.equal(b.audio.paused, true);
    assert.equal(b.report().events.at(-1).event, 'pagehide');
    const report = b.report();
    b.audioEvent('ended');
    b.windowEvent('pageshow');
    assert.equal(b.calls.play.length, 1);
    assert.deepEqual(b.report(), report);
    b.click('start');
    await wait();
    assert.equal(b.calls.play.length, 2);
    assert.equal(b.report().completedTracks, 0);
    assert.equal(b.report().events.filter(item => item.event === 'test-start').length, 1);
  });

  await test('visibility freeze resume and buffering events retain order and context', {}, async b => {
    b.click('start');
    await wait();
    b.audio.currentTime = 5.36;
    b.hide();
    b.event('freeze');
    b.event('resume');
    b.audioEvent('waiting');
    b.audioEvent('stalled');
    b.hide(false);
    const events = b.report().events.filter(item => ['visibilitychange', 'freeze', 'resume', 'waiting', 'stalled'].includes(item.event));
    assert.deepEqual(events.map(item => item.event), ['visibilitychange', 'freeze', 'resume', 'waiting', 'stalled', 'visibilitychange']);
    assert.deepEqual(events.map(item => item.hidden), [true, true, true, true, true, false]);
    assert.ok(events.every(item => item.position === 5.4 && item.track === 1 && item.elapsedSeconds >= 0));
  });

  await test('saved report is shown and can be copied without autoplay', {
    saved: { version: 1, startedAt: Date.now(), userAgent: 'saved-device', completedTracks: 2,
      events: [{ event: 'freeze', hidden: true, track: 3 }] }
  }, async b => {
    assert.equal(b.report().completedTracks, 2);
    assert.equal(b.report().userAgent, 'saved-device');
    assert.equal(b.calls.play.length, 0);
    b.hide();
    b.event('resume');
    assert.equal(b.calls.play.length, 0);
    b.click('copy');
    await wait();
    assert.equal(b.calls.clipboard.length, 1);
    assert.equal(JSON.parse(b.calls.clipboard[0]).completedTracks, 2);
    assert.equal(b.saved().events.at(-1).event, 'copy-report');
  });

  await test('malformed stored JSON does not prevent a new diagnostic run', { saved: '{broken' }, async b => {
    assert.equal(b.calls.play.length, 0);
    b.click('start');
    await wait();
    assert.equal(b.report().version, 1);
    assert.equal(b.calls.play.length, 1);
  });

  await test('Media Session controls only diagnostic audio and are cleared on stop', {}, async b => {
    b.click('start');
    await wait();
    assert.equal(b.handlers.nexttrack, null);
    assert.equal(b.handlers.seekto, null);
    assert.match(b.window.navigator.mediaSession.metadata.title, /后台连播检查/);
    b.handlers.pause();
    await wait();
    assert.equal(b.audio.paused, true);
    assert.equal(b.window.navigator.mediaSession.playbackState, 'paused');
    b.handlers.play();
    await wait();
    assert.equal(b.audio.paused, false);
    assert.equal(b.window.navigator.mediaSession.playbackState, 'playing');
    const oldPlay = b.handlers.play;
    b.click('stop');
    await wait();
    assert.ok(Object.values(b.handlers).every(handler => handler === null));
    assert.equal(b.window.navigator.mediaSession.metadata, null);
    assert.equal(b.window.navigator.mediaSession.playbackState, 'none');
    oldPlay();
    assert.equal(b.calls.play.length, 2);
  });

  await test('Media Session metadata follows segments and clears after completion', {}, async b => {
    b.click('start');
    await wait();
    b.hide();
    for (let i = 0; i < 3; i++) {
      assert.match(b.window.navigator.mediaSession.metadata.title, new RegExp('第 ' + (i + 1) + ' 段'));
      b.finish();
      await wait();
    }
    assert.equal(b.window.navigator.mediaSession.metadata, null);
    assert.equal(b.window.navigator.mediaSession.playbackState, 'none');
    assert.ok(Object.values(b.handlers).every(handler => handler === null));
  });

  await test('media error saves native code and clears lock-screen controls', {}, async b => {
    b.click('start');
    await wait();
    b.media.error = { code: 4 };
    b.audioEvent('error');
    const error = b.report().events.find(item => item.event === 'media-error');
    assert.equal(error.code, 4);
    assert.equal(b.handlers.play, null);
    b.audioEvent('ended');
    assert.equal(b.calls.play.length, 1);
    assert.match(b.status(), /音频加载失败/);
  });

  await test('diagnostic works in browsers without Media Session', { mediaSession: false }, async b => {
    b.click('start');
    await wait();
    b.hide();
    for (let i = 0; i < 3; i++) { b.finish(); await wait(); }
    assert.equal(b.report().completedTracks, 3);
  });

  console.log('RESULT: PASS_' + passed + '_F' + failed + (built ? ' (built)' : ' (source)'));
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
