// node test/music-engine-browser.js [--built]
// Production APlayer + guard + continuous stream + playlist, real Chromium MP3
// decoding, with deterministic local HTTP timing. Hidden state is simulated;
// this does not reproduce Android/HeyTap OS suspension or Bluetooth delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const built = process.argv.includes('--built');
const assetRoot = path.join(root, built ? 'public' : 'source');
const read = name => fs.readFileSync(path.join(assetRoot, name));
const engineSource = read('js/music-playlist.js').toString('utf8');
const songBlock = engineSource.slice(engineSource.indexOf('var songs = ['));
const ids = [...songBlock.slice(0, songBlock.indexOf('];')).matchAll(/"id":\s*(\d+)/g)]
  .map(match => Number(match[1]));
assert.ok(ids.length >= 10, 'production mini playlist was found');
const toneSeconds = 12.042448;

// This function runs before any production scripts. All media methods delegate
// to native implementations; only network routes and visibility are controlled.
function instrument(config) {
  window.probe = { config, src: [], plays: [], events: [], appends: [], removals: [], errors: [], actions: {}, marks: [] };
  const p = window.probe;
  const proto = HTMLMediaElement.prototype;
  const src = Object.getOwnPropertyDescriptor(proto, 'src');
  const currentTime = Object.getOwnPropertyDescriptor(proto, 'currentTime');
  const buffered = Object.getOwnPropertyDescriptor(proto, 'buffered');
  const nativePlay = proto.play;
  p.nativeTime = audio => currentTime.get.call(audio);
  p.nativeEnd = audio => {
    const ranges = buffered.get.call(audio);
    return ranges.length ? ranges.end(ranges.length - 1) : 0;
  };
  Object.defineProperty(proto, 'src', {
    configurable: true, get: src.get,
    set(value) {
      p.src.push({ at: performance.now(), value: String(value) });
      // APlayer assigns its initial classic URL before MSE exists. Keep that
      // harmless preload local too, so CSP does not manufacture a media error.
      const actual = String(value).startsWith('https://cdn.jsdelivr.net/') ? '/__initial-audio' : value;
      src.set.call(this, actual);
    }
  });
  proto.play = function () {
    p.plays.push({ at: performance.now(), bufferedEnd: p.nativeEnd(this) });
    return nativePlay.apply(this, arguments);
  };
  const nativeAdd = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (type) {
    const buffer = nativeAdd.call(this, type);
    const append = buffer.appendBuffer.bind(buffer);
    const remove = buffer.remove.bind(buffer);
    buffer.appendBuffer = function (bytes) {
      if (p.forceQuota && !p.quotaThrown) {
        p.quotaThrown = true;
        throw new DOMException('Deterministic full buffer for uncached previous', 'QuotaExceededError');
      }
      return append(bytes);
    };
    buffer.remove = function (from, to) {
      p.removals.push({ from, to, at: performance.now() });
      return remove(from, to);
    };
    buffer.addEventListener('updateend', () => {
      p.appends.push({ at: performance.now(), offset: buffer.timestampOffset,
        end: buffer.buffered.length ? buffer.buffered.end(buffer.buffered.length - 1) : 0 });
    });
    return buffer;
  };
  const originalHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
  navigator.mediaSession.setActionHandler = function (action, callback) {
    p.actions[action] = callback;
    return originalHandler(action, callback);
  };
  const nativeFetch = window.fetch.bind(window);
  p.fetch = nativeFetch;
  window.fetch = function (input, options) {
    const url = new URL(String(input), location.href);
    if (url.hostname === 'cdn.jsdelivr.net') {
      const match = url.pathname.match(/\/(\d+)\.mp3$/);
      if (!match) return Promise.reject(new Error('Unexpected audio URL: ' + url));
      return nativeFetch('/__audio/' + config.ids.indexOf(Number(match[1])), options);
    }
    if (url.origin !== location.origin) return Promise.reject(new Error('External fetch forbidden: ' + url));
    return nativeFetch(input, options);
  };
  window.addEventListener('error', event => { if (event.message) p.errors.push(event.message); });
  window.addEventListener('unhandledrejection', event => p.errors.push(String(event.reason)));
}

async function browserRun() {
  const p = window.probe;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function check(condition, label) { if (!condition) throw new Error(label); }
  async function waitFor(predicate, label, ms = 10000) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error('Timeout: ' + label);
  }
  let engine, audio;
  function snapshot(label) {
    const result = { label, at: performance.now(), index: engine.ap.list.index,
      native: p.nativeTime(audio), time: audio.currentTime, duration: audio.duration,
      bufferedEnd: p.nativeEnd(audio), paused: audio.paused, src: p.src.length, plays: p.plays.length };
    p.marks.push(result);
    return result;
  }
  function hide() {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }
  try {
    await waitFor(() => window.__blogMusic && window.__blogMusic.ap, 'engine ready');
    engine = window.__blogMusic;
    audio = engine.audio();
    ['playing', 'pause', 'ended', 'error', 'waiting'].forEach(event => {
      audio.addEventListener(event, () => p.events.push({ event, at: performance.now(), hidden: document.hidden }));
    });
    document.addEventListener('blog-music-error', event => p.errors.push(JSON.stringify(event.detail)));
    await new Promise(resolve => {
      const button = document.getElementById('probe-play');
      button.disabled = false;
      button.onclick = () => { engine.play(); resolve(); };
      p.fetch('/__probe/ready', { method: 'POST' });
    });
    if (p.config.mode === 'delayed-current') {
      // First response has already yielded playable MP3 bytes, but its tail is
      // withheld. Reserve play in the click gesture, but do not expose partial
      // audio that would run out if background fetch subsequently stops.
      let partial = false;
      for (let n = 0; n < 100 && !partial; n++) {
        const events = await (await p.fetch('/__probe/network')).json();
        partial = events.some(event => event.type === 'partial' && event.index === 0);
        if (!partial) await sleep(20);
      }
      check(partial, 'server sent the first partial response');
      await sleep(150);
      snapshot('partial-current');
      check(!p.events.some(event => event.event === 'playing') && p.nativeEnd(audio) === 0,
        'audible playback must wait for complete first track');
      hide();
      await sleep(250);
      check(!p.events.some(event => event.event === 'playing') && p.nativeEnd(audio) === 0,
        'hiding during current download must not play an incomplete first track');
    }
    await waitFor(() => !audio.paused && audio.currentTime > 0.05, 'native playback starts');
    const first = snapshot('first-playing');
    check(Math.abs(first.duration - 12.042448) < 0.15, 'complete first duration survives out-of-order fetches');
    check(first.bufferedEnd >= 12, 'the entire first track is decoded before play');
    hide();
    if (p.config.mode === 'pending-next') {
      check(p.actions.nexttrack && p.actions.previoustrack, 'native Media Session handlers registered');
      const before = snapshot('before-pending-next');
      p.actions.nexttrack({ action: 'nexttrack' });
      await sleep(150);
      const pending = snapshot('pending-next');
      check(pending.src === before.src && pending.plays === before.plays,
        'queued next must keep the existing native source and play request while fetching');
      check(!pending.paused && pending.native >= before.native && pending.native < before.native + 1,
        'waiting for next must keep playing from the current position, not seek to the buffer tail');
      await waitFor(() => engine.ap.list.index === 1 && p.nativeTime(audio) >= 12 && audio.currentTime > 0.05,
        'queued next lands on the completed second track');
      const landed = snapshot('pending-next-landed');
      check(landed.src === before.src && landed.plays === before.plays && !landed.paused,
        'queued next stays in the same playing session');
      p.actions.previoustrack({ action: 'previoustrack' });
      await waitFor(() => engine.ap.list.index === 0 && p.nativeTime(audio) < 2 && !audio.seeking,
        'hidden previous returns to first track');
    }
    await waitFor(() => p.nativeEnd(audio) >= 7 * 12, 'current plus six complete tracks buffered');
    const stable = snapshot('buffered');
    if (p.config.mode === 'quota-previous') {
      p.forceQuota = true;
      p.actions.previoustrack({ action: 'previoustrack' });
      await waitFor(() => engine.ap.list.index === p.config.ids.length - 1 &&
        p.nativeTime(audio) >= 12 && p.nativeTime(audio) < 14 &&
        audio.currentTime > 0.05 && audio.currentTime < 2 && !audio.seeking,
      'uncached previous appends after the current track when buffer quota is full');
      const previous = snapshot('quota-previous');
      check(p.quotaThrown && p.removals.some(range => Math.abs(range.from - 12.042448) < 0.15 && range.to >= 7 * 12),
        'quota recovery removes unused future tracks while preserving current audio');
      check(Math.abs(previous.duration - 12.042448) < 0.15,
        'reset sequence timestamp offset gives the appended previous its real duration');
      check(previous.src === stable.src && previous.plays === stable.plays && !previous.paused,
        'quota recovery must not replace the native source or issue another play request');
      const landedTime = previous.native;
      await sleep(200);
      check(p.nativeTime(audio) > landedTime && !audio.paused,
        'real decoder keeps advancing after seeking into the newly appended previous');
    } else {
      for (let index = 0; index < 3; index++) {
        check(engine.ap.list.index === index, 'consecutive index before natural boundary ' + index);
        check(Math.abs(audio.duration - 12.042448) < 0.15, 'virtual duration before boundary ' + index);
        // Real decoder crosses each boundary at normal speed; seeking skips only
        // the middle of each test tone, with no synthetic timeupdate/ended events.
        audio.currentTime = audio.duration - 0.65;
        await waitFor(() => engine.ap.list.index === index + 1 && !audio.seeking,
          'natural track boundary ' + index);
        const mark = snapshot('boundary-' + (index + 1));
        check(!mark.paused && mark.time < 1.5, 'new track keeps playing from its own start');
        check(mark.src === stable.src && mark.plays === stable.plays,
          'natural boundary must not assign src or call native play');
      }
      engine.next();
      await waitFor(() => engine.ap.list.index === 4 && p.nativeTime(audio) > 48 && !audio.seeking,
        'public next seeks to a buffered track');
      snapshot('public-next');
      engine.previous();
      await waitFor(() => engine.ap.list.index === 3 && p.nativeTime(audio) < 38 && !audio.seeking,
        'public previous seeks to a buffered track');
      const final = snapshot('public-previous');
      check(final.src === stable.src && final.plays === stable.plays && !final.paused,
        'public next/previous keep one native stream playing while hidden');
      check(Math.abs(audio.duration - 12.042448) < 0.15, 'duration remains track-relative after media controls');
      if (p.config.mode === 'pending-next') {
        // Previous from the first track wraps to a song that has never been
        // downloaded. It must append+seek, not rebuild MSE or request play again.
        engine.ap.list.switch(0);
        await waitFor(() => engine.ap.list.index === 0 && p.nativeTime(audio) < 2 && !audio.seeking,
          'return to first track before an unbuffered previous');
        p.actions.previoustrack({ action: 'previoustrack' });
        await waitFor(() => engine.ap.list.index === p.config.ids.length - 1 &&
          p.nativeTime(audio) > 60 && audio.currentTime > 0.05 && audio.currentTime < 2 && !audio.seeking,
        'hidden unbuffered previous appends the wrapped last song');
        const previous = snapshot('unbuffered-previous');
        check(previous.src === stable.src && previous.plays === stable.plays && !previous.paused,
          'unbuffered previous must not replace the source or issue native play');
      }
    }
    check(!p.events.some(event => event.event === 'ended' || event.event === 'error'),
      'native media must never end or fail between tracks');
    check(p.errors.length === 0, 'no production JS or song errors: ' + p.errors.join('; '));
    p.ok = true;
  } catch (error) {
    p.ok = false;
    p.error = error.stack || String(error);
    if (audio) snapshot('failure');
  }
  await p.fetch('/__probe/result', { method: 'POST', body: JSON.stringify(p) });
}

function chromePath() {
  const browser = [process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean).find(candidate => fs.existsSync(candidate));
  assert.ok(browser, 'Chromium missing: set CHROME_BIN to an installed executable');
  return browser;
}

async function run(mode) {
  const config = { ids, mode };
  const page = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<button id="probe-play" disabled style="position:fixed;left:10px;top:10px;width:100px;height:40px;z-index:2147483647">Play test</button>' +
    '<header id="page-header"><div id="page-site-info"></div></header>' +
    '<script>(' + instrument + ')(' + JSON.stringify(config) + ')</script>' +
    ['/lib/APlayer.min.js', '/js/music-playback-guard.js', '/js/music-continuous.js', '/js/music-playlist.js']
      .map(url => '<script src="' + url + '"></script>').join('') +
    '<script>(' + browserRun + ')()</script></body></html>';
  const network = [];
  const timers = new Set();
  const assets = new Map([
    '/lib/APlayer.min.js', '/js/music-playback-guard.js', '/js/music-continuous.js', '/js/music-playlist.js'
  ].map(url => [url, read(url.slice(1))]));
  const tones = [read('media/music-check/tone-a.mp3'), read('media/music-check/tone-b.mp3')];
  const started = Date.now();
  let finish;
  let timeout;
  let child;
  let stderr = '';
  let posted = false;
  let ready;
  const readyForClick = new Promise(resolve => { ready = resolve; });
  const result = new Promise(resolve => { finish = resolve; });
  function record(type, index) { network.push({ type, index, at: Date.now() - started }); }
  function later(callback, ms) {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
    timers.add(timer);
  }
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'" });
      response.end(page);
    } else if (url === '/__probe/result' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 262144) request.destroy(); });
      request.on('end', () => {
        try { const parsed = JSON.parse(body); posted = true; response.end('ok'); finish(parsed); }
        catch (_) { response.writeHead(400).end(); }
      });
    } else if (url === '/__probe/ready') {
      response.end('ok');
      ready();
    } else if (url === '/__probe/network') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(network));
    } else if (url === '/data/local-playlist-ids.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(ids));
    } else if (url === '/__initial-audio') {
      response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': tones[0].length }).end(tones[0]);
    } else if (url.startsWith('/__audio/')) {
      const index = Number(url.slice('/__audio/'.length));
      if (!Number.isInteger(index) || index < 0 || index >= ids.length) { response.writeHead(404).end(); return; }
      const bytes = tones[index % 2];
      record('request', index);
      response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': bytes.length });
      const done = remaining => {
        if (response.destroyed) return;
        response.end(remaining);
        record('complete', index);
      };
      if (mode === 'delayed-current' && index === 0) {
        response.write(bytes.subarray(0, 64000));
        record('partial', index);
        later(() => { if (!response.destroyed) response.write(bytes.subarray(64000, 96000)); }, 60);
        later(() => done(bytes.subarray(96000)), 1800);
      } else if (mode === 'pending-next' && index === 1) {
        response.write(bytes.subarray(0, 16000));
        record('partial', index);
        later(() => done(bytes.subarray(16000)), 2200);
      } else done(bytes);
    } else if (assets.has(url)) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(assets.get(url));
    } else response.writeHead(204).end();
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-music-browser-'));
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    child = spawn(chromePath(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--autoplay-policy=user-gesture-required', '--remote-debugging-port=0', '--user-data-dir=' + profile,
      'http://127.0.0.1:' + server.address().port + '/'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    const clicked = readyForClick.then(() => clickPlay(profile));
    const payload = await Promise.race([Promise.all([result, clicked]).then(values => values[0]), new Promise((_, reject) => {
      child.once('error', reject);
      child.once('exit', code => { if (!posted) reject(new Error('Chrome exited early: ' + code + '\n' + stderr)); });
      timeout = setTimeout(() => reject(new Error('Browser probe exceeded 40s: ' + stderr)), 40000);
    })]);
    assert.equal(payload.ok, true, JSON.stringify({ ...payload, network }, null, 2));
    assert.equal(payload.plays.length, 1, 'one native play request throughout all boundaries and controls');
    assert.equal(payload.src.length, 2, 'constructor URL then exactly one MediaSource assignment');
    assert.match(payload.src[1].value, /^blob:/);
    const firstPlaying = payload.marks.find(mark => mark.label === 'first-playing');
    assert.ok(firstPlaying.bufferedEnd >= toneSeconds - 0.15, 'audible playback starts with a complete current song');
    if (mode !== 'quota-previous') {
      assert.deepEqual(payload.marks.filter(mark => mark.label.startsWith('boundary-')).map(mark => mark.index), [1, 2, 3]);
    }
    const firstDone = network.find(event => event.type === 'complete' && event.index === 0);
    assert.equal(network.filter(event => event.type === 'request' && event.index === 0 && event.at <= firstDone.at).length, 1,
      'hidden transition must not cancel/refetch a healthy first-track download');
    if (mode === 'pending-next') {
      const currentDone = network.find(event => event.type === 'complete' && event.index === 1);
      const futureDone = network.find(event => event.type === 'complete' && event.index > 1);
      assert.ok(futureDone && futureDone.at < currentDone.at, 'future response really finished before current tail');
    }
    console.log('PASS ' + mode + ': real MP3, src=2, native play=1, hidden controls stay in session');
  } finally {
    clearTimeout(timeout);
    for (const timer of timers) clearTimeout(timer);
    if (child && child.pid && child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore', timeout: 5000 });
      else child.kill('SIGKILL');
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // Only remove the exact directory allocated by this test inside os.tmpdir.
    const parent = fs.realpathSync(os.tmpdir());
    const resolved = fs.realpathSync(profile);
    if (path.dirname(resolved).toLowerCase() === parent.toLowerCase() && path.basename(resolved).startsWith('blog-music-browser-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
        console.warn('Chrome profile remains locked after shutdown: ' + resolved);
      }
    }
  }
}

// Use a real browser input event and the normal user-gesture autoplay gate. The
// page must issue its initial native play synchronously from this button click.
async function clickPlay(profile) {
  const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:'));
  assert.ok(target, 'local probe page is available through DevTools');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  function command(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const onMessage = event => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener('message', onMessage);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      };
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  try {
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 30, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 30, button: 'left', clickCount: 1 });
  } finally { socket.close(); }
}

(async () => {
  await run('delayed-current');
  await run('pending-next');
  await run('quota-previous');
  console.log('RESULT: PASS_3_F0 (' + (built ? 'built' : 'source') + '; Android OS and Bluetooth delivery need real-device verification)');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
