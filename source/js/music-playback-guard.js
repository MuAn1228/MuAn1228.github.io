// Shared native-audio compatibility for browsers that leave play() pending on a new source.
(function () {
  'use strict';
  window.__createBlogAudioGuard = function (audio, onEvent) {
    var nativePlay = audio.play.bind(audio);
    var nativePause = audio.pause.bind(audio);
    var wanted = false;
    var pending = false;
    var retried = false;
    var generation = 0;
    var source = audio.src;

    // APlayer creates a detached audio. Keep its native media element in the document.
    if (!audio.isConnected) {
      audio.hidden = true;
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
    }

    function report(name, detail) { if (onEvent) onEvent(name, detail); }
    function resetSource() {
      source = audio.src;
      generation++;
      retried = false;
      pending = wanted;
    }
    function cancel() {
      wanted = false;
      pending = false;
      generation++;
      audio.autoplay = false;
    }
    audio.play = function () {
      if (source !== audio.src) resetSource();
      generation++;
      wanted = true;
      pending = true;
      audio.autoplay = true;
      return nativePlay();
    };
    audio.pause = function () {
      cancel();
      return nativePause();
    };
    function playing() { if (!audio.paused) pending = false; }
    function paused() {
      // Natural endings and queued pause events from a replaced source preserve play intent.
      if (!audio.ended && !pending && audio.paused) cancel();
    }
    function ready() {
      if (!wanted || !pending || retried || !audio.paused || audio.ended ||
          audio.error || audio.readyState < 3 || source !== audio.src) return;
      // At most one extra request per source, driven by readiness, never by a timer.
      retried = true;
      var currentGeneration = generation;
      report('ready-play-retry');
      function rejected(error) {
        if (currentGeneration !== generation || !wanted) return;
        if (error.name === 'AbortError') return; // A replaced/cancelled load is not a playback refusal.
        cancel();
        report('ready-play-rejected', { reason: error.name || 'Error' });
      }
      try {
        var result = nativePlay();
        if (result && result.then) result.then(function () {
          if (currentGeneration === generation && wanted) report('ready-play-resolved');
        }, rejected);
      } catch (error) { rejected(error); }
    }
    audio.addEventListener('emptied', resetSource);
    audio.addEventListener('playing', playing);
    audio.addEventListener('pause', paused);
    audio.addEventListener('canplay', ready);
    audio.addEventListener('canplaythrough', ready);
    return {
      isPending: function () { return wanted && pending; },
      destroy: function () {
        cancel();
        nativePause();
        audio.play = nativePlay;
        audio.pause = nativePause;
        audio.removeEventListener('emptied', resetSource);
        audio.removeEventListener('playing', playing);
        audio.removeEventListener('pause', paused);
        audio.removeEventListener('canplay', ready);
        audio.removeEventListener('canplaythrough', ready);
      }
    };
  };
})();
