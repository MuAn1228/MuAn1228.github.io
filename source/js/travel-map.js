// ===== 旅行地图（中国省份可点击） =====
// 仅在存在 #travel-map 的页面运行；点击已访问省份跳转到该省分类页 /categories/旅行/<省名>/
(function () {
  var MAP_SVG = '/lib/china.svg';
  var DATA_JSON = '/data/travel.json';
  var CATEGORY = '旅行';

  // 省份 id（pXX）→ 中文名。注意：此 SVG 用 pHJ 表示黑龙江（非标准 ISO 的 pHL）
  var PROVINCES = {
    pAH: '安徽', pBJ: '北京', pCQ: '重庆', pFJ: '福建', pGD: '广东', pGS: '甘肃',
    pGX: '广西', pGZ: '贵州', pHA: '河南', pHB: '湖北', pHE: '河北', pHI: '海南',
    pHJ: '黑龙江', pHK: '香港', pHN: '湖南', pJL: '吉林', pJS: '江苏', pJX: '江西',
    pLN: '辽宁', pMO: '澳门', pNM: '内蒙古', pNX: '宁夏', pQH: '青海', pSC: '四川',
    pSD: '山东', pSH: '上海', pSN: '陕西', pSX: '山西', pTJ: '天津', pTW: '台湾',
    pXJ: '新疆', pXZ: '西藏', pYN: '云南', pZJ: '浙江'
  };

  function init() {
    var mount = document.getElementById('travel-map');
    if (!mount) return;

    // 悬浮提示框
    var tip = document.createElement('div');
    tip.className = 'travel-tooltip';
    document.body.appendChild(tip);
    function showTip(text, x, y) {
      tip.textContent = text;
      tip.classList.add('show');
      var tw = tip.offsetWidth;
      var left = x + 14;
      if (left + tw > window.innerWidth - 8) left = x - tw - 14;
      tip.style.left = left + 'px';
      tip.style.top = (y + 16) + 'px';
    }
    function hideTip() { tip.classList.remove('show'); }

    fetch(MAP_SVG)
      .then(function (r) { return r.text(); })
      .then(function (svgText) {
        mount.innerHTML = svgText;
        var svg = mount.querySelector('svg');
        if (svg) {
          var vw = svg.getAttribute('width') || '1000';
          var vh = svg.getAttribute('height') || '850';
          svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }

        // 给每个省份元素加 class（path 或 g 两种结构）
        Object.keys(PROVINCES).forEach(function (code) {
          var el = mount.querySelector('#' + code);
          if (el) el.classList.add('cn-province');
        });

        // 读取已访问省份
        fetch(DATA_JSON)
          .then(function (r) { return r.json(); })
          .catch(function () { return { visited: [], counts: {} }; })
          .then(function (data) {
            var counts = data.counts || {};
            Object.keys(PROVINCES).forEach(function (code) {
              var name = PROVINCES[code];
              var el = mount.querySelector('#' + code);
              if (!el) return;
              var count = counts[name] || 0;

              if (count > 0) {
                el.classList.add('visited');
                el.addEventListener('click', function () {
                  location.href = '/categories/' + encodeURIComponent(CATEGORY) + '/' + encodeURIComponent(name) + '/';
                });
              }

              el.addEventListener('mousemove', function (e) {
                showTip(count > 0 ? (name + ' · ' + count + ' 篇') : name, e.clientX, e.clientY);
              });
              el.addEventListener('mouseleave', hideTip);
            });
          });
      })
      .catch(function () {
        mount.innerHTML = '<p style="text-align:center;color:#999;">地图加载失败，请刷新重试</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
