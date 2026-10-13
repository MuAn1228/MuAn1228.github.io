// ===== 连续流音乐引擎（MediaSource）=====
// 背景：普通 APlayer 每切一首歌都会重设 src 并重新调用 play()，一加等机型在后台会挂起
// 这类新的播放请求，导致锁屏后曲终不再续播。本模块把整个队列连续写入同一个 MediaSource：
// 会话期间只赋值一次 src、只发起一次 play()，曲目边界只是时间轴上的分界点。
// 不支持 MSE 的浏览器返回 supported=false，由引擎走 APlayer 经典路径。
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

  var BURST_AHEAD = 6;                 // 当前曲目之后最多预取六首，锁屏余量不依赖后台定时器
  var FETCH_CONCURRENCY = 2;           // 首曲完整下载后才并行预取，避免抢占首曲带宽
  var FETCH_TIMEOUT = 45000;
  var MAX_ATTEMPTS = 3;
  var HISTORY_KEEP = 600;              // 为「上一首」保留的已解码时长（秒）
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
    var prevPause = audio.pause;
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
      return segments.length ? segments[0] : null;
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
      var ranges = dBuffered.get.call(audio);
      var end = nativeBufferedEnd();
      if (!segment) {
        return { length: end > 0 ? 1 : 0, start: function () { return 0; }, end: function () { return end; } };
      }
      var localRanges = [];
      for (var i = 0; i < ranges.length; i++) {
        var from = Math.max(ranges.start(i), segment.start);
        var to = Math.min(ranges.end(i), segment.start + segmentLimit(segment));
        if (to > from) localRanges.push([from - segment.start, to - segment.start]);
      }
      return { length: localRanges.length,
        start: function (i) { return localRanges[i][0]; },
        end: function (i) { return localRanges[i][1]; } };
    }
    function virtualSeek(value) {
      var segment = segmentAt(nativeTime());
      if (!segment) { setNativeTime(Math.max(0, value || 0)); return; }
      var offset = Math.max(0, Math.min(value || 0, segmentLimit(segment)));
      // 配额回收可能删掉本曲的前半段。重新排队同一曲，不能 seek 到已删除的洞里。
      if (session && segment.start + offset < session.trimmedTo) {
        jump(segment.qi, offset, !audio.paused);
        return;
      }
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
        var s = session;
        if (active && s) {
          s.autoplay = true;
          // 用户点击时立即把播放意图交给原生 audio，保留手势授权。
          // 第一首完整下载前不 append，浏览器的待决 play 会在整首落位后自然起播。
        }
        if (active && session && !audio.paused) {
          audio.autoplay = true;      // 记录播放意图，但不产生新的 play 请求
          return Promise.resolve();
        }
        // 同一个待决请求被重复发起时复用结果，整个会话保持「只有一次播放请求」。
        if (active && session && pendingPlay) return pendingPlay;
        var result = prevPlay.call(audio);
        if (active && session && result && result.then) {
          pendingPlay = result;
          var settled = function () {
            if (alive(s) && pendingPlay === result) pendingPlay = null;
          };
          result.then(settled, settled);
        }
        return result;
      };
      audio.pause = function () {
        if (session) {
          session.autoplay = false;
          audio.autoplay = false;
          // pause() 取消旧请求；紧接着的用户 play() 必须能够发出新请求。
          pendingPlay = null;
        }
        return prevPause.call(audio);
      };
    }
    function unwrapPlay() {
      if (!playWrapped) return;
      playWrapped = false;
      audio.play = prevPlay;
      audio.pause = prevPause;
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
      } else if (op.kind === 'remove') {
        if (op.tail) {
          // sequence 模式删除数据不会倒退追加位置，必须明确重设下一段起点。
          try { s.buffer.timestampOffset = op.from; } catch (e) { fatal('append-failed'); return; }
          s.trimmingTail = false;
          drain(s);
        } else s.trimmedTo = Math.max(s.trimmedTo, op.to);
      }
      pumpOps();
    }
    function opFailed(op, error) {
      var s = session;
      if (!s) return;
      if (op.kind === 'append' && error && error.name === 'QuotaExceededError' && s.started) {
        // 手机音频缓冲配额可能放不下六首。保留未来曲目的字节，当前音频继续播放。
        // 后续播放进度腾出空间再重试；绝不因为未来的预取满额而回退/重写当前 src。
        s.quotaOp = op;
        prioritizeQuota(s);
        return;
      }
      if (op.kind === 'append') fatal('append-failed');
    }
    function retryQuota(s) {
      if (!s.quotaOp || !s.buffer || s.buffer.updating || runningOp) return;
      if (prioritizeQuota(s)) return;
      var target = Math.max(0, nativeTime() - 5);
      if (target <= s.trimmedTo + 5) return;
      var op = s.quotaOp;
      s.quotaOp = null;
      ops.push({ kind: 'remove', from: 0, to: target });
      ops.push(op);
      pumpOps();
    }
    function prioritizeQuota(s) {
      // 显式切到未缓冲曲目时，未使用的未来歌曲不能占满配额、让用户等待数分钟。
      // 仅撤掉当前完整曲之后的缓存；保留正在播放的曲目和目标下载，不重设 src/play。
      var wanted = s.pendingJump && s.pendingJump.segment;
      var current = segmentAt(nativeTime());
      if (!s.quotaOp || !wanted || !current || typeof current.end !== 'number' ||
          !s.buffer || s.buffer.updating || runningOp || nativeBufferedEnd() <= current.end + 0.05) return false;
      var blocked = s.quotaOp;
      s.quotaOp = null;
      blocked.segment.fetched = blocked.bytes;
      blocked.segment.state = 'downloaded';
      blocked.segment.start = null;
      var retained = [];
      s.segments.forEach(function (item) {
        if (typeof item.end === 'number' && item.end <= current.end) retained.push(item);
        else if (item !== wanted) {
          item.dropped = true;
          if (item.cancel) item.cancel();
          item.fetched = null;
        }
      });
      wanted.start = null;
      s.segments = retained.concat([wanted]);
      s.nextQi = (wanted.qi + 1) % s.count;
      ops = ops.filter(function (op) { return !op.segment || !op.segment.dropped; });
      // 下载可在 remove 期间完成；drain 必须等到 timestampOffset 重设后才标定 start。
      s.trimmingTail = true;
      pushOp({ kind: 'remove', from: current.end, to: nativeBufferedEnd(), tail: true });
      return true;
    }

    /* ---------- 完整曲目下载、按队列顺序追加 ---------- */
    // appended 仅表示一次 append 成功；只有 end 已标定才表示整首完成。
    // 下载可以并行，时间轴只能串行，未来曲目的失败不能截断正在播放的曲目。
    function currentIndex(s) {
      var segment = segmentAt(nativeTime());
      var index = segment ? s.segments.indexOf(segment) : -1;
      return index < 0 ? 0 : index;
    }
    function createSegment(qi) {
      return { qi: qi, start: null, end: null, duration: null,
        state: 'queued', appended: false, attempts: 0, fetched: null,
        failure: null, failureReported: false, cancel: null, dropped: false };
    }
    function firstPending(s) {
      for (var i = 0; i < s.segments.length; i++) {
        if (typeof s.segments[i].end !== 'number') return s.segments[i];
      }
      return null;
    }
    function calibrate(s, segment, failure) {
      if (!alive(s) || segment.dropped) return;
      segment.end = nativeBufferedEnd();
      segment.duration = Math.max(0, segment.end - segment.start);
      segment.state = segment.duration > 0.05 ? 'ready' : 'failed';
      segment.failure = failure || (segment.state === 'failed' ? 'empty' : null);
      if (segment.failure && !s.started) {
        s.offset = 0;
        setNativeTime(0);
      }
      if (!reportFailures(s)) return;
      var wanted = s.pendingJump;
      if (wanted && wanted.segment === segment) {
        if (segment.state !== 'failed') {
          s.pendingJump = null;
          ignoreFailuresBefore(s, segment);
          lastNotified = segment.qi;
          setNativeTime(segment.start + Math.min(wanted.offset, Math.max(0, segment.duration - 0.05)));
          if (hooks.onAdvance) hooks.onAdvance(segment.qi);
        } else {
          // 切歌目标失败时继续寻找后续曲目，失败次数仍由正常边界规则控制。
          var following = s.segments[s.segments.indexOf(segment) + 1];
          if (!following) {
            following = createSegment((segment.qi + 1) % s.count);
            s.segments.push(following);
            s.nextQi = (following.qi + 1) % s.count;
          }
          s.pendingJump = { segment: following, offset: 0 };
          if (!s.started) { s.startTarget = following; s.offset = 0; }
        }
      }
      maybeStart(s);
      drain(s);
      fillBurst(s);
      dispatchDurationChange();
      report();
    }
    function reportFailures(s) {
      if (s.blocked) return false;
      var time = nativeTime();
      for (var i = 0; i < s.segments.length; i++) {
        var segment = s.segments[i];
        if (!segment.failure || segment.failureReported || segment.start == null) continue;
        // 预取失败只记录，等播到边界/用户点到该曲时才通知上层。不能提前暂停当前歌。
        if (segment.start > time + 0.05 && !(s.pendingJump && s.pendingJump.segment === segment)) continue;
        segment.failureReported = true;
        var keep = !hooks.onUnavailable || hooks.onUnavailable(segment.qi, segment.failure) !== false;
        if (!alive(s)) return false;
        if (!keep) { s.blocked = true; return false; }
      }
      return true;
    }
    function ignoreFailuresBefore(s, target) {
      var index = s.segments.indexOf(target);
      for (var i = 0; i < index; i++) s.segments[i].failureReported = true;
    }
    function drain(s) {
      if (!alive(s) || s.blocked || s.trimmingTail) return;
      var segment = firstPending(s);
      if (!segment || (segment.state !== 'downloaded' && segment.state !== 'unavailable')) return;
      segment.start = nativeBufferedEnd();
      segment.state = 'appending';
      if (segment.failure) {
        pushOp({ kind: 'calibrate', segment: segment, failure: segment.failure });
      } else {
        var bytes = segment.fetched;
        segment.fetched = null;
        pushOp({ kind: 'append', bytes: bytes, segment: segment, last: true });
      }
    }
    function fillBurst(s) {
      if (!alive(s) || s.blocked) return 0;
      var queued = 0;
      var room = BURST_AHEAD - (s.segments.length - currentIndex(s) - 1);
      while (room-- > 0) {
        s.segments.push(createSegment(s.nextQi));
        s.nextQi = (s.nextQi + 1) % s.count;
        queued++;
      }
      // 首曲下载期间只用一条连接；之后最多两条连接填满六首余量。
      var limit = s.started ? FETCH_CONCURRENCY : 1;
      for (var i = 0; i < s.segments.length && s.downloads < limit; i++) {
        if (s.segments[i].state === 'queued') loadSegment(s, s.segments[i]);
      }
      return queued;
    }
    function resolveUrl(qi) {
      return Promise.resolve().then(function () {
        if (!hooks.getUrl) throw new Error('no-resolver');
        return hooks.getUrl(qi);
      }).then(function (url) {
        if (!url) throw new Error('no-url');
        return url;
      });
    }
    function looksLikeErrorPage(bytes) {
      for (var i = 0; i < bytes.length && i < 64; i++) {
        var code = bytes[i];
        if (code === 32 || code === 9 || code === 10 || code === 13) continue;
        return code === 60 || code === 123 || code === 91;
      }
      return false;
    }
    function loadSegment(s, segment) {
      segment.state = 'loading';
      segment.attempts++;
      s.downloads++;
      fetchBuffer(s, segment).then(function (bytes) {
        if (!alive(s) || segment.dropped) return;
        segment.fetched = bytes;
        segment.state = 'downloaded';
      }, function (error) {
        if (!alive(s) || segment.dropped) return;
        var reason = (error && error.message) || 'fetch-failed';
        // 网络短暂中断可以重试；版权 HTML、空响应等确定不可播的结果不反复请求。
        if (segment.attempts < MAX_ATTEMPTS &&
            !/^(content-type|not-audio|empty|too-large|http-4)/.test(reason)) {
          segment.state = 'queued';
        } else {
          segment.failure = reason;
          segment.state = 'unavailable';
        }
      }).then(function () {
        s.downloads--;
        if (!alive(s)) return;
        drain(s);
        fillBurst(s);
      });
    }
    function fetchBuffer(s, segment) {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var reader = null;
      var timer;
      var cancelReject;
      var cancelled = false;
      var cancellation = new Promise(function (resolve, reject) { cancelReject = reject; });
      segment.cancel = function () {
        if (cancelled) return;
        cancelled = true;
        try { if (controller) controller.abort(); } catch (e) {}
        try { if (reader) Promise.resolve(reader.cancel()).catch(function () {}); } catch (e) {}
        cancelReject(new Error('cancelled'));
      };
      // 超时覆盖 URL 解析和响应体，离开会话会同步清理计时器与连接。
      timer = setTimeout(function () {
        cancelReject(new Error('timeout'));
        segment.cancel();
      }, FETCH_TIMEOUT);
      var reading = resolveUrl(segment.qi).then(function (url) {
        if (cancelled || !alive(s)) throw new Error('gone');
        return fetch(url, controller ? { signal: controller.signal } : undefined);
      }).then(function (response) {
        if (cancelled || !alive(s)) throw new Error('gone');
        if (!response.ok) throw new Error('http-' + response.status);
        var type = (response.headers.get('content-type') || '').toLowerCase();
        if (type && type.indexOf('audio') === -1 && type.indexOf('octet-stream') === -1 && type.indexOf('mpeg') === -1) {
          throw new Error('content-type');
        }
        if (Number(response.headers.get('content-length')) > MAX_TRACK_BYTES) throw new Error('too-large');
        reader = response.body && response.body.getReader ? response.body.getReader() : null;
        if (!reader) {
          if (response.arrayBuffer) return response.arrayBuffer();
          throw new Error('no-stream');
        }
        var chunks = [];
        var size = 0;
        function readMore() {
          return reader.read().then(function (result) {
            if (cancelled || !alive(s)) throw new Error('gone');
            if (result.done) {
              var joined = new Uint8Array(size);
              var offset = 0;
              for (var i = 0; i < chunks.length; i++) {
                joined.set(chunks[i], offset);
                offset += chunks[i].byteLength;
              }
              return joined.buffer;
            }
            size += result.value.byteLength;
            if (size > MAX_TRACK_BYTES) throw new Error('too-large');
            chunks.push(result.value);
            return readMore();
          });
        }
        return readMore();
      }).then(function (bytes) {
        if (!bytes || !bytes.byteLength) throw new Error('empty');
        if (bytes.byteLength > MAX_TRACK_BYTES) throw new Error('too-large');
        if (looksLikeErrorPage(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)))) throw new Error('not-audio');
        return bytes;
      });
      return Promise.race([reading, cancellation]).then(function (bytes) {
        clearTimeout(timer);
        segment.cancel = null;
        return bytes;
      }, function (error) {
        clearTimeout(timer);
        if (segment.cancel) segment.cancel();
        segment.cancel = null;
        throw error;
      });
    }

    /* ---------- 起播与历史裁剪 ---------- */
    function maybeStart(s) {
      if (!alive(s) || s.started || s.blocked) return;
      var first = s.startTarget;
      var startIndex = first ? s.segments.indexOf(first) : 0;
      if (first && first.state === 'failed') { first = null; s.offset = 0; }
      if (first && first.state !== 'ready') return;
      for (var i = Math.max(0, startIndex); !first && i < s.segments.length; i++) {
        if (s.segments[i].state === 'ready') { first = s.segments[i]; break; }
        if (s.segments[i].state !== 'failed') return;
      }
      if (!first) return;
      var target = first.start + Math.min(s.offset, Math.max(0, first.duration - 0.2));
      s.started = true;
      if (target > 0) setNativeTime(target);
      if (s.autoplay) {
        if (hooks.play) hooks.play();
        else audio.play();
      } else report();
    }
    function trim(s) {
      if (!alive(s) || !s.buffer || s.buffer.updating) return;
      var segment = segmentAt(nativeTime());
      if (!segment) return;
      var target = segment.start - HISTORY_KEEP;
      if (target <= s.trimmedTo + 1) return;
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
    // 巡检仅补齐有限队列；曲目续播本身由已经追加的连续媒体时间轴驱动。
    function keepAlive(s) {
      if (!alive(s) || !reportFailures(s)) return;
      retryQuota(s);
      drain(s);
      fillBurst(s);
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
      s.onUpdateEnd = function () { if (alive(s)) onUpdateEnd(); };
      s.onBufferError = function () { if (alive(s)) fatal('source-buffer-error'); };
      buffer.addEventListener('updateend', s.onUpdateEnd);
      buffer.addEventListener('error', s.onBufferError);
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
        if (s.buffer) {
          s.buffer.removeEventListener('updateend', s.onUpdateEnd);
          s.buffer.removeEventListener('error', s.onBufferError);
        }
        s.quotaOp = null;
        s.segments.forEach(function (segment) {
          segment.dropped = true;
          if (segment.cancel) segment.cancel();
          segment.fetched = null;
        });
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
        downloads: 0,
        blocked: false,
        trimmedTo: 0,
        quotaOp: null,
        source: null,
        buffer: null,
        objectUrl: '',

        pendingJump: null,
        timer: null
      };
      s.segments.push(createSegment(qi));
      s.nextQi = (qi + 1) % count;
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
      fillBurst(s);
      // 浏览器允许执行时继续补齐；已经缓冲的曲目不依赖后台计时器或网络。
      s.timer = setInterval(function () { keepAlive(s); }, KEEPALIVE_MS);
      return true;
    }
    function jump(index, offset, autoplay) {
      var s = session;
      if (!active || !s) return false;
      s.blocked = false;
      s.pendingJump = null;
      var wanted = offset > 0 ? offset : 0;
      var segment = null;
      var current = currentIndex(s);
      // 优先选距当前最近的可用段；小歌单循环后旧同名段可能已被回收。
      var distance = Infinity;
      for (var i = 0; i < s.segments.length; i++) {
        var candidate = s.segments[i];
        if (candidate.qi !== index || candidate.state === 'failed' ||
            (candidate.start != null && candidate.start < s.trimmedTo)) continue;
        if (Math.abs(i - current) < distance) { segment = candidate; distance = Math.abs(i - current); }
      }
      if (!segment) {
        // 未缓冲的上一首/任意曲：保留正在写入和已播放的段，追加目标，仍使用同一个 src。
        // 只取消尚未追加的未来下载，不中断当前可播放缓冲，也不把播放头提前移到缓冲末尾。
        if (s.quotaOp) {
          // 配额拒绝的 append 尚未写入任何字节，可以安全撤销未选择的未来段。
          s.quotaOp.segment.fetched = s.quotaOp.bytes;
          s.quotaOp.segment.state = 'downloaded';
          s.quotaOp.segment.start = null;
          s.quotaOp = null;
        }
        var retained = [];
        s.segments.forEach(function (item) {
          if (typeof item.end === 'number' || item.state === 'appending') retained.push(item);
          else {
            item.dropped = true;
            if (item.cancel) item.cancel();
            item.fetched = null;
          }
        });
        s.segments = retained;
        segment = createSegment(index);
        s.segments.push(segment);
        s.nextQi = (index + 1) % s.count;
      }
      s.autoplay = autoplay !== false;
      if (!s.started) { s.startTarget = segment; s.offset = wanted; }
      if (s.autoplay) audio.autoplay = true;
      if (typeof segment.end !== 'number') {
        ignoreFailuresBefore(s, segment);
        s.pendingJump = { segment: segment, offset: wanted };
        lastNotified = index;
        prioritizeQuota(s);
        fillBurst(s);
        if (s.autoplay && audio.paused && hooks.play) hooks.play();
        if (hooks.onAdvance) hooks.onAdvance(index);
        report();
        return true;
      }
      lastNotified = index;
      ignoreFailuresBefore(s, segment);
      setNativeTime(segment.start + Math.min(wanted, Math.max(0, segment.duration - 0.05)));
      if (s.autoplay && audio.paused && hooks.play) hooks.play();
      maybeStart(s);
      fillBurst(s);
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
      prefetchBurst: function () { return session ? fillBurst(session) : 0; }
    };
  };
})();
