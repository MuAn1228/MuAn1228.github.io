// node test/music-continuous.js [--built]
// Deterministic network/SourceBuffer state tests. Real decoding is covered by
// music-engine-browser.js; neither suite claims to emulate HeyTap lock-screen policy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const assetRoot = process.argv.includes('--built') ? 'public' : 'source';
const code = fs.readFileSync(path.join(__dirname, '..', assetRoot, 'js/music-continuous.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };

function browser(options = {}) {
  const dom = new JSDOM('<!doctype html><audio></audio>', { runScripts: 'outside-only', url: 'https://example.test/' });
  const w = dom.window;
  const audio = w.document.querySelector('audio');
  const data = { time: 0, paused: true, src: '', ranges: [] };
  const calls = { src: [], play: 0, requests: [], appends: [], removes: [], unavailable: [], fatal: [], advances: [] };
  const sources = [];
  const ranges = () => ({ length: data.ranges.length,
    start: i => data.ranges[i][0], end: i => data.ranges[i][1] });
  const proto = w.HTMLMediaElement.prototype;
  Object.defineProperties(proto, {
    currentTime: { configurable: true, get() { return data.time; }, set(t) { data.time = Number(t); } },
    duration: { configurable: true, get() { return Infinity; } },
    buffered: { configurable: true, get: ranges },
    paused: { configurable: true, get() { return data.paused; } },
    src: { configurable: true, get() { return data.src; }, set(url) {
      data.src = url; data.time = 0; data.ranges = []; calls.src.push(url);
      const source = sources[sources.length - 1];
      queueMicrotask(() => source.dispatchEvent(new w.Event('sourceopen')));
    } }
  });
  proto.play = function () { calls.play++; data.paused = false; return Promise.resolve(); };
  proto.pause = function () { data.paused = true; };
  class Buffer extends w.EventTarget {
    constructor() { super(); this.updating = false; this.timestampOffset = 0; }
    appendBuffer(bytes) {
      const v = new Uint8Array(bytes);
      const duration = v[3];
      const total = data.ranges.reduce((sum, r) => sum + r[1] - r[0], 0);
      if (total + duration > (options.capacity || Infinity)) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      this.updating = true;
      queueMicrotask(() => {
        const start = this.timestampOffset;
        const end = start + duration;
        const last = data.ranges[data.ranges.length - 1];
        if (last && Math.abs(last[1] - start) < 0.001) last[1] = end;
        else data.ranges.push([start, end]);
        this.timestampOffset = end;
        calls.appends.push({ index: v[2], start, end, bytes: v.length });
        this.updating = false;
        this.dispatchEvent(new w.Event('updateend'));
      });
    }
    remove(from, to) {
      this.updating = true;
      calls.removes.push({ from, to });
      queueMicrotask(() => {
        data.ranges = data.ranges.flatMap(([a, b]) => {
          if (to <= a || from >= b) return [[a, b]];
          return [...(a < from ? [[a, from]] : []), ...(to < b ? [[to, b]] : [])];
        });
        this.updating = false;
        this.dispatchEvent(new w.Event('updateend'));
      });
    }
    abort() { this.updating = false; }
  }
  class Source extends w.EventTarget {
    constructor() { super(); sources.push(this); }
    static isTypeSupported() { return true; }
    addSourceBuffer() { this.buffer = new Buffer(); return this.buffer; }
  }
  w.MediaSource = Source;
  w.URL.createObjectURL = () => 'blob:test/' + sources.length;
  w.URL.revokeObjectURL = () => {};
  w.AbortController = AbortController;
  w.fetch = (url, init) => {
    const request = { index: Number(url.split('/').pop()), aborted: false, queue: [], waiter: null };
    request.push = result => {
      if (request.waiter) { const resolve = request.waiter; request.waiter = null; resolve(result); }
      else request.queue.push(result);
    };
    request.chunk = bytes => request.push({ done: false, value: new Uint8Array(bytes) });
    request.finish = () => request.push({ done: true });
    request.complete = (duration = 100) => {
      request.chunk([255, 251, request.index, duration, 1, 2, 3, 4]); request.finish();
    };
    if (init && init.signal) init.signal.addEventListener('abort', () => { request.aborted = true; });
    calls.requests.push(request);
    return Promise.resolve({ ok: true, headers: { get: name => name === 'content-type' ? 'audio/mpeg' : null },
      body: { getReader: () => ({
        read: () => request.queue.length ? Promise.resolve(request.queue.shift()) : new Promise(resolve => { request.waiter = resolve; }),
        cancel: () => { request.aborted = true; request.finish(); return Promise.resolve(); }
      }) }
    });
  };
  w.eval(code);
  let stream;
  stream = w.__createBlogContinuousStream(audio, {
    getUrl: index => options.fail && options.fail.includes(index) ? Promise.resolve(null) : Promise.resolve('https://audio.test/' + index),
    play: () => audio.play().catch(() => {}),
    onAdvance: index => calls.advances.push(index),
    onUnavailable: (index, reason) => { calls.unavailable.push({ index, reason }); return options.continueFailures !== false; },
    onFatal: (reason, playing) => calls.fatal.push({ reason, playing })
  });
  return { w, audio, data, calls, sources, stream,
    start(index = 0, extra = {}) { assert.ok(stream.start(index, { count: 12, autoplay: true, ...extra })); audio.play(); },
    request(index) { const found = calls.requests.find(r => r.index === index && !r.aborted); assert.ok(found, 'request for ' + index); return found; },
    tick(time) { data.time = time; audio.dispatchEvent(new w.Event('timeupdate')); },
    close() { stream.stop(); dom.window.close(); }
  };
}

const cases = [];
function test(name, fn, options) { cases.push([name, fn, options]); }

test('first complete song only; hidden prefetch preserves its healthy download', async h => {
  h.start(); await flush();
  const first = h.request(0);
  first.chunk([255, 251, 0, 100]); await flush();
  h.stream.prefetchBurst(); await flush();
  assert.equal(h.calls.appends.length, 0);
  assert.equal(h.calls.requests.length, 1);
  assert.equal(first.aborted, false);
  first.chunk([1, 2, 3, 4]); first.finish(); await flush();
  assert.deepEqual(h.calls.appends[0], { index: 0, start: 0, end: 100, bytes: 8 });
  assert.equal(h.calls.play, 1);
});

test('out of order complete downloads still append in playlist order', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(2).complete(); await flush();
  assert.deepEqual(h.calls.appends.map(x => x.index), [0]);
  h.request(1).complete(); await flush();
  assert.deepEqual(h.calls.appends.map(x => x.index), [0, 1, 2]);
  assert.equal(h.audio.duration, 100);
  assert.equal(h.calls.requests.filter(r => !r.aborted).length, 5);
});

test('pending next keeps its download and the current playback position', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush(); h.tick(20);
  const next = h.request(1);
  h.stream.jump(1, 3, true); await flush();
  assert.equal(next.aborted, false);
  assert.equal(h.calls.requests.filter(x => x.index === 1).length, 1);
  assert.equal(h.data.time, 20);
  next.complete(); await flush();
  assert.equal(h.data.time, 103);
  assert.equal(h.calls.src.length, 1); assert.equal(h.calls.play, 1);
});

test('downloaded next waits for earlier pending segment without being fetched again', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(2).complete(); await flush();
  h.stream.jump(2, 0, true); await flush();
  assert.equal(h.calls.requests.filter(x => x.index === 2).length, 1);
  h.request(1).complete(); await flush();
  assert.equal(h.data.time, 200);
});

test('uncached previous appends to the same source; awaiting it does not move current audio', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush(); h.tick(20);
  h.stream.jump(11, 0, true); await flush();
  assert.equal(h.data.time, 20);
  h.request(11).complete(); await flush();
  assert.equal(h.data.time, 100);
  assert.equal(h.calls.src.length, 1); assert.equal(h.calls.play, 1);
});

test('future unavailable track reports only when playback reaches its boundary', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(1).chunk([60, 104, 116, 109]); h.request(1).finish(); await flush();
  assert.equal(h.calls.unavailable.length, 0);
  assert.equal(h.audio.duration, 100);
  h.request(2).complete(); await flush();
  h.tick(100); await flush();
  assert.deepEqual(h.calls.unavailable.map(x => x.index), [1]);
  assert.equal(h.calls.fatal.length, 0);
});

test('failed explicit target during initial loading advances instead of blocking start forever', async h => {
  h.start(); await flush();
  h.stream.jump(2, 8, true); await flush();
  h.request(0).complete(); await flush();
  h.request(1).complete(); await flush();
  h.request(2).chunk([60, 104, 116, 109]); h.request(2).finish(); await flush();
  h.request(3).complete(); await flush();
  assert.equal(h.audio.duration, 100);
  assert.equal(h.data.time, 200);
  assert.ok(h.calls.advances.includes(3));
  assert.equal(h.calls.play, 1);
});

test('pause during pending jump is respected after the requested track arrives', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.stream.jump(1, 0, true);
  h.audio.pause();
  h.request(1).complete(); await flush();
  assert.equal(h.audio.paused, true);
  assert.equal(h.calls.play, 1);
});

test('quota on future song never falls back or truncates the current song', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(1).complete(); await flush();
  h.request(2).complete(); await flush();
  assert.equal(h.calls.fatal.length, 0);
  assert.equal(h.audio.duration, 100);
  assert.equal(h.calls.src.length, 1);
  assert.equal(h.calls.appends.length, 2);
  h.tick(110); await flush();
  assert.equal(h.calls.appends.length, 3);
  assert.ok(h.calls.removes.some(r => r.to === 105));
}, { capacity: 220 });

test('uncached previous takes space from unused future audio when quota is full', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(1).complete(); await flush(); h.request(2).complete(); await flush();
  h.tick(20);
  h.stream.jump(11, 0, true); await flush();
  h.request(11).complete(); await flush();
  assert.equal(h.calls.fatal.length, 0);
  assert.ok(h.calls.removes.some(r => r.from === 100 && r.to === 200));
  assert.equal(h.data.time, 100);
  assert.equal(h.audio.duration, 100);
  assert.deepEqual(h.calls.appends.at(-1), { index: 11, start: 100, end: 200, bytes: 8 });
  assert.equal(h.calls.src.length, 1); assert.equal(h.calls.play, 1);
}, { capacity: 220 });

test('seeking reclaimed start of current track queues same audio rather than seeking into a hole', async h => {
  h.start(); await flush(); h.request(0).complete(); await flush();
  h.request(1).complete(); await flush(); h.request(2).complete(); await flush();
  h.tick(110); await flush();
  assert.equal(h.audio.buffered.start(0), 5);
  h.audio.currentTime = 0; await flush();
  assert.equal(h.data.time, 110);
  assert.equal(h.calls.requests.filter(r => r.index === 1).length, 2);
  assert.equal(h.calls.src.length, 1);
}, { capacity: 220 });

test('stale source events and completed downloads cannot mutate replacement session', async h => {
  h.start(); await flush();
  const oldRequest = h.request(0), oldSource = h.sources[0];
  h.start(5); await flush();
  oldSource.buffer.dispatchEvent(new h.w.Event('error'));
  oldSource.buffer.dispatchEvent(new h.w.Event('updateend'));
  oldSource.dispatchEvent(new h.w.Event('sourceopen'));
  oldRequest.complete(); await flush();
  assert.equal(oldRequest.aborted, true);
  h.request(5).complete(); await flush();
  assert.deepEqual(h.calls.appends.map(x => x.index), [5]);
  assert.equal(h.calls.fatal.length, 0);
  assert.equal(h.stream.isActive(), true);
});

// Keep per-case options visible at declarations without creating shared browsers.
// The runner always closes windows to cancel production timeouts and downloads.
(async () => {
  let passed = 0;
  for (const [name, fn, options] of cases) {
    const h = browser(options);
    try { await fn(h); passed++; console.log('PASS ' + name); }
    finally { h.close(); }
  }
  console.log('CONTINUOUS_PASS_' + passed + '_F0');
})().catch(error => { console.error(error); process.exitCode = 1; });
