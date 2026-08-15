// ===== GitHub 贡献热力图（自渲染，数据源 source/data/contributions.json，与 GitHub 周结构一致） =====
(function () {
  var API = '/data/contributions.json';
  var COLORS = ['#ebedf0', '#d9c6ec', '#b79ad6', '#8e6bb5', '#5c4a7d'];
  var CELL = 10;
  var GAP = 3;

  function render(container, data) {
    var weeks = data.weeks || [];

    // 月份标签（按每周第一天的月份）
    var months = [];
    var lastMonth = -1;
    weeks.forEach(function (week, wi) {
      var first = week.days && week.days[0];
      if (!first) return;
      var m = new Date(first.date + 'T00:00:00').getMonth();
      if (m !== lastMonth) {
        months.push({ week: wi, label: (m + 1) + '月' });
        lastMonth = m;
      }
    });

    var html = '<div class="gh-graph">';
    html += '<div class="gh-months">';
    months.forEach(function (m) {
      html += '<span style="left:' + (30 + m.week * (CELL + GAP)) + 'px;">' + m.label + '</span>';
    });
    html += '</div>';

    var dayLabels = ['日', '', '二', '', '四', '', '六'];
    for (var row = 0; row < 7; row++) {
      html += '<div class="gh-row">';
      html += '<span class="gh-day">' + dayLabels[row] + '</span>';
      for (var wi = 0; wi < weeks.length; wi++) {
        var day = weeks[wi].days && weeks[wi].days[row];
        if (day) {
          var color = COLORS[day.level] || COLORS[0];
          var t = day.date + '：' + day.count + ' 次提交';
          html += '<span class="gh-cell" style="background:' + color + ';" title="' + t + '"></span>';
        } else {
          html += '<span class="gh-cell" style="background:transparent;"></span>';
        }
      }
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="gh-legend"><span>少</span>';
    COLORS.forEach(function (c) {
      html += '<span class="gh-cell" style="background:' + c + ';"></span>';
    });
    html += '<span>多</span></div>';

    container.innerHTML = html;
  }

  function init() {
    var recentPosts = document.querySelector('#recent-posts');
    var home = document.querySelector('#page-header.full_page');
    if (!recentPosts || !home) return;
    if (document.getElementById('github-heatmap')) return;

    var section = document.createElement('div');
    section.id = 'github-heatmap';
    section.className = 'github-heatmap-wrap';
    section.innerHTML = '<div class="item-headline"><i class="fab fa-github"></i><span>GitHub 贡献</span></div><div class="gh-calendar">加载中…</div>';

    recentPosts.appendChild(section);

    var container = section.querySelector('.gh-calendar');
    fetch(API)
      .then(function (r) { return r.json(); })
      .then(function (data) { render(container, data); })
      .catch(function () { container.innerHTML = 'GitHub 贡献数据加载失败，请稍后刷新'; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
