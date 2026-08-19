// ===== 分页优化：页数不多时显示全部页码按钮 =====
// 覆盖 Hexo 内置 paginator helper：
// - 当总页数 <= SHOW_ALL_MAX 时强制 show_all，避免首页 4 页时出现
//   "1 2 … 4"（第一页看不到第 3 页）、"1 … 3 4"（第四页看不到第 2 页）的隐藏情况；
// - 页数较多时沿用默认的省略号分页，防止分页条过长。
const defaultPaginator = require('hexo/dist/plugins/helper/paginator');

var SHOW_ALL_MAX = 8;

hexo.extend.helper.register('paginator', function (options) {
  var opts = Object.assign({}, options);
  var total = opts.total || (this.page && this.page.total) || 1;
  if (total <= SHOW_ALL_MAX) {
    opts.show_all = true;
  }
  return defaultPaginator.call(this, opts);
});
