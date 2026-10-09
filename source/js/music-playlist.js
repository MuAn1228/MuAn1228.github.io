// ===== 静态音乐播放列表（网易云，49 首）=====
// 本地文件（music-assets 仓库，155 首白名单）优先用完整版；其余依次尝试
// Meting API → 网易云官方外链，全失败则由 error 兜底自动跳到下一首。
// 本播放器是全站唯一的音频引擎：
//  - 播放状态（当前曲目/进度/停止键状态）写入 sessionStorage，切页（整页刷新）后自动续播
//  - 通过 window.__blogMusic 暴露接口，供音乐页紫色大播放器复用同一引擎
(function () {
  if (!window.APlayer || window.__blogMusic) return;
  var songs = [
  {
    "id": 2085859568, "local": true,
    "name": "LET ME LUV U",
    "artist": "mac ova seas",
    "cover": "https://p2.music.126.net/nmOWPii-tnHeLzMjhbqaxA==/109951168945233919.jpg"
  },
  {
    "id": 1496089152,
    "name": "I Really Want to Stay at Your House",
    "artist": "Rosa Walton",
    "cover": "/img/music/IReallyWantToStayAtYourHouse.jpg"
  },
  {
    "id": 534540498, "local": true,
    "name": "藏",
    "artist": "徐梦圆",
    "cover": "https://p2.music.126.net/9cySfhHshoKksSkAxwVVqw==/109951163175751210.jpg"
  },
  {
    "id": 28830410,
    "name": "Life",
    "artist": "Tobu",
    "cover": "https://p2.music.126.net/wZAKvN3mbj_QmVEMd786iQ==/109951167481004451.jpg"
  },
  {
    "id": 1299889486, "local": true,
    "name": "戒不掉（原声版）",
    "artist": "欧阳耀莹",
    "cover": "https://p1.music.126.net/h8fo0jMwdGOfAc54xvYJAg==/109951163446911351.jpg"
  },
  {
    "id": 1919787845,
    "name": "De Yang Gatal Gatal Sa",
    "artist": "布灵布灵Duang",
    "cover": "/img/music/gatal.jpg"
  },
  {
    "id": 1927395053,
    "name": "溯",
    "artist": "三叶",
    "cover": "/img/music/su.jpg"
  },
  {
    "id": 32835004, "local": true,
    "name": "Unbelievable",
    "artist": "Owl City",
    "cover": "https://p1.music.126.net/7GuSnLBJ2n_9kiqgwStkyg==/7959364674173316.jpg"
  },
  {
    "id": 30780496,
    "name": "Mine (Illenium Remix)",
    "artist": "ILLENIUM",
    "cover": "https://p2.music.126.net/94Zjhb6ibXN9jpIjRQDbUw==/7762552092459017.jpg"
  },
  {
    "id": 28859948, "local": true,
    "name": "Turnin'",
    "artist": "Young Rising Sons",
    "cover": "https://p1.music.126.net/_3YCwTf4yAB-pMP7j70sUg==/5896680860106448.jpg"
  },
  {
    "id": 1365898499,
    "name": "失眠飞行",
    "artist": "接个吻，开一枪",
    "cover": "https://p1.music.126.net/Bq6Io8lpY1l2HsQ28QKFlw==/109951164083996255.jpg"
  },
  {
    "id": 1387581250,
    "name": "MOM",
    "artist": "蜡笔小心（灵柯）",
    "cover": "https://p2.music.126.net/ZOkr1NI-WGGRuc5-G_7-CA==/109951164332837488.jpg"
  },
  {
    "id": 1436575829,
    "name": "鱼",
    "artist": "冯政FireDrippin",
    "cover": "https://p2.music.126.net/Tv5cS8x6BvOeBnThWIRh6w==/109951164860683750.jpg"
  },
  {
    "id": 550138197,
    "name": "没有理由",
    "artist": "永彬Ryan.B",
    "cover": "https://p2.music.126.net/VAux0wpbTJz6timFFHVgLQ==/109951163237307291.jpg"
  },
  {
    "id": 441491080,
    "name": "Oops",
    "artist": "Little Mix",
    "cover": "https://p2.music.126.net/lCxrFkMt1q71Pjo9i3AxlA==/109951165976214835.jpg"
  },
  {
    "id": 2021379728,
    "name": "乐园",
    "artist": "沧桑Cang333",
    "cover": "https://p1.music.126.net/mxMez2A64_vH6aisW7R4XQ==/109951168299426988.jpg"
  },
  {
    "id": 1831482748,
    "name": "春娇与志明(抖音完整版)",
    "artist": "珊爷",
    "cover": "https://p2.music.126.net/pScUaISJzJwF5Ysp0A9PKg==/109951165825646959.jpg"
  },
  {
    "id": 1456890009,
    "name": "罗生门（Follow）",
    "artist": "梨冻紧",
    "cover": "https://p2.music.126.net/yN1ke1xYMJ718FiHaDWtYQ==/109951165076380471.jpg"
  },
  {
    "id": 65592,
    "name": "单车",
    "artist": "陈奕迅",
    "cover": "/img/music/danche.jpg"
  },
  {
    "id": 1396409548,
    "name": "恋",
    "artist": "饼饼 / 慵狐 / 倚云听风雨",
    "cover": "/img/music/lian.jpg"
  },
  {
    "id": 1835009703,
    "name": "★kiss me baby☆（吻我，宝）",
    "artist": "Victor☆",
    "cover": "https://p1.music.126.net/gCCOSK1Q7Oax_3o3X0iq7g==/109951165864199501.jpg"
  },
  {
    "id": 34578066,
    "name": "The Sweetest Sin (Eightfold & MKJ Remix)",
    "artist": "MKJ",
    "cover": "https://p2.music.126.net/RoQzK6qm4x74QK3Qjku5Fg==/3260051977024194.jpg"
  },
  {
    "id": 1380022214,
    "name": "Count The Hours",
    "artist": "BEAUZ",
    "cover": "https://p2.music.126.net/EqNfr7omiUwTxZjfxmzCJw==/109951164315683664.jpg"
  },
  {
    "id": 28718313,
    "name": "The Way I Still Love You",
    "artist": "Reynard Silva",
    "cover": "https://p1.music.126.net/JyPsd_g00M-4mqXLLtHncw==/5984641790343690.jpg"
  },
  {
    "id": 438204707, "local": true,
    "name": "天若有情",
    "artist": "黄丽玲",
    "cover": "https://p2.music.126.net/hzs4pVOxFKS5J64nY-rugA==/109951165958851914.jpg"
  },
  {
    "id": 1848224873,
    "name": "All Girls Are The Same",
    "artist": "Juice WRLD",
    "cover": "https://p2.music.126.net/3z0Sj3ihPvqGg5BaLfY2wA==/109951166611809914.jpg"
  },
  {
    "id": 2101397575,
    "name": "I Want You To Know (Hella x Pegato Remix)",
    "artist": "Pegato",
    "cover": "https://p1.music.126.net/R5jE_jqR3b2rShuC46pa3Q==/109951169067559689.jpg"
  },
  {
    "id": 1403318151,
    "name": "把回忆拼好给你",
    "artist": "王贰浪",
    "cover": "https://p2.music.126.net/CBx2K_jEN3SNWwYztagPPw==/109951164485969446.jpg"
  },
  {
    "id": 1497588709,
    "name": "给你呀（又名：for ya）",
    "artist": "蒋小呢",
    "cover": "https://p1.music.126.net/GI1Ex39x73zBT-1r7_o-sQ==/109951165494781109.jpg"
  },
  {
    "id": 34040716,
    "name": "Visions",
    "artist": "Acreix",
    "cover": "https://p1.music.126.net/FkDHefqpHyhxUdxWFug7mg==/109951165732553232.jpg"
  },
  {
    "id": 1454664682,
    "name": "Savage Love (Laxed - Siren Beat)",
    "artist": "Jawsh 685",
    "cover": "https://p1.music.126.net/vAZs5mGUZOHdMbMtD4esjw==/109951168957920591.jpg"
  },
  {
    "id": 3337284165,
    "name": "思绪回到那年",
    "artist": "吃泡面谈理想",
    "cover": "https://p2.music.126.net/g0ImXqISLtmZjDHQfZ-QPw==/109951172557040742.jpg"
  },
  {
    "id": 1992712131,
    "name": "Time Stop",
    "artist": "BLACKDD",
    "cover": "https://p1.music.126.net/jjjqHYoelAqD_ACk0esKOA==/109951168242093318.jpg"
  },
  {
    "id": 28830411,
    "name": "Sunburst",
    "artist": "Tobu",
    "cover": "https://p2.music.126.net/AWDnHZIVbGI-PSo248vm8Q==/109951167481013649.jpg"
  },
  {
    "id": 1890756154,
    "name": "it's 6pm but I miss u already.",
    "artist": "BlueLee",
    "cover": "https://p1.music.126.net/vfArwmf4yUKmZhi-ZCwOXA==/109951166569406479.jpg"
  },
  {
    "id": 1459232593,
    "name": "But U",
    "artist": "NINEONE#乃万",
    "cover": "https://p1.music.126.net/li19i75jz6GGOT79IyAjYA==/109951165100592039.jpg"
  },
  {
    "id": 27713716,
    "name": "旅程",
    "artist": "蔡依林",
    "cover": "https://p1.music.126.net/O2Ty_diF0X8TJBl6IPaErQ==/109951170702636189.jpg"
  },
  {
    "id": 1413464902,
    "name": "春风十里报新年",
    "artist": "接个吻，开一枪",
    "cover": "https://p1.music.126.net/A157zQR5rR66LMatjYAucQ==/109951164595606537.jpg"
  },
  {
    "id": 2060592195,
    "name": "Soul(prod.st1x51)",
    "artist": "MISTERK",
    "cover": "https://p1.music.126.net/yPISuBkO2mV69X5TSBGj-w==/109951170130642780.jpg"
  },
  {
    "id": 29777545, "local": true,
    "name": "Angel",
    "artist": "尹美莱",
    "cover": "https://p2.music.126.net/93xo1BwBz05-KsuPtooZ-w==/109951169712015231.jpg"
  },
  {
    "id": 2709587915,
    "name": "文爱(CG&贺敬轩)",
    "artist": "清茶",
    "cover": "https://p1.music.126.net/4NAvaej-30Spkl5stbgwkQ==/109951171011161391.jpg"
  },
  {
    "id": 372359, "local": true,
    "name": "咏春",
    "artist": "七朵组合",
    "cover": "https://p1.music.126.net/GE9hj6I9A-fL64_tFuGZAA==/109951172859327838.jpg"
  },
  {
    "id": 25706247,
    "name": "Kerosene",
    "artist": "Crystal Castles",
    "cover": "/img/music/kerosene.jpg"
  },
  {
    "id": 1397330334,
    "name": "___(Prod.AIRAVATA)",
    "artist": "SASIOVERLXRD",
    "cover": "https://p2.music.126.net/7n4gZTBCNu_pm4SzYZXd5Q==/109951168550319106.jpg"
  },
  {
    "id": 1313341399,
    "name": "Lightning Moment feat.fox capture plan",
    "artist": "DJ OKAWARI",
    "cover": "https://p1.music.126.net/CmHfDz5trhim-O4zaPg_YA==/109951168475732280.jpg"
  },
  {
    "id": 17845320,
    "name": "Pumped Up Kicks",
    "artist": "Foster The People",
    "cover": "https://p1.music.126.net/AbPX5FlwqelAK6AA4_21Mg==/109951166131168894.jpg"
  },
  {
    "id": 434974448,
    "name": "Sync (Full Version)",
    "artist": "Andreas B.",
    "cover": "https://p1.music.126.net/6-1VshVZQ3m8N4NWZbmWbw==/1405175875965107.jpg"
  },
  {
    "id": 499274178, "local": true,
    "name": "Friends",
    "artist": "Justin Bieber / BloodPop",
    "cover": "https://p1.music.126.net/eWHzfn-JXqi9orQybN1EUw==/109951168770712532.jpg"
  },
  {
    "id": 464721029, "local": true,
    "name": "No Matter (Basic Tape vs. Frances)",
    "artist": "Basic Tape",
    "cover": "https://p1.music.126.net/VqDGz0bgQkQgSsFYG35row==/17798894230849117.jpg"
  },
  {
    "id": 1336856864,
    "name": "形容",
    "artist": "沈以诚",
    "cover": "/img/music/xingrong.jpg"
  }
];

  // 完整活动歌单由常驻 APlayer 持有；页面只负责选歌和显示，不参与 ended 切歌。
  var STATE_KEY = 'blog-music-state';
  var ap = null;
  var owner = 'mini';
  var playlists = { mini: [], big: [] };
  var changingPlaylist = false;
  var restoreCancelled = false;
  var lastSaveTime = -1;
  var userPaused = false;
  var wasPlayingOnNav = false; // 进入本次 pjax 切换前是否正在播放
  var LOCAL_IDS = null;
  var skipCount = 0;
  var mediaTrack = '';
  var playbackGuard = null;
  var continuous = null;        // 连续流（MediaSource）引擎；不可用或已失效时为 null
  var suppressJump = false;     // 连续流内同步界面时抑制流内跳转
  var originalSetAudio = null;  // APlayer 原生换源实现

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)); }
    catch (e) { return null; }
  }

  function getState() {
    if (!ap) return null;
    var item = ap.list.audios[ap.list.index];
    if (!item) return null;
    return {
      owner: owner,
      index: ap.list.index,
      src: item.url,
      name: item.name,
      artist: item.artist,
      cover: item.cover,
      time: ap.audio.currentTime || 0,
      playing: !ap.audio.paused && !ap.audio.ended
    };
  }

  function saveState() {
    if (changingPlaylist) return;
    var state = getState();
    if (!state) return;
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var state = getState();
    if (!state) return;
    try {
      if (mediaTrack !== state.src && window.MediaMetadata) {
        mediaTrack = state.src;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: state.name,
          artist: state.artist,
          album: owner === 'big' ? '我喜欢的音乐' : 'Mu An\'s Blog',
          artwork: state.cover ? [{ src: new URL(state.cover, location.href).href }] : []
        });
      }
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
      var duration = ap.audio.duration;
      if (navigator.mediaSession.setPositionState && isFinite(duration) && duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: ap.audio.playbackRate || 1,
          position: Math.min(Math.max(state.time, 0), duration)
        });
      }
    } catch (e) {} // 不支持某个 Media Session 字段的浏览器仍可正常播放
  }

  function publishState() {
    if (changingPlaylist) return;
    saveState();
    updateMediaSession();
    document.dispatchEvent(new CustomEvent('blog-music-statechange', { detail: getState() }));
  }

  function play() {
    if (!ap) return;
    restoreCancelled = true;
    userPaused = false;
    ap.play();
  }

  function pause() {
    if (!ap) return;
    restoreCancelled = true;
    userPaused = true;
    ap.pause();
    publishState();
  }

  function step(direction) {
    if (!ap || !ap.list.audios.length) return;
    skipCount = 0;
    ap.list.switch(direction < 0 ? ap.prevIndex() : ap.nextIndex());
    play();
  }

  function select(queueOwner, index, autoplay, offset) {
    var queue = playlists[queueOwner];
    if (!ap || !queue || !queue[index]) return false;
    skipCount = 0;
    var stream = streamFor(queueOwner);
    var ownerChanged = owner !== queueOwner;
    changingPlaylist = true;
    // clear/add 只发生在切换歌单时。离开当前歌单前先结束它的连续流会话。
    if (ownerChanged && continuous && continuous.isActive()) continuous.stop();
    if (ownerChanged) {
      ap.list.clear();
      owner = queueOwner;
      if (stream) stream.beginPending();
      ap.list.add(queue);
    }
    if (stream) {
      // 会话建立/跳转期间不写 audio.src：APlayer 的换源逻辑由连续流接管。
      if (!stream.isActive()) stream.beginPending();
      suppressJump = true;
      if (ap.list.index !== index) ap.list.switch(index);
      suppressJump = false;
      changingPlaylist = false;
      if (autoplay === false) ap.pause();
      if (stream.isActive()) {
        stream.jump(index, offset || 0, autoplay !== false);
      } else if (!stream.start(index, {
        count: queue.length, offset: offset || 0, autoplay: autoplay !== false
      })) {
        continuous = null;                       // 连续流不可用：本次加载回到经典路径
        originalSetAudio(ap.list.audios[index]);
        if (autoplay !== false) play();
      } else if (autoplay !== false) {
        play();
      }
    } else {
      if (autoplay === false) ap.pause();
      if (ap.list.index !== index) ap.list.switch(index);
      changingPlaylist = false;
      if (autoplay !== false) play();
    }
    publishState();
    return true;
  }

  function restoreSaved(saved) {
    var queueOwner = saved.owner === 'big' ? 'big' : 'mini';
    if (!select(queueOwner, saved.index, saved.playing !== false, saved.time || 0)) return;
    if (continuous && continuous.isActive()) return; // 连续流已按保存位置恢复
    // 使用本次会话的音源，避免复用 sessionStorage 中已过期的签名链接。
    var restoredUrl = getState().src;
    function seekSaved() {
      ap.audio.removeEventListener('loadedmetadata', seekSaved);
      if (getState().src === restoredUrl) ap.seek(saved.time || 0);
    }
    if (ap.audio.readyState >= 1) seekSaved();
    else ap.audio.addEventListener('loadedmetadata', seekSaved);
  }

  function bindAp() {
    // listswitch 在 APlayer 更新 index 之前触发，包装后在切换完成时同步通知界面。
    var switchTrack = ap.list.switch.bind(ap.list);
    ap.list.switch = function (index) {
      switchTrack(index);
      publishState();
    };
    // 连续流接管当前歌单的换源：会话内只跳转，绝不写 audio.src / 重新 play()。
    originalSetAudio = ap.setAudio.bind(ap);
    ap.setAudio = function (track) {
      var ownerStream = streamFor(owner);
      if (ownerStream) {
        if (ownerStream.isPending()) return;             // select 正在接管这次切换
        if (ownerStream.isActive()) {
          if (!suppressJump) ownerStream.jump(ap.list.index, 0, !ap.paused);
          return;
        }
        if (ownerStream.start(ap.list.index, {
          count: playlists[owner].length, offset: 0, autoplay: !ap.paused
        })) return;
        continuous = null;                               // 启动失败退回经典路径
      }
      return originalSetAudio(track);
    };
    var originalPlay = ap.play.bind(ap);
    ap.play = function () {
      // 首次起播（播放键 / 点歌 / 恢复）也接入连续流，整个会话只保留一次 src。
      var ownerStream = streamFor(owner);
      if (ownerStream && !ownerStream.isActive() && !ownerStream.isPending()) {
        var offset = ap.audio.currentTime > 0 ? ap.audio.currentTime : 0;
        if (!ownerStream.start(ap.list.index, {
          count: playlists[owner].length, offset: offset, autoplay: true
        })) continuous = null;
      }
      return originalPlay();
    };
    ap.on('play', function () {
      if (!ap.audio.paused) {
        userPaused = false;
        restoreCancelled = true;
      }
      publishState();
    });
    ap.on('playing', function () { skipCount = 0; publishState(); });
    ap.on('pause', function () {
      // 换源产生的旧 pause 事件不能覆盖新曲的播放意图。
      if (ap.audio.paused && !ap.audio.ended && !changingPlaylist &&
          !(playbackGuard && playbackGuard.isPending())) userPaused = true;
      publishState();
    });
    ap.on('loadedmetadata', publishState);
    ap.on('ended', publishState); // APlayer 内建 ended 是唯一的自动切歌入口
    ap.on('timeupdate', function () {
      var t = ap.audio.currentTime;
      if (t - lastSaveTime >= 1 || t - lastSaveTime < 0) {
        lastSaveTime = t;
        saveState();
        updateMediaSession();
      }
    });
    // 在捕获阶段接管 error，避免 APlayer 自带的 2 秒重试与本站逻辑重复跳歌。
    ap.audio.addEventListener('error', function (event) {
      event.stopImmediatePropagation();
      if (changingPlaylist) return;
      var failed = getState();
      var shouldContinue = !ap.paused && !userPaused;
      document.dispatchEvent(new CustomEvent('blog-music-error', { detail: failed }));
      if (shouldContinue && ++skipCount <= 2 && ap.list.audios.length > 1) {
        ap.list.switch(ap.nextIndex());
        play();
      } else {
        skipCount = 0;
        pause();
        ap.notice('歌曲加载失败，请尝试其他歌曲', 0);
      }
    }, true);
    if ('mediaSession' in navigator) {
      var actions = {
        play: play,
        pause: pause,
        previoustrack: function () { step(-1); },
        nexttrack: function () { step(1); },
        seekto: function (details) { ap.seek(details.seekTime); updateMediaSession(); },
        seekbackward: function (details) { ap.seek(ap.audio.currentTime - (details.seekOffset || 10)); },
        seekforward: function (details) { ap.seek(ap.audio.currentTime + (details.seekOffset || 10)); }
      };
      Object.keys(actions).forEach(function (action) {
        try { navigator.mediaSession.setActionHandler(action, actions[action]); } catch (e) {}
      });
    }
  }

  function init() {
    // 先加载仓库白名单，再解析歌单——否则本地歌曲会误走网络源
    loadLocalIds().then(function () {
      return Promise.all(songs.map(resolve));
    }).then(function (list) {
      playlists.mini = list;
      var container = document.createElement('div');
      document.body.appendChild(container);
      ap = new APlayer({
        container: container,
        fixed: true,
        mini: true,
        autoplay: false,
        preload: 'auto',
        theme: '#a18cd1',
        lrcType: 3,
        mutex: true,
        order: 'list',
        loop: 'all',
        listFolded: true,
        listMaxHeight: '320px',
        audio: list
      });
      window.__blogMusic.ap = ap;
      if (window.__createBlogAudioGuard) {
        playbackGuard = window.__createBlogAudioGuard(ap.audio, function (name) {
          if (name === 'ready-play-rejected') pause();
        });
      }
      bindAp();
      continuous = typeof window.__createBlogContinuousStream === 'function'
        ? window.__createBlogContinuousStream(ap.audio, {
            getUrl: streamUrl,
            onAdvance: onContinuousAdvance,
            onUnavailable: onStreamUnavailable,
            onFatal: onStreamFatal,
            onState: publishState,
            play: play
          })
        : null;
      if (continuous && !continuous.supported) continuous = null;
      // 切页保护：pjax 切换期间若播放器被意外暂停（非用户主动点击暂停），切换完成后自动续播
      document.addEventListener('pjax:send', function () {
        wasPlayingOnNav = !!(ap && !ap.audio.paused);
      });
      document.addEventListener('pjax:complete', function () {
        if (wasPlayingOnNav && ap && ap.audio.paused && !userPaused) {
          play();
        }
      });
      var saved = readState();
      var ready = saved && saved.owner === 'big'
        ? fetch('/data/music-playlist.json').then(function (r) { return r.json(); }).then(registerPlaylist)
        : Promise.resolve();
      ready.catch(function () {}).then(function () {
        // 歌单请求较慢时，保留用户已经在迷你播放器中做出的新选择。
        if (saved && !restoreCancelled && ap.audio.paused) restoreSaved(saved);
        publishState();
        document.dispatchEvent(new CustomEvent('blog-music-ready'));
      });
    });
  }

  var CDN_BASE = 'https://cdn.jsdelivr.net/gh/MuAn1228/music-assets@master/';

  function registerPlaylist(list) {
    playlists.big = list.map(function (song) {
      var id = String(song.id);
      return {
        name: song.name, artist: song.artist, cover: song.cover, songId: id,
        url: LOCAL_IDS && LOCAL_IDS.has(id) ? CDN_BASE + id + '.mp3'
          : 'https://music.163.com/song/media/outer/url?id=' + id + '.mp3'
      };
    });
  }

  // 加载仓库白名单（local-playlist-ids.json），失败时置空（全部走网络源）
  function loadLocalIds() {
    return fetch('/data/local-playlist-ids.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (ids) {
        LOCAL_IDS = new Set(ids.map(function (i) { return String(i); }));
      })
      .catch(function () { LOCAL_IDS = new Set(); });
  }

  function resolve(s) {
    // 1) 仓库里有本地文件 → jsDelivr CDN 完整版（最稳定，切页也不受网络冲击）
    var id = String(s.id);
    if (LOCAL_IDS && LOCAL_IDS.has(id)) {
      return Promise.resolve({
        name: s.name, artist: s.artist,
        url: CDN_BASE + id + '.mp3',
        cover: s.cover, lrc: '', songId: id
      });
    }
    // 2) Meting API（拿真实 CDN 直链）
    var fallback = 'https://music.163.com/song/media/outer/url?id=' + id + '.mp3';
    return fetch('https://api.injahow.cn/meting/?server=netease&type=song&id=' + id, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var url = d && d[0] && d[0].url;
        if (!url) throw new Error('no-url');
        return url;
      })
      // 3) 网易云官方外链兜底（免费可外链的歌曲仍可用）
      .catch(function () { return fallback; })
      .then(function (url) {
        return { name: s.name, artist: s.artist, url: url, cover: s.cover, lrc: '', songId: id };
      });
  }

  // ===== 连续流（MediaSource）接线 =====
  // 迷你歌单与音乐页大歌单都接入连续流：整个队列写进同一个 MediaSource，会话内只赋值一次 src。
  // Meting 的 type=url 直链（302 → 网易 CDN 两跳都带 CORS 头）可以 fetch 流式读取。
  var METING_STREAM = 'https://api.injahow.cn/meting/?server=netease&type=url&id=';

  // 连续流条件：队列长度 > 1，且 APlayer 处于「顺序播放 + 列表循环」。
  // 单曲循环 / 随机播放 / 播完即停由 APlayer 原生逻辑负责，连续时间轴无法表达，退回经典路径。
  function streamFor(queueOwner) {
    var queue = playlists[queueOwner];
    var allowed = !!(continuous && queue && queue.length > 1 && ap &&
      ap.options.order === 'list' && ap.options.loop === 'all');
    if (!allowed && continuous && continuous.isActive()) continuous.stop();
    return allowed ? continuous : null;
  }

  function streamUrl(index) {
    var queue = playlists[owner];
    var item = queue && queue[index];
    if (!item) return Promise.reject(new Error('no-track'));
    // jsDelivr 本地文件与 Meting 直链都带 CORS 头，可以直接流式读取。
    if (item.url.indexOf('music.163.com/song/media/outer/url') === -1) {
      return Promise.resolve(item.url);
    }
    // 网易官方外链没有 CORS 头（浏览器 fetch 直接失败），改用 Meting 直链重新解析；
    // 版权受限的歌曲只会返回 HTML，由 fetchTrack 的内容类型检查拦下，按不可用处理。
    if (!item.songId) return Promise.reject(new Error('no-id'));
    return Promise.resolve(METING_STREAM + item.songId);
  }

  function onContinuousAdvance(index) {
    // 背景播放时曲目边界推进：只同步界面与状态，不换源、不发起播放请求。
    skipCount = 0;
    if (!ap || ap.list.index === index) { publishState(); return; }
    suppressJump = true;
    changingPlaylist = true;
    ap.list.switch(index);
    changingPlaylist = false;
    suppressJump = false;
    publishState();
  }

  function onStreamUnavailable(index, reason) {
    document.dispatchEvent(new CustomEvent('blog-music-error', {
      detail: { owner: owner, index: index, reason: reason }
    }));
    var shouldContinue = !!(ap && !ap.paused && !userPaused);
    if (shouldContinue && ++skipCount <= 2) return true;
    skipCount = 0;
    fallbackClassic(false);
    if (ap) ap.notice('歌曲加载失败，请尝试其他歌曲', 0);
    return false;
  }

  function onStreamFatal(reason, wasPlaying) {
    fallbackClassic(wasPlaying, true);
  }

  function fallbackClassic(shouldPlay, permanent) {
    if (continuous) {
      continuous.stop();
      if (permanent) continuous = null;   // MSE 结构性失败：本次加载不再尝试连续流
    }
    if (!ap) return;
    if (!shouldPlay) ap.pause();          // 先落下暂停意图，避免换源时带出新的播放请求
    var track = ap.list.audios[ap.list.index];
    if (track && originalSetAudio) originalSetAudio(track);
    if (shouldPlay) play();
    else publishState();
  }

  // 暴露给音乐页大播放器的公共接口（全站唯一音频引擎）
  window.__blogMusic = {
    ap: null, // 播放器初始化后回填
    registerPlaylist: registerPlaylist,
    select: function (index, autoplay) { return select('big', index, autoplay); },
    getState: getState,
    next: function () { step(1); },
    previous: function () { step(-1); },
    toggle: function () { if (ap) ap.toggle(); },
    pause: pause,
    play: play,
    isPlaying: function () { return !!(ap && !ap.audio.paused); },
    currentUrl: function () {
      if (!ap) return '';
      var audios = ap.list.audios || [];
      var item = audios[ap.list.index];
      return item ? item.url : '';
    },
    seekTo: function (t) { if (ap) ap.seek(t || 0); },
    audio: function () { return ap ? ap.audio : null; }
  };

  init();
})();
