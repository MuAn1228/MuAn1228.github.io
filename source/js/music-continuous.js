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

  var PREFETCH = 2;                    // 串行流式取流的提前量（最近的一首用它，起播最快）
  var BURST_AHEAD = 6;                 // 突发预取目标：当前曲目之后保持排队的曲目数（锁屏后的播放余量）
  var BURST_TIMEOUT = 45000;           // 单首突发取流的最长等待（毫秒），超时按取流失败处理
  var BURST_COOLDOWN = 30000;          // 一次突发失败后的冷却时间，避免网络异常时反复重试
  var STALL_MS = 20000;                // 串行取流多久没有新数据就认为被系统挂起
  var MAX_ATTEMPTS = 3;                // 同一曲目最多重新取流（含被挂起后重启）的次数
  var HISTORY_KEEP = 600;              // 为「上一首」保留的已解码时长（秒）
  var READY_SECONDS = 0.4;             // 起播前需要的最少缓冲
  var MAX_TRACK_BYTES = 32 * 1024 * 1024;
  var KEEPALIVE_MS = 4000;             // 播放期间的深缓冲巡检间隔（后台被节流也足够）

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
        stop: function () {},
        prefetchBurst: function () { return 0; }
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
        // 尚未追加落位的突发段没有起点，不参与时间轴
        if (segment.state === 'failed' || segment.start == null) continue;
        var end = typeof segment.end === 'number' ? segment.end : Infinity;
        if (time < end) return segment;
      }
      for (var j = segments.length - 1; j >= 0; j--) {
        if (segments[j].state !== 'failed' && segments[j].start != null) return segments[j];
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
          if (target > s.trimmedTo) s.trimmedTo = target;   // 已回收的历史不能再当作可跳转区间
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
      var wanted = s.pendingJump;
      if (wanted && wanted.qi === segment.qi) {
        // 等这一段落位后再定位：整个等待过程只有一次播放请求，后台也不会被系统挂起
        s.pendingJump = null;
        if (segment.state !== 'failed') {
          lastNotified = segment.qi;
          setNativeTime(segment.start + Math.max(0, Math.min(wanted.offset || 0, segmentLimit(segment))));
        }
      }
      drainBurst(s);
      fillBurst(s, false);
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
      if (!alive(s) || s.fetching || s.burst) return;
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
        start: last && typeof last.end === 'number' ? last.end : 0,
        end: null,
        duration: null,
        state: 'fetching',
        appended: false,
        pushed: 0,
        fetched: null,
        attempts: 1
      };
      s.segments.push(segment);
      s.nextQi = (qi + 1) % s.count;
      s.fetching = true;
      resolveUrl(qi).then(function (url) {
        if (!alive(s)) return;
        return fetchTrack(s, segment, url, 0);
      }).catch(function (error) {
        if (!alive(s) || segment.cancelled) return;    // 已被突发预取接管，失败交给它处理
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
    function pushAppend(segment, bytes, last) {
      segment.pushed += bytes.length;
      pushOp({ kind: 'append', bytes: bytes, segment: segment, last: last });
    }
    // 流式取流：边下边追加，只给「马上要播的那一首」用，起播最快。
    function fetchTrack(s, segment, url, skip) {
      var skipLeft = skip > 0 ? skip : 0;
      var controller = null;
      var init = null;
      try {
        if (typeof AbortController === 'function') {
          controller = new AbortController();
          init = { signal: controller.signal };
        }
      } catch (e) {}
      s.inflight = {
        segment: segment,
        progressAt: Date.now(),
        cancel: function () {
          segment.cancelled = true;
          if (s.inflight && s.inflight.segment === segment) s.inflight = null;
          try { if (controller) controller.abort(); } catch (e) {}
        }
      };
      return fetch(url, init).then(function (response) {
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
          if (!alive(s) || segment.cancelled) return;
          if (s.inflight && s.inflight.segment === segment) s.inflight = null;
          s.fetching = false;
          if (held) pushAppend(segment, held, true);
          else pushOp({ kind: 'calibrate', segment: segment, failure: 'empty' });
        }
        function readMore() {
          return reader.read().then(function (result) {
            if (!alive(s) || segment.cancelled) { try { reader.cancel(); } catch (e) {} return; }
            if (s.inflight && s.inflight.segment === segment) s.inflight.progressAt = Date.now();
            if (result.done) { finish(); return; }
            var bytes = result.value;
            received += bytes.length;
            if (received > MAX_TRACK_BYTES) throw new Error('too-large');
            if (!sniffed) {
              sniffed = true;
              if (skipLeft === 0 && looksLikeErrorPage(bytes)) throw new Error('not-audio');
            }
            if (skipLeft > 0) {
              // 重新取流时跳过已经追加过的前缀，时间轴里不会出现重复数据
              if (bytes.length <= skipLeft) { skipLeft -= bytes.length; return readMore(); }
              bytes = bytes.slice(skipLeft);
              skipLeft = 0;
            }
            if (held) pushAppend(segment, held, false);
            held = bytes;
            return readMore();
          });
        }
        return readMore();
      });
    }

    /* ---------- 突发预取：并行取整首、按时间轴顺序整段追加 ---------- */
    // 手机在后台/锁屏时会挂起新发起的取流，串行预取只能保住一两首。这里把后续若干首
    // 并行取到内存，等前一段追加落位后按顺序整段写入，让锁屏后仍有足够长的可播缓冲。
    function pendingAppendIndex(s) {
      for (var i = 0; i < s.segments.length; i++) {
        var segment = s.segments[i];
        if (!segment.appended && segment.state !== 'failed') return i;
      }
      return s.segments.length;
    }
    function drainBurst(s) {
      if (!alive(s)) return;
      var segment = s.segments[pendingAppendIndex(s)];
      if (!segment || !segment.fetched) return;
      var bytes = segment.fetched;
      segment.fetched = null;
      var skip = segment.pushed || 0;
      if (skip > 0) {
        if (skip >= bytes.byteLength) { pushOp({ kind: 'calibrate', segment: segment }); return; }
        bytes = bytes.slice(skip);
      }
      if (segment.start == null) segment.start = nativeBufferedEnd();  // 前一段已落位，缓冲末尾就是本段起点
      pushAppend(segment, bytes, true);
    }
    function finishBurst(s) {
      var burst = s.burst;
      if (!burst || burst.aborted || burst.outstanding > 0) return;
      s.burst = null;
      drainBurst(s);
      maybeFetch(s);
    }
    function abortBurst(s, failedSegment) {
      var burst = s.burst;
      if (!burst || burst.aborted) return;
      burst.aborted = true;
      s.burst = null;
      var resumeAt = null;
      for (var i = s.segments.length - 1; i >= 0; i--) {
        var segment = s.segments[i];
        // 已经追加过部分数据的段不能撤销（数据已占用时间轴）：按当前缓冲末尾收尾，避免时间轴卡死
        if (segment.appended && typeof segment.end !== 'number' && segment.state !== 'failed') {
          pushOp({ kind: 'calibrate', segment: segment });
          continue;
        }
        if (segment.appended || segment === (s.inflight && s.inflight.segment)) continue;
        segment.dropped = true;
        resumeAt = segment;
        s.segments.splice(i, 1);
      }
      s.burstCooldownUntil = Date.now() + BURST_COOLDOWN;
      if (resumeAt) s.nextQi = resumeAt.qi;     // 未追加的段全部撤销，交回串行取流按顺序重取
      s.fetching = !!s.inflight;
      maybeFetch(s);
    }
    function loadBurstSegment(s, segment) {
      var burst = s.burst;
      resolveUrl(segment.qi).then(function (url) {
        if (!alive(s) || !burst || burst.aborted || segment.dropped) return null;
        return fetchBuffer(s, segment, url);
      }).then(function (bytes) {
        if (!alive(s) || !burst || burst.aborted || segment.dropped) return;
        burst.outstanding--;
        segment.fetched = bytes;
        drainBurst(s);
        finishBurst(s);
      }).catch(function () {
        if (!alive(s) || !burst || burst.aborted || segment.dropped) return;
        burst.outstanding--;
        abortBurst(s, segment);
      });
    }
    function fetchBuffer(s, segment, url) {
      var controller = null;
      var init = null;
      try {
        if (typeof AbortController === 'function') {
          controller = new AbortController();
          init = { signal: controller.signal };
        }
      } catch (e) {}
      var timer = null;
      var timeout = new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
          segment.cancelled = true;
          try { if (controller) controller.abort(); } catch (e) {}
          reject(new Error('timeout'));
        }, BURST_TIMEOUT);
      });
      var reading = fetch(url, init).then(function (response) {
        if (!alive(s)) throw new Error('gone');
        if (!response.ok) throw new Error('http-' + response.status);
        var type = (response.headers.get('content-type') || '').toLowerCase();
        if (type && type.indexOf('audio') === -1 && type.indexOf('octet-stream') === -1 && type.indexOf('mpeg') === -1) {
          throw new Error('content-type');
        }
        if (response.arrayBuffer) return response.arrayBuffer();
        throw new Error('no-stream');
      }).then(function (bytes) {
        if (!bytes || !bytes.byteLength) throw new Error('empty');
        if (bytes.byteLength > MAX_TRACK_BYTES) throw new Error('too-large');
        if (looksLikeErrorPage(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)))) throw new Error('not-audio');
        return bytes;
      });
      return Promise.race([reading, timeout]).then(function (bytes) {
        clearTimeout(timer);
        return bytes;
      }, function (error) {
        clearTimeout(timer);
        try { if (controller) controller.abort(); } catch (e) {}
        throw error;
      });
    }
    // 串行取流被系统挂起（长时间没有新数据）时，改成整段重取：跳过已追加的前缀，时间轴不重复。
    function promoteInflight(s) {
      var inflight = s.inflight;
      if (!inflight || !alive(s)) return false;
      var segment = inflight.segment;
      if ((segment.attempts || 0) >= MAX_ATTEMPTS) return false;
      segment.attempts = (segment.attempts || 0) + 1;
      inflight.cancel();
      s.fetching = false;
      if (!s.burst) s.burst = { outstanding: 0, aborted: false };
      s.burst.outstanding++;
      loadBurstSegment(s, segment);
      return true;
    }
    // force=true：页面即将转入后台等关键时刻，不等空闲、允许把正在流式取流的那首升级成整段取流
    function fillBurst(s, force) {
      if (!alive(s)) return 0;
      if (!force && Date.now() < s.burstCooldownUntil) return 0;
      var promoted = force && s.inflight ? promoteInflight(s) : false;
      if (!promoted && pendingAppendIndex(s) !== s.segments.length) return 0;   // 还有段没追加落位
      var room = BURST_AHEAD - (s.segments.length - currentIndex(s) - 1);
      if (room <= 0) return 0;
      if (!s.burst) s.burst = { outstanding: 0, aborted: false };
      var queued = 0;
      while (queued < room) {
        var qi = s.nextQi;
        var segment = {
          qi: qi,
          start: null,
          end: null,
          duration: null,
          state: 'fetching',
          appended: false,
          pushed: 0,
          fetched: null,
          attempts: 1
        };
        s.segments.push(segment);
        s.nextQi = (qi + 1) % s.count;
        s.burst.outstanding++;
        queued++;
        loadBurstSegment(s, segment);
      }
      return queued;
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
      keepAlive(s);
      var segment = segmentAt(nativeTime());
      if (!segment || segment.qi === lastNotified) return;
      if (s.pendingJump) return;          // 等目标曲目落位期间不来回切换界面
      lastNotified = segment.qi;
      trim(s);
      if (hooks.onAdvance) hooks.onAdvance(segment.qi);
    }
    // 播放期间持续保持深缓冲：串行取流被挂起就改成整段重取，离线/低余量时补足突发队列。
    function keepAlive(s) {
      if (s.inflight && Date.now() - s.inflight.progressAt > STALL_MS) promoteInflight(s);
      fillBurst(s, false);
      maybeFetch(s);
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
        try { if (s.timer) clearInterval(s.timer); } catch (e) {}
        try { if (s.inflight) s.inflight.cancel(); } catch (e) {}
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
        objectUrl: '',
        burst: null,
        burstCooldownUntil: 0,
        inflight: null,
        pendingJump: null,
        timer: null
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
      // 播放期间（含后台，音频播放本身不会被隐藏限制）定期补齐深缓冲，
      // 让续播既不依赖界面事件、也不依赖用户回到前台。
      s.timer = setInterval(function () { keepAlive(s); }, KEEPALIVE_MS);
      return true;
    }
    function restart(index, offset, autoplay) {
      var count = session ? session.count : 1;
      return start(index, { count: count, offset: offset || 0, autoplay: autoplay !== false });
    }
    function jump(index, offset, autoplay) {
      var s = session;
      if (!active || !s) return false;
      s.pendingJump = null;
      var wanted = offset > 0 ? offset : 0;
      var segment = null;
      for (var i = 0; i < s.segments.length; i++) {
        if (s.segments[i].qi === index && s.segments[i].state !== 'failed') { segment = s.segments[i]; break; }
      }
      // 目标曲目已由突发预取排队、但还没追加落位：先停在已缓冲的末尾，等它落位后再做纯 seek。
      // 整个等待过程不产生新的播放请求，锁屏/后台切换下一首也有效。
      var segmentIndex = segment ? s.segments.indexOf(segment) : -1;
      if (segment && typeof segment.end !== 'number' && segmentIndex > currentIndex(s)) {
        s.pendingJump = { qi: index, offset: wanted };
        lastNotified = index;
        if (autoplay !== false) audio.autoplay = true;
        setNativeTime(Math.max(0, nativeBufferedEnd() - 0.2));
        fillBurst(s, false);
        if (hooks.onAdvance) hooks.onAdvance(index);
        report();
        return true;
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
      stop: stop,
      // 页面即将转入后台时调用：立刻把后续若干首并行取到缓冲，锁屏后不依赖网络继续播
      prefetchBurst: function () { return session ? fillBurst(session, true) : 0; }
    };
  };
})();