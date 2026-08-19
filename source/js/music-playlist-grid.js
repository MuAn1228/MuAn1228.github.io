// ===== 音乐页顶部紫色区块：我喜欢的音乐（全量列表，可滚动） =====
// 读取 /data/music-playlist.json（由网易云公开歌单 2793973232 生成）
(function () {
  var listEl = document.getElementById('music-favs-list');
  if (!listEl) return;

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function render(songs) {
    var countEl = document.getElementById('music-favs-count');
    if (countEl) countEl.textContent = songs.length;
    listEl.innerHTML = songs.map(function (s, i) {
      var url = 'https://music.163.com/#/song?id=' + s.id;
      return '<a class="mf-row" href="' + url + '" target="_blank" rel="noopener">' +
        '<span class="mf-idx">' + (i + 1) + '</span>' +
        '<img class="mf-cover" src="' + esc(s.cover) + '" alt="" loading="lazy">' +
        '<span class="mf-meta">' +
        '<span class="mf-title">' + esc(s.name) + '</span>' +
        '<span class="mf-artist">' + esc(s.artist) + '</span>' +
        '</span>' +
        '</a>';
    }).join('');
  }

  fetch('/data/music-playlist.json')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {
      listEl.innerHTML = '<p style="color:#fff;text-align:center;padding:20px;">歌单加载失败</p>';
    });
})();
