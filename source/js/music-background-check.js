// Independent short-audio probe: records only local media/lifecycle events.
(function () {
  'use strict';
  var root = document.getElementById('mcheck');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  var audio = document.getElementById('mcheck-audio');
  var startButton = document.getElementById('mcheck-start');
  var stopButton = document.getElementById('mcheck-stop');
  var copyButton = document.getElementById('mcheck-copy');
  var status = document.getElementById('mcheck-status');
  var track = document.getElementById('mcheck-track');
  var reportBox = document.getElementById('mcheck-report');
  var sources = ['/media/music-check/tone-a.wav', '/media/music-check/tone-b.wav', '/media/music-check/tone-a.wav'];
  var key = 'blog-music-check-report-v1';
  var report = null;
  var running = false;
  var disposed = false;
  var index = 0;
  var attempt = 0;
  var playbackGuard = window.__createBlogAudioGuard && window.__createBlogAudioGuard(audio, function (name, detail) {
    if (!running || disposed) return;
    record(name, detail);
    if (name === 'ready-play-rejected') {
      running = false;
      message('浏览器未能继续播放。请复制报告发给我。');
      clearMediaSession();
    }
  });

  function renderReport() {
    if (disposed || !report) return;
    reportBox.value = JSON.stringify(report, null, 2);
    try { sessionStorage.setItem(key, JSON.stringify(report)); } catch (e) {}
  }

  function record(name, extra) {
    if (!report || disposed) return;
    var item = {
      event: name,
      elapsedSeconds: Math.round((Date.now() - report.startedAt) / 100) / 10,
      track: index + 1,
      hidden: document.hidden,
      paused: audio.paused,
      ended: audio.ended,
      position: Math.round((audio.currentTime || 0) * 10) / 10,
      readyState: audio.readyState
    };
    if (extra) Object.keys(extra).forEach(function (field) { item[field] = extra[field]; });
    report.events.push(item);
    if (report.events.length > 80) report.events.shift();
    renderReport();
  }

  function message(text) { if (!disposed) status.textContent = text; }

  function setMediaSession() {
    if (!running || !navigator.mediaSession) return;
    try {
      if (window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({
        title: '后台连播检查 · 第 ' + (index + 1) + ' 段', artist: 'Mu An\'s Blog'
      });
      navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    } catch (e) {}
    [['play', resume], ['pause', function () { audio.pause(); }]].forEach(function (pair) {
      try { navigator.mediaSession.setActionHandler(pair[0], pair[1]); } catch (e) {}
    });
    ['nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward'].forEach(function (name) {
      try { navigator.mediaSession.setActionHandler(name, null); } catch (e) {}
    });
  }

  function clearMediaSession() {
    if (!navigator.mediaSession) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    } catch (e) {}
    ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward'].forEach(function (name) {
      try { navigator.mediaSession.setActionHandler(name, null); } catch (e) {}
    });
  }

  function resume() {
    if (!running || disposed) return;
    var thisAttempt = ++attempt;
    record('play-request');
    try {
      var result = audio.play();
      record('play-call-return');
      if (result && result.then) result.then(function () {
        if (thisAttempt === attempt && running && !disposed) record('play-resolved');
      }, function (error) {
        if (thisAttempt !== attempt || !running || disposed) return;
        record('play-rejected', { reason: error.name || 'Error' });
        running = false;
        audio.pause();
        message('浏览器未能继续播放。请复制报告发给我。');
        clearMediaSession();
      });
    } catch (error) {
      record('play-rejected', { reason: error.name || 'Error' });
      running = false;
      audio.pause();
      message('浏览器未能开始播放。请复制报告发给我。');
      clearMediaSession();
    }
  }

  function playTrack() {
    audio.src = sources[index];
    record('source-change');
    // Call play synchronously in the user gesture / ended handler before updating UI.
    resume();
    track.textContent = '第 ' + (index + 1) + ' / 3 段 · 每段 12 秒';
    setMediaSession();
  }

  function start() {
    if (running || disposed) return;
    index = 0;
    report = {
      version: 2,
      compatibilityGuard: !!playbackGuard,
      userAgent: navigator.userAgent,
      startedAt: Date.now(),
      audioInDocument: audio.isConnected,
      completedTracks: 0,
      events: []
    };
    running = true;
    record('test-start');
    message('检测中：现在回到桌面或锁屏，约 40 秒后返回。');
    playTrack();
  }

  function stop(reason) {
    if (!running) return;
    record(typeof reason === 'string' ? reason : 'user-stop');
    running = false;
    attempt++;
    audio.pause();
    message('检测已停止。');
    clearMediaSession();
  }

  audio.addEventListener('ended', function () {
    if (!running || disposed) return;
    record('ended');
    report.completedTracks++;
    if (index + 1 < sources.length) {
      index++;
      playTrack();
    } else {
      running = false;
      record('test-complete');
      audio.pause();
      var endings = report.events.filter(function (item) { return item.event === 'ended'; });
      message(endings.every(function (item) { return item.hidden; })
        ? '三段均在后台完成连播。请复制报告发给我。'
        : '检测已结束。请复制报告发给我，检查哪些切歌发生在前台。');
      clearMediaSession();
    }
  });
  ['play', 'playing', 'pause', 'loadedmetadata', 'canplay', 'canplaythrough', 'waiting', 'stalled'].forEach(function (name) {
    audio.addEventListener(name, function () {
      if (!running) return;
      record(name);
      if (name === 'play' || name === 'pause') setMediaSession();
    });
  });
  audio.addEventListener('error', function () {
    if (!running || disposed) return;
    record('media-error', { code: audio.error ? audio.error.code : 0 });
    running = false;
    audio.pause();
    message('测试音频加载失败。请复制报告发给我。');
    clearMediaSession();
  });
  function visibility() { if (running) record('visibilitychange'); }
  function freeze() { if (running) record('freeze'); }
  function resumePage() { if (running) record('resume'); }
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('freeze', freeze);
  document.addEventListener('resume', resumePage);

  startButton.addEventListener('click', start);
  stopButton.addEventListener('click', stop);
  copyButton.addEventListener('click', function () {
    if (!report) { message('请先开始检测。'); return; }
    record('copy-report');
    try {
      var result = navigator.clipboard && navigator.clipboard.writeText(reportBox.value);
      if (result && result.then) result.then(function () {
        message('报告已复制，可以粘贴到聊天里。');
      }, selectReport);
      else selectReport();
    } catch (error) { selectReport(); }
  });
  function selectReport() {
    reportBox.focus();
    reportBox.select();
    message('请长按报告文字，选择全选并复制。');
  }

  function dispose() {
    if (running) stop('navigation-stop');
    audio.pause();
    clearMediaSession();
    disposed = true;
    attempt++;
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('freeze', freeze);
    document.removeEventListener('resume', resumePage);
    document.removeEventListener('pjax:send', dispose);
  }
  document.addEventListener('pjax:send', dispose);
  // pagehide also covers native navigation; keep the document usable after BFCache restore.
  window.addEventListener('pagehide', function () {
    if (running) stop('pagehide');
    audio.pause();
    clearMediaSession();
  });
  try {
    report = JSON.parse(sessionStorage.getItem(key));
    if (report) {
      renderReport();
      message('上次报告已保留，可以复制，或重新开始检测。');
    }
  } catch (e) {}
})();
