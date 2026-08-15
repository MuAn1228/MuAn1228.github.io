// ===== GitHub 统计卡（自渲染，数据源 source/data/github-stats.json） =====
(function () {
  var API = '/data/github-stats.json';

  function stat(label, val) {
    return '<div class="gh-stat">' +
      '<div class="gh-stat-num">' + val + '</div>' +
      '<div class="gh-stat-label">' + label + '</div>' +
      '</div>';
  }

  function init() {
    var mount = document.getElementById('github-stats');
    if (!mount) return;
    fetch(API)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        mount.innerHTML =
          '<div class="gh-stats-grid">' +
          stat('关注者', d.followers) +
          stat('关注', d.following) +
          stat('仓库', d.repos) +
          stat('今年贡献', d.contributions) +
          '</div>';
      })
      .catch(function () {
        mount.innerHTML = '<p style="text-align:center;color:#999;margin:0;">统计加载失败</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
