// One MediaSource and one initial play(): no src replacement or play call between clips.
(function () {
  'use strict';
  var root = document.getElementById('mcheck');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  var audio = document.getElementById('mcheck-audio');
  var startButton = document.getElementById('mcheck-start');
  var status = document.getElementById('mcheck-status');
  var track = document.getElementById('mcheck-track');
  var reportBox = document.getElementById('mcheck-report');
  var key = 'blog-music-continuous-report-v1';
  var createdAt = Date.now();
  var running = false;
  var attempt = 0;
  var disposed = false;
  var prepared = false;
  var currentSegment = -1;
  var mediaSource;
  var objectUrl;
  var controller = new AbortController();
  var previous = null;
  try {
    var saved = JSON.parse(sessionStorage.getItem(key));
    if (saved && saved.version === 3 && saved.startedAt && Array.isArray(saved.events)) previous = saved;
  } catch (e) {}
  var report = {
    version: 3, strategy: 'continuous-mse', userAgent: navigator.userAgent,
    supported: !!(window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')),
    prepared: false, startedAt: null, duration: 0, segmentEnds: [],
    completedTracks: 0, srcAssignments: 0, playRequests: 0, interrupted: false,
    backgroundCompleted: false, backgroundEnteredAt: null, foregroundDuringPlayback: false, events: []
  };

  function render() {
    if (disposed) return;
    // Compact JSON also keeps clipboard reports below common paste limits.
    reportBox.value = JSON.stringify(!report.startedAt && previous ? previous : report);
    try { sessionStorage.setItem(key, reportBox.value); } catch (e) {}
  }
  function record(name, detail) {
    if (disposed) return;
    var event = { event: name, t: Math.round((Date.now() - (report.startedAt || createdAt)) / 100) / 10,
      hidden: document.hidden, paused: audio.paused, time: Math.round((audio.currentTime || 0) * 100) / 100 };
    if (detail) Object.keys(detail).forEach(function (key) { event[key] = detail[key]; });
    report.events.push(event);
    if (report.events.length > 30) report.events.shift();
    render();
  }
  function message(text) { if (!disposed) status.textContent = text; }
  function session() {
    if (!navigator.mediaSession) return;
    try {
      if (window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({
        title: '连续音频后台检测', artist: 'Mu An\'s Blog'
      });
      navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
      navigator.mediaSession.setActionHandler('play', function () {
        if (running) requestPlay();
      });
      navigator.mediaSession.setActionHandler('pause', function () { if (running) audio.pause(); });
    } catch (e) {}
  }
  function clearSession() {
    if (!navigator.mediaSession) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
    } catch (e) {}
  }
  function failure(error) {
    if (disposed) return;
    previous = null;
    record('failure', { reason: error.name || 'Error', detail: error.message || '' });
    running = false;
    prepared = false;
    startButton.disabled = true;
    attempt++;
    audio.pause();
    clearSession();
    message('检测无法继续。请复制报告发给我。');
  }
  function requestPlay() {
    var thisAttempt = ++attempt;
    report.playRequests++;
    record('play-request');
    try {
      var result = audio.play();
      record('play-call-return');
      if (result && result.then) result.then(function () {
        if (thisAttempt === attempt && running && !disposed) record('play-resolved');
      }, function (error) { if (thisAttempt === attempt && running) failure(error); });
    } catch (error) { failure(error); }
  }
  function start() {
    if (!prepared || running || disposed) return;
    audio.currentTime = 0;
    previous = null;
    report.startedAt = Date.now();
    report.events = [];
    report.completedTracks = 0;
    report.playRequests = 0;
    report.interrupted = false;
    report.backgroundCompleted = false;
    report.backgroundEnteredAt = null;
    report.foregroundDuringPlayback = false;
    currentSegment = -1;
    running = true;
    record('test-start');
    message('检测中：现在回到桌面或锁屏，约 40 秒后返回。');
    session();
    requestPlay();
  }
  function stop(reason) {
    if (running) record(reason || 'user-stop');
    running = false;
    attempt++;
    audio.pause();
    clearSession();
    message('检测已停止，可以复制报告。');
  }
  startButton.addEventListener('click', start);
  document.getElementById('mcheck-stop').addEventListener('click', function () { stop('user-stop'); });
  document.getElementById('mcheck-copy').addEventListener('click', function () {
    var value = reportBox.value;
    function select() { reportBox.focus(); reportBox.select(); message('请长按报告文字，全选并复制。'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { message('报告已复制，可以粘贴到聊天里。'); }, select);
      } else select();
    } catch (e) { select(); }
  });
  audio.addEventListener('timeupdate', function () {
    if (!running) return;
    var segment = 0;
    while (segment < 2 && audio.currentTime >= report.segmentEnds[segment]) segment++;
    if (segment !== currentSegment) {
      currentSegment = segment;
      track.textContent = '第 ' + (segment + 1) + ' / 3 段';
      record('segment-start', { segment: segment + 1 });
    }
  });
  ['play', 'playing', 'pause', 'waiting', 'stalled'].forEach(function (name) {
    audio.addEventListener(name, function () {
      if (!running) return;
      if (name === 'pause' && !audio.ended) report.interrupted = true;
      record(name);
      if (name === 'play' || name === 'pause') session();
    });
  });
  audio.addEventListener('ended', function () {
    if (!running) return;
    report.completedTracks = 3;
    var elapsed = (Date.now() - report.startedAt) / 1000;
    report.backgroundCompleted = document.hidden && report.backgroundEnteredAt !== null &&
      report.backgroundEnteredAt < report.segmentEnds[0] && !report.foregroundDuringPlayback &&
      !report.interrupted && report.playRequests === 1 &&
      elapsed >= report.duration - 3 && elapsed <= report.duration + 3;
    record('ended');
    running = false;
    clearSession();
    message(report.backgroundCompleted
      ? '三段已在后台连续播完。请复制报告发给我。'
      : '播放已结束。请复制报告发给我，核对后台播放情况。');
    track.textContent = '3 / 3 段已播放';
  });
  audio.addEventListener('error', function () {
    if (!disposed) failure({ name: 'MediaError' + (audio.error ? audio.error.code : 0) });
  });
  audio.addEventListener('seeking', function () {
    if (running && audio.currentTime > 0.1) {
      report.interrupted = true;
      record('seeking');
    }
  });
  ['visibilitychange', 'freeze', 'resume'].forEach(function (name) {
    document.addEventListener(name, function () {
      if (!running) return;
      if (name === 'visibilitychange') {
        if (document.hidden && report.backgroundEnteredAt === null) {
          report.backgroundEnteredAt = (Date.now() - report.startedAt) / 1000;
        } else if (!document.hidden && report.backgroundEnteredAt !== null) {
          report.foregroundDuringPlayback = true;
        }
      }
      record(name);
    });
  });
  window.addEventListener('pagehide', function () {
    stop('pagehide');
    // A page cached for back navigation retains its prepared buffer and can be restarted.
  });
  window.addEventListener('pageshow', function () {
    if (prepared && !running) message('音频已准备好，可以开始检测。');
  });

  async function prepare() {
    if (!report.supported) {
      previous = null;
      record('unsupported');
      message('此浏览器不支持连续音频检测。请复制报告发给我。');
      return;
    }
    try {
      var buffers = await Promise.all(['tone-a.mp3', 'tone-b.mp3'].map(async function (name) {
        var response = await fetch('/media/music-check/' + name, { signal: controller.signal });
        if (!response.ok) throw new Error('AudioHTTP' + response.status);
        return response.arrayBuffer();
      }));
      mediaSource = new MediaSource();
      var opened = new Promise(function (resolve) { mediaSource.addEventListener('sourceopen', resolve, { once: true }); });
      objectUrl = URL.createObjectURL(mediaSource);
      report.srcAssignments++;
      audio.src = objectUrl;
      await opened;
      var sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
      sourceBuffer.mode = 'sequence';
      for (var i = 0; i < 3; i++) {
        await new Promise(function (resolve, reject) {
          function done() { cleanup(); resolve(); }
          function error() { cleanup(); reject(new Error('SourceBufferError')); }
          function cleanup() {
            sourceBuffer.removeEventListener('updateend', done);
            sourceBuffer.removeEventListener('error', error);
          }
          sourceBuffer.addEventListener('updateend', done);
          sourceBuffer.addEventListener('error', error);
          try { sourceBuffer.appendBuffer(buffers[i % 2]); } catch (e) { cleanup(); reject(e); }
        });
        report.segmentEnds.push(sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1));
      }
      mediaSource.endOfStream();
      if (audio.error) throw { name: 'MediaError' + audio.error.code };
      report.duration = report.segmentEnds[2];
      prepared = true;
      report.prepared = true;
      record('prepared');
      startButton.disabled = false;
      message(previous ? '上次报告已保留，可复制，或开始新的检测。' : '音频已准备好，可以开始检测。');
    } catch (error) { failure(error); }
  }
  render();
  prepare();
})();
