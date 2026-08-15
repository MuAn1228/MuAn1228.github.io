// ===== 旅行地图数据生成器 =====
// 扫描「旅行」分类文章 + 手动标记的省份，生成 /data/travel.json
// 文章 front-matter：categories 第一级「旅行」，第二级省名

// 手动标记的已访问省份（还没写文章时先亮起来）
var MANUAL_VISITED = ['河北', '陕西', '浙江', '江苏', '上海'];

hexo.extend.generator.register('travel-data', function (locals) {
  var counts = {};

  // 手动标记
  MANUAL_VISITED.forEach(function (p) { counts[p] = 1; });

  // 扫描文章
  locals.posts.forEach(function (post) {
    var arr = [];
    if (post.categories && post.categories.data) {
      arr = post.categories.data;
    } else if (post.categories && post.categories.toArray) {
      arr = post.categories.toArray();
    }
    var names = arr.map(function (c) { return c.name; });
    if (names[0] === '旅行' && names[1]) {
      counts[names[1]] = (counts[names[1]] || 0) + 1;
    }
  });

  return {
    path: 'data/travel.json',
    data: JSON.stringify({ visited: Object.keys(counts), counts: counts })
  };
});
