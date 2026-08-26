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
    "cover": "https://p1.music.126.net/w3wJ5IZjvFWY7wIA-nLewg==/109951168271665093.jpg"
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

  // 会话内共享的播放状态：{owner:'mini'|'big', index, src, name, artist, cover, time, playing}
  // owner='big' 表示这首是大播放器（音乐页）交回的，index 指向大播放器歌单；其余为迷你列表自身
  var STATE_KEY = 'blog-music-state';
  var ap = null;
  var focusMeta = null; // {owner, index, url}：最近一次由大播放器指定播放的曲目
  var lastSaveTime = -1;
  var userPaused = false;      // 用户显式暂停过（切页续播判断用）
  var wasPlayingOnNav = false; // 进入本次 pjax 切换前是否正在播放
  var LOCAL_IDS = null;        // music-assets 仓库白名单（加载后为 Set<String>）
  var skipBound = false;       // error 自动跳歌是否已绑定
  var skipCount = 0;           // 连续自动跳歌计数（防整目无法播放时死循环）

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)); }
    catch (e) { return null; }
  }

  function saveState() {
    if (!ap) return;
    var audios = ap.list.audios || [];
    var item = audios[ap.list.index] || audios[0];
    if (!item || !item.url) return;
    var url = item.url;
    var meta = (focusMeta && focusMeta.url === url) ? focusMeta : null;
    var state = {
      owner: meta ? meta.owner : 'mini',
      index: meta ? meta.index : ap.list.index,
      src: url,
      name: item.name,
      artist: item.artist,
      cover: item.cover,
      time: ap.audio.currentTime || 0,
      playing: !ap.audio.paused
    };
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function bindAp() {
    ap.on('play', function () {
      userPaused = false;
      skipCount = 0; // 播放成功，重置失败计数
      saveState();
    });
    ap.on('pause', function () {
      userPaused = true;
      saveState();
    });
    ap.audio.addEventListener('timeupdate', function () {
      var t = ap.audio.currentTime;
      // 节流：进度变化超过 1s 才写一次
      if (t - lastSaveTime >= 1 || t - lastSaveTime < 0) {
        lastSaveTime = t;
        saveState();
      }
    });
    // 一曲结束，等 APlayer 自动切到下一首后再保存
    ap.audio.addEventListener('ended', function () {
      setTimeout(saveState, 50);
    });
    // 音频源加载/解码失败（版权受限、防盗链、网络异常）：
    // 当前是迷你列表连播（owner 非 big）时自动跳到下一首，避免卡死；
    // 连续失败超过 2 次则停下（整单很可能都无法播放的情况）
    ap.audio.addEventListener('error', function () {
      var owner = (focusMeta && focusMeta.owner) || 'mini';
      if (owner !== 'mini') return; // 大播放器曲目由音乐页自己处理（提示去网易云）
      skipCount++;
      if (skipCount > 2) { skipCount = 0; return; }
      var audios = ap.list.audios || [];
      var next = ap.list.index + 1;
      if (next < audios.length) {
        ap.list.switch(next, true);
        var p = ap.play();
        if (p && p.catch) p.catch(function () {});
      }
    });
  }

  // 切到指定曲目；track 结构 {name,artist,cover,url}
  function switchTo(track, autoplay) {
    var audios = ap.list.audios || [];
    var idx = -1;
    for (var i = 0; i < audios.length; i++) {
      if (audios[i].url === track.url) { idx = i; break; }
    }
    if (idx === -1) {
      ap.list.add([track]);
      idx = ap.list.audios.length - 1;
    }
    ap.list.switch(idx, !!autoplay);
    if (autoplay !== false) {
      var p = ap.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function restoreSaved(saved) {
    switchTo({ name: saved.name, artist: saved.artist, cover: saved.cover, url: saved.src },
      saved.playing !== false);
    if (saved.owner === 'big') {
      focusMeta = { owner: 'big', index: saved.index, url: saved.src };
    }
    // 恢复进度
    var seeked = false;
    function doSeek() {
      if (seeked) return;
      seeked = true;
      try { ap.seek(saved.time || 0); } catch (e) {}
    }
    ap.audio.addEventListener('loadedmetadata', doSeek);
    if (ap.audio.readyState >= 1) doSeek();
    // 浏览器拦截自动播放时，给任意一次点击续播的机会
    if (saved.playing !== false) {
      var pending = true;
      var p = ap.play();
      if (p && p.catch) p.catch(function () {
        document.addEventListener('click', function onAny() {
          if (!pending) return;
          pending = false;
          var q = ap.play();
          if (q && q.catch) q.catch(function () {});
        }, { capture: true, once: true });
      });
    }
  }

  function init() {
    // 先加载仓库白名单，再解析歌单——否则本地歌曲会误走网络源
    loadLocalIds().then(function () {
      return Promise.all(songs.map(resolve));
    }).then(function (list) {
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
        listFolded: true,
        listMaxHeight: '320px',
        audio: list
      });
      window.__blogMusic.ap = ap;
      bindAp();
      // 切页保护：pjax 切换期间若播放器被意外暂停（非用户主动点击暂停），切换完成后自动续播
      document.addEventListener('pjax:send', function () {
        wasPlayingOnNav = !!(ap && !ap.audio.paused);
      });
      document.addEventListener('pjax:complete', function () {
        if (wasPlayingOnNav && ap && ap.audio.paused && !userPaused) {
          var r = ap.play();
          if (r && r.catch) r.catch(function () {});
        }
      });
      var saved = readState();
      if (saved && saved.src) restoreSaved(saved);
      else saveState();
    });
  }

  var CDN_BASE = 'https://cdn.jsdelivr.net/gh/MuAn1228/music-assets@master/';

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
        cover: s.cover, lrc: ''
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
        return { name: s.name, artist: s.artist, url: url, cover: s.cover, lrc: '' };
      });
  }

  // 暴露给音乐页大播放器的公共接口（全站唯一音频引擎）
  window.__blogMusic = {
    ap: null, // 播放器初始化后回填
    focus: function (track, meta, autoplay) {
      focusMeta = meta ? { owner: meta.owner, index: meta.index, url: track.url } : null;
      switchTo(track, autoplay);
      saveState();
    },
    toggle: function () { if (ap) ap.toggle(); },
    pause: function () { if (ap) ap.pause(); },
    play: function () { if (ap) { var p = ap.play(); if (p && p.catch) p.catch(function () {}); } },
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