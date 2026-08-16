// ===== 访客统计（Vercount）+ 排除站长自己 =====
(function () {
  var OWNER_KEY = 'blog_owner';

  // 访问 ?owner=1 一次即可标记本机为站长，之后本机访问不计入统计
  if (/[?&]owner=1(&|$)/.test(location.search)) {
    localStorage.setItem(OWNER_KEY, '1');
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
  }

  var isOwner = localStorage.getItem(OWNER_KEY) === '1';

  var footer = document.querySelector('#footer');
  if (!footer) return;

  var el = document.createElement('div');
  el.style.cssText = 'margin-top:8px;font-size:12px;color:#a99fc0;text-align:center;';
  if (isOwner) {
    el.textContent = '站长模式：本机访问不计入统计（用手机/无痕查看真实数据）';
  } else {
    el.innerHTML = '本站访问 <span id="vercount_value_site_pv">…</span> 次 · 访客 <span id="vercount_value_site_uv">…</span> 人';
  }
  footer.appendChild(el);

  // 非站长才加载 Vercount 脚本（加载即计数）
  if (!isOwner) {
    var s = document.createElement('script');
    s.src = 'https://events.vercount.one/js';
    s.defer = true;
    document.head.appendChild(s);
  }
})();
