// ===== 连续流音乐引擎（MediaSource）=====
// 背景：普通 APlayer 每切一首歌都会重设 src 并重新调用 play()，一加等机型在后台会挂起
// 这类新的播放请求，导致锁屏后曲终不再续播。本模块把整个队列连续写入同一个 MediaSource：
// 会话期间只赋值一次 src、只发起一次 play()，曲目边界只是时间轴上的分界点。
// 桌面与不支持 MSE 的浏览器返回 supported=false，由引擎走 APlayer 经典路径。
// 对外接口：window.__createBlogContinuousStream(audio, hooks)
//   hooks.getUrl(index) -> Promise<string>   按需解析可流式 URL（失败即该曲不可用）
//   hooks.onAdvance(index)                   逻辑曲目变化（跨越边界或跳转）时同步界面
//   hooks.onUnavailable(index, reason) -> bool  单曲不可用；返回 true 继续，false 已停止
//   hooks.onFatal(reason, wasPlaying)        MSE 不可用，回退经典路径
//   hooks.onState()                          刷新状态（时长标定、Media Session 等）
//   hooks.play()                             通过播放器发起播放（保持 UI 一致）
(function () {
  'use strict';
  if (window.__createBlogContinuousStream) return;

  var PREFETCH = 2;                    // 除当前曲目外最多预取几首
  var HISTORY_KEEP = 600;              // 为「上一首」保留的已解码时长（秒）
  var READY_SECONDS = 0.4;             // 起播前需要的最少缓冲
  var MAX_TRACK_BYTES = 32 * 1024 * 1024;

  window.__createBlogContinuousStream = function (audio, hooks) {
    hooks = hooks || {};
    var proto = window.HTMLMediaElement ? window.HTMLMediaElement.prototype : null;
    var dCurrentTime = proto && Object.getOwnPropertyDescriptor(proto, 'currentTime');
    var dDuration = proto && Object.getOwnPropertyDescriptor(proto, 'duration');
    var dBuffered = proto && Object.getOwnPropertyDescriptor(proto, 'buffered');
    var MediaSourceClass = window.MediaSource;
    var supported = !!(
      MediaSourceClass && MediaSourceClass.isTypeSupported && MediaSourceClass.isTypeSupported('audio/mpeg') &&
      window.URL && window.URL.createObjectURL && window.URL.revokeObjectURL &&
      dCurrentTime && dCurrentTime.get && dCurrentTime.set &&
      dDuration && dDuration.get && dBuffered && dBuffered.get
    );

    var prevPlay = audio.play;
    var pendingPlay = null;
    var playWrapped = false;
    var active = false;
    var pending = false;
    var virtualInstalled = false;
    var session = null;
    var lastNotified = -1;
    var ops = [];
    var runningOp = null;

    if (!supported) {
      return {
        supported: false,
        isActive: function () { return false; },
        isPending: function () { return false; },
        beginPending: function () {},
        start: function () { return false; },
        jump: function () { return false; },
        stop: function () {}
      };
    }

    /* ---------- 原生媒体访问（绕开虚拟属性） ---------- */
    function nativeTime() { return dCurrentTime.get.call(audio); }
    function setNativeTime(value) { try { dCurrentTime.set.call(audio, value); } catch (e) {} }
    function nativeBufferedEnd() {
      var ranges = dBuffered.get.call(audio);
      return ranges.length ? ranges.end(ranges.length - 1) : 0;
    }
    function alive(s) { return active && session === s; }
    function report() { if (hooks.onState) hooks.onState(); }

    /* ---------- 虚拟时间轴：对外只暴露当前曲目内的时间 ---------- */
    function segmentAt(time) {
      var s = session;
      if (!s) return null;
      var segments = s.segments;
      for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (segment.state === 'failed') continue;
        var end = typeof segment.end === 'number' ? segment.end : Infinity;
        if (time < end) return segment;
      }
      return segments.length ? segments[segments.length - 1] : null;
    }
    function virtualTime() {
      var segment = segmentAt(nativeTime());
      if (!segment) return 0;
      var value = nativeTime() - segment.start;
      return value > 0 ? value : 0;
    }
    function segmentLimit(segment) {
      return typeof segment.duration === 'number' && isFinite(segment.duration) ? segment.duration : Infinity;
    }
    function virtualDuration() {
      var segment = segmentAt(nativeTime());
      if (!segment) return NaN;
      var limit = segmentLimit(segment);
      return isFinite(limit) ? limit : NaN;
    }
    function virtualBuffered() {
      var segment = segmentAt(nativeTime());
      var end = nativeBufferedEnd();
      if (!segment) {
        return { length: end > 0 ? 1 : 0, start: function () { return 0; }, end: function () { return end; } };
      }
      var local = Math.min(end - segment.start, segmentLimit(segment));
      if (local < 0) local = 0;
      return { length: 1, start: function () { return 0; }, end: function () { return local; } };
    }
    function virtualSeek(value) {
      var segment = segmentAt(nativeTime());
      if (!segment) { setNativeTime(Math.max(0, value || 0)); return; }
      var offset = Math.max(0, Math.min(value || 0, segmentLimit(segment)));
      setNativeTime(segment.start + offset);
    }
    function installVirtual() {
      if (virtualInstalled) return true;
      try {
        Object.defineProperty(audio, 'currentTime', { configurable: true, get: virtualTime, set: virtualSeek });
        Object.defineProperty(audio, 'duration', { configurable: true, get: virtualDuration });
        Object.defineProperty(audio, 'buffered', { configurable: true, get: virtualBuffered });
        virtualInstalled = true;
      } catch (e) { return false; }
      return true;
    }
    function uninstallVirtual() {
      if (!virtualInstalled) return;
      virtualInstalled = false;
      try { delete audio.currentTime; } catch (e) {}
      try { delete audio.duration; } catch (e) {}
      try { delete audio.buffered; } catch (e) {}
    }

    /* ---------- play() 包装：流已在播放时不再发起新的播放请求 ---------- */
    function wrapPlay() {
      if (playWrapped) return;
      playWrapped = true;
      audio.play = function () {
        if (active && session && !audio.paused) {
          audio.autoplay = true;      // 记录播放意图，但不产生新的 play 请求
          return Promise.resolve();
        }
        // 同一个待决请求被重复发起时复用结果，整个会话保持「只有一次播放请求」。
        if (active && session && pendingPlay) return pendingPlay;
        var result = prevPlay.call(audio);
        if (active && session && result && result.then) {
          pendingPlay = result;
          result.then(function () { pendingPlay = null; }, function () { pendingPlay = null; });
        }
        return result;
      };
    }
    function unwrapPlay() {
      if (!playWrapped) return;
      playWrapped = false;
      audio.play = prevPlay;
    }

    /* ---------- SourceBuffer 串行操作队列 ---------- */
    function pushOp(op) { ops.push(op); pumpOps(); }
    function pumpOps() {
      var s = session;
      if (!s || !s.buffer || runningOp || s.buffer.updating) return;
      var op = ops.shift();
      if (!op) return;
      if (op.kind === 'calibrate') { calibrate(s, op.segment, op.failure); pumpOps(); return; }
      runningOp = op;
      try {
        if (op.kind === 'append') s.buffer.appendBuffer(op.bytes);
        else s.buffer.remove(op.from, op.to);
      } catch (error) {
        runningOp = null;
        opFailed(op, error);
        pumpOps();
      }
    }
    function onUpdateEnd() {
      var op = runningOp;
      runningOp = null;
      var s = session;
      if (!op || !s) { pumpOps(); return; }
      if (op.kind === 'append') {
        op.segment.appended = true;
        if (op.last) { calibrate(s, op.segment, op.failure); }
        else { maybeStart(s); }
      }
      pumpOps();
    }
    function opFailed(op, error) {
      var s = session;
      if (!s) return;
      if (op.kind === 'append' && error && error.name === 'QuotaExceededError' && !op.retried) {
        op.retried = true;
        var segment = segmentAt(nativeTime());
        var target = segment ? Math.max(0, segment.start - 1) : 0;
        if (target > 0) {
          ops.unshift(op);
          ops.unshift({ kind: 'remove', from: 0, to: target });
          return;
        }
      }
      if (op.kind === 'append') fatal('append-failed');
    }

    /* ---------- 曲目边界标定与预取 ---------- */
    function calibrate(s, segment, failure) {
      if (!alive(s)) return;
      var end = nativeBufferedEnd();
      segment.end = end;
      segment.duration = end - segment.start;
      if (!(segment.duration > 0.05)) {
        segment.duration = 0;
        segment.end = segment.start;      // 零长段不占时间轴，等同于跳过
        segment.state = 'failed';
      } else {
        segment.state = 'ready';
      }
      if (failure && s.segments[0] === segment && !s.started) {
        s.offset = 0;
        setNativeTime(0);                 // 首曲不可用：撤销早先写入的默认起播位置
      }
      if (failure) {
        var keep = hooks.onUnavailable ? hooks.onUnavailable(segment.qi, failure) !== false : true;
        if (!alive(s)) return;
        if (!keep) return;
      }
      maybeFetch(s);
      maybeStart(s);                      // 时长标定后才有依据把定位夹进曲目内
      if (segmentAt(nativeTime()) === segment) {
        dispatchDurationChange();
        report();
      }
    }
    function currentIndex(s) {
      var segment = segmentAt(nativeTime());
      var index = segment ? s.segments.indexOf(segment) : -1;
      return index < 0 ? 0 : index;
    }
    function maybeFetch(s) {
      if (!alive(s) || s.fetching) return;
      var segments = s.segments;
      var last = segments.length ? segments[segments.length - 1] : null;
      // 上一首尚未标定边界时先等待（追加顺序 = 时间轴顺序）
      if (last && typeof last.end !== 'number') return;
      if (segments.length - currentIndex(s) > PREFETCH + 1) return;
      fetchNext(s);
    }
    function fetchNext(s) {
      var qi = s.nextQi;
      var last = s.segments.length ? s.segments[s.segments.length - 1] : null;
      var segment = {
        qi: qi,
        start: last ? last.end : 0,
        end: null,
        duration: null,
        state: 'fetching',
        appended: false
      };
      s.segments.push(segment);
      s.nextQi = (qi + 1) % s.count;
      s.fetching = true;
      resolveUrl(qi).then(function (url) {
        if (!alive(s)) return;
        return fetchTrack(s, segment, url);
      }).catch(function (error) {
        if (!alive(s)) return;
        s.fetching = false;
        pushOp({ kind: 'calibrate', segment: segment, failure: (error && error.message) || 'fetch-failed' });
      });
    }
    function resolveUrl(qi) {
      if (!hooks.getUrl) return Promise.reject(new Error('no-resolver'));
      return Promise.resolve(hooks.getUrl(qi)).then(function (url) {
        if (!url) throw new Error('no-url');
        return url;
      });
    }
    function looksLikeErrorPage(bytes) {
      for (var i = 0; i < bytes.length && i < 64; i++) {
        var code = bytes[i];
        if (code === 32 || code === 9 || code === 10 || code === 13) continue;
        return code === 60 || code === 123 || code === 91;   // < { [
      }
      return false;
    }
    function fetchTrack(s, segment, url) {
      return fetch(url).then(function (response) {
        if (!alive(s)) return;
        if (!response.ok) throw new Error('http-' + response.status);
        var type = (response.headers.get('content-type') || '').toLowerCase();
        if (type && type.indexOf('audio') === -1 && type.indexOf('octet-stream') === -1 && type.indexOf('mpeg') === -1) {
          throw new Error('content-type');
        }
        var reader = response.body && response.body.getReader ? response.body.getReader() : null;
        if (!reader) throw new Error('no-stream');
        var held = null;
        var received = 0;
        var sniffed = false;
        function finish() {
          if (!alive(s)) return;
          s.fetching = false;
          if (held) pushOp({ kind: 'append', bytes: held, segment: segment, last: true });
          else pushOp({ kind: 'calibrate', segment: segment, failure: 'empty' });
        }
        function readMore() {
          return reader.read().then(function (result) {
            if (!alive(s)) { try { reader.cancel(); } catch (e) {} return; }
            if (result.done) { finish(); return; }
            var bytes = result.value;
            received += bytes.length;
            if (received > MAX_TRACK_BYTES) throw new Error('too-large');
            if (!sniffed) {
              sniffed = true;
              if (looksLikeErrorPage(bytes)) throw new Error('not-audio');
            }
            if (held) pushOp({ kind: 'append', bytes: held, segment: segment, last: false });
            held = bytes;
            return readMore();
          });
        }
        return readMore();
      });
    }

    /* ---------- 起播与历史裁剪 ---------- */
    function maybeStart(s) {
      if (!alive(s) || s.started) return;
      var first = s.segments[0];
      var target = s.offset;
      if (first && typeof first.duration === 'number' && isFinite(first.duration)) {
        if (first.duration <= 0.05) target = 0;
        else if (target > first.duration - 0.2) target = Math.max(0, first.duration - 0.2);
        s.offset = target;
      }
      var available = nativeBufferedEnd();
      if (available < Math.max(READY_SECONDS, target + 0.05)) return;
      s.started = true;
      if (target > 0) setNativeTime(target);
      if (s.autoplay && hooks.play) hooks.play();
      else report();
    }
    function trim(s) {
      if (!alive(s) || !s.buffer || s.buffer.updating) return;
      var segment = segmentAt(nativeTime());
      if (!segment) return;
      var target = segment.start - HISTORY_KEEP;
      if (target <= s.trimmedTo + 1) return;
      s.trimmedTo = target;
      pushOp({ kind: 'remove', from: 0, to: target });
    }
    function dispatchDurationChange() {
      if (!alive(session)) return;
      try { audio.dispatchEvent(new Event('durationchange')); } catch (e) {}
    }
    function onTimelineChanged() {
      var s = session;
      if (!alive(s)) return;
      var segment = segmentAt(nativeTime());
      if (!segment || segment.qi === lastNotified) return;
      lastNotified = segment.qi;
      maybeFetch(s);
      trim(s);
      if (hooks.onAdvance) hooks.onAdvance(segment.qi);
    }

    /* ---------- 会话生命周期 ---------- */
    function fatal(reason) {
      var wasPlaying = active && !audio.paused;
      teardown();
      if (hooks.onFatal) hooks.onFatal(reason, wasPlaying);
    }
    function onSourceOpen(s) {
      if (!alive(s)) return;
      var buffer;
      try { buffer = s.source.addSourceBuffer('audio/mpeg'); } catch (e) { fatal('add-source-buffer'); return; }
      s.buffer = buffer;
      try { buffer.mode = 'sequence'; } catch (e) {}
      buffer.addEventListener('updateend', onUpdateEnd);
      buffer.addEventListener('error', function () { fatal('source-buffer-error'); });
      pumpOps();
      maybeStart(s);
    }
    function teardown() {
      var s = session;
      active = false;
      session = null;
      pending = false;
      pendingPlay = null;
      ops = [];
      runningOp = null;
      lastNotified = -1;
      uninstallVirtual();
      unwrapPlay();
      if (s) {
        try { if (s.buffer && s.buffer.updating) s.buffer.abort(); } catch (e) {}
        try { if (s.objectUrl) window.URL.revokeObjectURL(s.objectUrl); } catch (e) {}
      }
    }
    function start(index, options) {
      options = options || {};
      if (active) teardown();
      var count = Math.max(1, options.count || 1);
      var qi = ((index % count) + count) % count;
      var s = {
        count: count,
        nextQi: qi,
        segments: [],
        offset: options.offset > 0 ? options.offset : 0,
        autoplay: options.autoplay !== false,
        started: false,
        fetching: false,
        trimmedTo: 0,
        source: null,
        buffer: null,
        objectUrl: ''
      };
      session = s;
      pending = false;
      lastNotified = qi;
      active = true;
      if (!installVirtual()) { teardown(); return false; }
      wrapPlay();
      s.source = new MediaSourceClass();
      s.source.addEventListener('sourceopen', function () { onSourceOpen(s); });
      try { s.objectUrl = window.URL.createObjectURL(s.source); } catch (e) { teardown(); return false; }
      try { audio.src = s.objectUrl; } catch (e) { teardown(); return false; }
      // HAVE_NOTHING 阶段写入定位＝默认起播位置：恢复进度时数据一到位就从该处播放
      if (s.offset > 0) setNativeTime(s.offset);
      maybeFetch(s);
      return true;
    }
    function restart(index, offset, autoplay) {
      var count = session ? session.count : 1;
      return start(index, { count: count, offset: offset || 0, autoplay: autoplay !== false });
    }
    function jump(index, offset, autoplay) {
      var s = session;
      if (!active || !s) return false;
      var wanted = offset > 0 ? offset : 0;
      var segment = null;
      for (var i = 0; i < s.segments.length; i++) {
        if (s.segments[i].qi === index && s.segments[i].state !== 'failed') { segment = s.segments[i]; break; }
      }
      if (!segment || typeof segment.end !== 'number' || segment.start < s.trimmedTo) {
        var count = s.count;
        restart(index, wanted, autoplay);
        return count > 0;
      }
      lastNotified = index;
      var position = segment.start + Math.max(0, Math.min(wanted, segmentLimit(segment)));
      s.offset = position;                 // 未起播的会话也要跳到这个位置
      setNativeTime(position);
      if (autoplay !== false && audio.paused && hooks.play) hooks.play();
      maybeStart(s);
      if (hooks.onAdvance) hooks.onAdvance(index);
      report();
      return true;
    }
    function stop() { if (active || session) teardown(); }

    audio.addEventListener('timeupdate', onTimelineChanged);
    audio.addEventListener('seeked', onTimelineChanged);

    return {
      supported: true,
      isActive: function () { return active; },
      isPending: function () { return pending; },
      beginPending: function () { pending = true; },
      start: start,
      jump: jump,
      stop: stop
    };
  };
})();