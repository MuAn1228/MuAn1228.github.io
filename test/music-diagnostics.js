// Run: node test/music-diagnostics.js [--built]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const assetRoot = process.argv.includes('--built') ? 'public' : 'source';
const script = fs.readFileSync(path.join(root, assetRoot, 'js/music-diagnostics.js'), 'utf8');
const dom = new JSDOM('<!doctype html><button id="music-export-diagnostics"><span>Export</span></button>' +
  '<span id="music-diagnostics-status" role="status" aria-live="polite"></span>', {
  url: 'https://muan1228.github.io/fun/music/?private=not-in-report', runScripts: 'outside-only'
});
const { window } = dom;
const { document } = window;
let requests = 0;
window.fetch = () => { requests++; throw new Error('Diagnostics must never upload'); };
window.eval(script);
document.querySelector('button span').click();
assert.match(document.getElementById('music-diagnostics-status').textContent, /正在加载/);

const audio = document.createElement('audio');
audio.src = 'blob:https://muan1228.github.io/private-token';
let hidden = false;
Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
// Simulate the raw media timeline, then shadow it with the production virtual timeline.
Object.defineProperties(window.HTMLMediaElement.prototype, {
  currentTime: { configurable: true, get: () => 143.5 },
  duration: { configurable: true, get: () => Infinity },
  buffered: { configurable: true, get: () => ({ length: 1, start: () => 100, end: () => 500 }) }
});
Object.defineProperties(audio, {
  currentTime: { get: () => 3.5 }, duration: { get: () => 200 },
  buffered: { get: () => ({ length: 1, start: () => 0, end: () => 200 }) }
});
const logical = { owner: 'big', index: 7, name: 'Current song', artist: 'Artist',
  time: 3.5, playing: true, src: 'https://audio.test/song.mp3?private=signature' };
const diagnostics = window.__createBlogMusicDiagnostics(audio, () => logical);
let report = diagnostics.snapshot();
assert.equal(report.current.native.time, 143.5, 'must read original media descriptor, bypassing virtual song time');
assert.equal(report.current.native.duration, null, 'Infinity must have an explicit JSON-safe representation');
assert.deepEqual(JSON.parse(JSON.stringify(report.current.native.buffered)), [[100, 500]]);
assert.equal(report.current.track.time, 3.5);
assert.equal(report.current.native.sourceType, 'continuous');
assert.equal(report.page, '/fun/music/');
assert.ok(!JSON.stringify(report).includes('private'), 'reports exclude URL signatures and page query parameters');

hidden = true;
document.dispatchEvent(new window.Event('visibilitychange'));
audio.dispatchEvent(new window.Event('waiting'));
const detail = { source: 'media-session', target: 8, deduplicated: false };
diagnostics.record('media-control', detail);
detail.target = 99;
report = diagnostics.snapshot();
assert.equal(report.events.at(-1).details.target, 8, 'record immutable evidence');
assert.equal(report.events.at(-2).event, 'waiting');
assert.equal(report.events.at(-2).hidden, true);
assert.equal(report.events.at(-3).event, 'visibilitychange');
report.events[0].event = 'tampered';
assert.equal(diagnostics.snapshot().events[0].event, 'diagnostics-ready', 'snapshot mutations cannot change the ring');

for (let i = 0; i < 200; i++) diagnostics.record('control', { index: i });
report = diagnostics.snapshot();
assert.equal(report.retainedEvents, 160);
assert.equal(report.events.length, 160);
assert.ok(report.eventCount > report.events.length);
assert.equal(report.events[0].details.index, 40);

let downloads = 0;
let exported = null;
let revoke = null;
window.Blob = class Blob { constructor(parts) { exported = JSON.parse(parts.join('')); } };
window.URL.createObjectURL = () => 'blob:test-report';
window.URL.revokeObjectURL = url => { revoke = url; };
window.HTMLAnchorElement.prototype.click = function () {
  downloads++;
  assert.match(this.download, /^music-diagnostics-.*\.json$/);
};
let release;
window.setTimeout = callback => { release = callback; };
// PJAX replacement + accidental script re-evaluation must still export exactly once.
document.body.innerHTML = '<button id="music-export-diagnostics"><span>Export again</span></button>' +
  '<span id="music-diagnostics-status" role="status" aria-live="polite"></span>';
window.eval(script);
document.querySelector('button span').click();
assert.equal(downloads, 1);
assert.equal(exported.events.at(-1).event, 'report-export');
assert.equal(exported.version, 1);
assert.match(document.getElementById('music-diagnostics-status').textContent, /已下载/);
assert.equal(document.querySelectorAll('a[download]').length, 0);
release();
assert.equal(revoke, 'blob:test-report');
assert.equal(requests, 0);
dom.window.close();
console.log('RESULT: MUSIC_DIAGNOSTICS_PASS (native timeline, local-only, bounded ring, lifecycle, PJAX export)');
