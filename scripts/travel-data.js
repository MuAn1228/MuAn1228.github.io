// ===== 旅行地图数据生成器 =====
// 扫描「旅行」分类文章 + 手动标记的省份，生成 /data/travel.json
// 文章 front-matter：categories 第一级「旅行」，第二级省名

// 手动标记的已访问省份（还没写文章时先亮起来）
// 陕西/浙江/江苏/上海 已有旅行文章（自动计数），此处仅保留无文章的手动标记
var MANUAL_VISITED = ['河北'];

function shortName(name) {
  return String(name || '').trim()
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/, '');
}

function postDate(value) {
  if (value && typeof value.format === 'function') return value.format('YYYY-MM-DD');
  var text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

hexo.extend.generator.register('travel-data', function (locals) {
  var counts = Object.create(null);
  var posts = Object.create(null);
  var seen = Object.create(null);
  var totalPosts = 0;
  var urlFor = hexo.extend.helper && hexo.extend.helper.get('url_for');
  var root = '/' + String(hexo.config.root || '/').replace(/^\/+|\/+$/g, '');
  if (!root.endsWith('/')) root += '/';

  // 足迹和文章数分开：已到访、尚未写游记的省份仍高亮，但没有虚构文章。
  MANUAL_VISITED.forEach(function (p) {
    var name = shortName(p);
    counts[name] = 0;
    posts[name] = [];
  });

  // 扫描文章
  locals.posts.forEach(function (post) {
    if (post.published === false || post.draft === true || post.layout === 'draft') return;
    var path = String(post.path || '').replace(/^\/+/, '');
    if (!path) return;
    var arr = [];
    if (post.categories && post.categories.data) {
      arr = post.categories.data;
    } else if (post.categories && post.categories.toArray) {
      arr = post.categories.toArray();
    }
    var travel = arr.find(function (c) { return c.name === '旅行' && !c.parent; });
    if (!travel) return;
    // Hexo 分类含父级 ID，可同时支持一篇文章归入多个省份；简单分类数据回退第二级。
    var provinces = travel._id
      ? arr.filter(function (c) { return c.parent && String(c.parent) === String(travel._id); })
      : (arr[0] === travel && arr[1] ? [arr[1]] : []);
    var names = new Set(provinces.map(function (c) { return shortName(c.name); }).filter(Boolean));
    if (!names.size) return;
    var url = urlFor ? urlFor.call(hexo, path, { relative: false }) : root + path;
    var entry = { title: String(post.title || ''), url: url, date: postDate(post.date) };
    var included = false;
    names.forEach(function (name) {
      if (!posts[name]) posts[name] = [];
      if (!seen[name]) seen[name] = new Set();
      if (seen[name].has(path)) return;
      seen[name].add(path);
      posts[name].push(entry);
      counts[name] = posts[name].length;
      included = true;
    });
    if (included) {
      if (!seen.total) seen.total = new Set();
      if (!seen.total.has(path)) {
        seen.total.add(path);
        totalPosts += 1;
      }
    }
  });

  Object.keys(posts).forEach(function (name) {
    posts[name].sort(function (a, b) {
      return b.date.localeCompare(a.date) || a.url.localeCompare(b.url);
    });
  });

  return {
    path: 'data/travel.json',
    data: JSON.stringify({ visited: Object.keys(counts), counts: counts, posts: posts, totalPosts: totalPosts })
  };
});
