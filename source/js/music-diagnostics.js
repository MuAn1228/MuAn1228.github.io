// Playback reports stay in this tab until the listener explicitly downloads one.
(function () {
  'use strict';
  if (window.__createBlogMusicDiagnostics) return;

  var active = null;
  var LIMIT = 160;
  var VERSION = 1;

  function status(message) {
    var node = document.getElementById('music-diagnostics-status');
    if (node) node.textContent = message;
  }

  // Delegation survives PJAX replacing the music page, without duplicate listeners.
  document.addEventListener('click', function (event) {
    var target = event.target;
    var button = target && target.closest && target.closest('#music-export-diagnostics');
    if (!button) return;
    event.preventDefault();
    if (!active) {
      status('播放器正在加载，请稍后再导出。');
      return;
    }
    try {
      active.download();
      status('诊断报告已下载，仅保存在你的设备上。');
    } catch (error) {
      status('下载失败，请稍后再试。');
    }
  });

  window.__createBlogMusicDiagnostics = function (audio, getState) {
    var started = Date.now();
    var events = [];
    var sequence = 0;
    var lastProgress = 0;
    var proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    var descriptors = {};
    ['currentTime', 'duration', 'buffered'].forEach(function (key) {
      descriptors[key] = proto && Object.getOwnPropertyDescriptor(proto, key);
    });

    function nativeValue(key) {
      var descriptor = descriptors[key];
      try { return descriptor && descriptor.get ? descriptor.get.call(audio) : audio[key]; }
      catch (error) { return null; }
    }
    function number(value) {
      return typeof value === 'number' && isFinite(value) ? Math.round(value * 1000) / 1000 : null;
    }
    function current() {
      var logical = null;
      try { logical = getState && getState(); } catch (error) {}
      var ranges = nativeValue('buffered');
      var buffered = [];
      try {
        for (var i = 0; ranges && i < ranges.length && i < 8; i++) {
          buffered.push([number(ranges.start(i)), number(ranges.end(i))]);
        }
      } catch (error) {}
      return {
        hidden: document.visibilityState === 'hidden',
        native: {
          time: number(nativeValue('currentTime')),
          duration: number(nativeValue('duration')),
          buffered: buffered,
          paused: audio.paused,
          ended: audio.ended,
          readyState: audio.readyState,
          networkState: audio.networkState,
          error: audio.error ? audio.error.code : null,
          sourceType: /^blob:/.test(audio.currentSrc || audio.src) ? 'continuous' : 'classic'
        },
        track: logical ? {
          owner: logical.owner, index: logical.index, name: logical.name,
          artist: logical.artist, time: number(logical.time), playing: logical.playing
        } : null
      };
    }
    function record(name, details) {
      var entry = current();
      entry.seq = ++sequence;
      entry.elapsed = number((Date.now() - started) / 1000);
      entry.event = name;
      if (details) {
        // Take a copy; later mutations must not rewrite the evidence in a report.
        try { entry.details = JSON.parse(JSON.stringify(details)); } catch (error) {}
      }
      events.push(entry);
      if (events.length > LIMIT) events.shift();
    }
    function snapshot() {
      return JSON.parse(JSON.stringify({
        version: VERSION,
        startedAt: new Date(started).toISOString(),
        exportedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        page: location.pathname,
        mediaSessionSupported: 'mediaSession' in navigator,
        eventCount: sequence,
        retainedEvents: events.length,
        current: current(),
        events: events
      }));
    }
    function download() {
      record('report-export');
      var blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'music-diagnostics-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      link.hidden = true;
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        // Let the browser consume the download URL before releasing it.
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
    }

    ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'ended', 'error',
      'abort', 'emptied', 'loadstart', 'loadedmetadata', 'canplay', 'seeking', 'seeked']
      .forEach(function (name) {
        audio.addEventListener(name, function () { record(name); }, true);
      });
    // Sample progress sparingly so a report retains minutes of playback history.
    audio.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - lastProgress >= 5000) { lastProgress = now; record('progress'); }
    });
    document.addEventListener('visibilitychange', function () { record('visibilitychange'); });
    document.addEventListener('freeze', function () { record('freeze'); });
    document.addEventListener('resume', function () { record('resume'); });
    window.addEventListener('pagehide', function (event) { record('pagehide', { persisted: event.persisted }); });
    window.addEventListener('pageshow', function (event) { record('pageshow', { persisted: event.persisted }); });

    active = { record: record, snapshot: snapshot, download: download };
    record('diagnostics-ready');
    return active;
  };
})();
