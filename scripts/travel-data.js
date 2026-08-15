// ===== 旅行地图数据生成器 =====
// 扫描「旅行」分类下的文章，生成 /data/travel.json（已访问省份 + 篇数）
// 文章 front-matter 约定：categories 第一级 =「旅行」，第二级 = 省名（如 四川、云南）

hexo.extend.generator.register('travel-data', function (locals) {
  var counts = {};

  locals.posts.forEach(function (post) {
    var arr = [];
    if (post.categories) {
      arr = post.categories.data || post.categories.toArray ? post.categories.toArray() : [];
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
