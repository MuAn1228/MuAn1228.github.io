// ===== GitHub 贡献热力图（自渲染，数据源 github-contributions-api，更稳定） =====
(function () {
  var API = '/data/contributions.json';
  var COLORS = ['#ebedf0', '#d9c6ec', '#b79ad6', '#8e6bb5', '#5c4a7d'];
  var CELL = 10;   // 格子大小
  var GAP = 3;     // 格子间距
  var WEEKS = 53;  // 显示周数（约一年）

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function render(container, data) {
    var map = {};
    data.contributions.forEach(function (c) { map[c.date] = c; });

    var end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - end.getDay()); // 对齐到本周日
    var start = new Date(end);
    start.setDate(start.getDate() - (WEEKS - 1) * 7);

    // 月份标签
    var months = [];
    var lastMonth = -1;
    var cells = [];
    for (var i = 0; i < WEEKS * 7; i++) {
      var d = new Date(start);
      d.setDate(d.getDate() + i);
      var key = dateKey(d);
      var c = map[key];
      cells.push({ date: d, level: c ? c.level : 0, count: c ? c.count : 0 });
      if (d.getDay() === 0 && d.getMonth() !== lastMonth) {
        months.push({ week: Math.floor(i / 7), label: (d.getMonth() + 1) + '月' });
        lastMonth = d.getMonth();
      }
    }

    var html = '<div class="gh-graph">';
    // 月份行
    html += '<div class="gh-months">';
    months.forEach(function (m) {
      html += '<span style="left:' + (30 + m.week * (CELL + GAP)) + 'px;">' + m.label + '</span>';
    });
    html += '</div>';
    // 网格
    var dayLabels = ['日', '', '二', '', '四', '', '六'];
    for (var row = 0; row < 7; row++) {
      html += '<div class="gh-row">';
      html += '<span class="gh-day">' + dayLabels[row] + '</span>';
      for (var week = 0; week < WEEKS; week++) {
        var cell = cells[week * 7 + row];
        var color = COLORS[cell.level];
        var t = cell.date.getFullYear() + '-' + pad(cell.date.getMonth() + 1) + '-' + pad(cell.date.getDate()) + '：' + cell.count + ' 次提交';
        html += '<span class="gh-cell" style="background:' + color + ';" title="' + t + '"></span>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 图例
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

    recentPosts.appendChild(section); // 插到文章栏最下面

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
