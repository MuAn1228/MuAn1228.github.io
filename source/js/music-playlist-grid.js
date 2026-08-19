// ===== 音乐页顶部紫色横幅：内嵌网易云官方外链播放器（我喜欢的音乐） =====
// 将网易云官方播放器 iframe 注入到页面顶部页头（#page-site-info 之后），
// 歌单 2793973232（落别恨喜欢的音乐）共 394 首，由官方播放器展示与播放。
(function () {
  var header = document.getElementById('page-header');
  var info = document.getElementById('page-site-info');
  if (!header || !info) return;

  fetch('/data/music-playlist.json')
    .then(function (r) { return r.json(); })
    .then(function (songs) {
      var box = document.createElement('div');
      box.className = 'music-favs';
      box.innerHTML =
        '<div class="music-favs-header">' +
          '<i class="fas fa-heart music-favs-heart"></i>' +
          '<span class="music-favs-title">我喜欢的音乐</span>' +
          '<span class="music-favs-subtitle">共 ' + songs.length + ' 首</span>' +
        '</div>' +
        '<iframe class="music-favs-iframe" ' +
          'src="https://music.163.com/outchain/player?type=1&id=2793973232&auto=0&height=450" ' +
          'frameborder="no" border="0" marginwidth="0" marginheight="0" ' +
          'allowtransparency="true" scrolling="no"></iframe>';
      // 标记页头以放大紫色空间，并把模块排进标题下方
      header.classList.add('music-favs-host');
      info.appendChild(box);
    })
    .catch(function () {});
})();
