// ===== 旅行地图（ECharts + 中国 GeoJSON，卫星植被渐变风格） =====
// 仅在存在 #travel-map 的页面运行；点击已访问省份跳转到 /categories/旅行/<省名>/
(function () {
  var GEOJSON = '/lib/china.json';
  var DATA_JSON = '/data/travel.json';
  var CATEGORY = '旅行';

  // 全名 → 简称（GeoJSON 用全名，分类用简称）
  function shortName(full) {
    return full
      .replace('壮族自治区', '').replace('回族自治区', '')
      .replace('维吾尔自治区', '').replace('特别行政区', '')
      .replace('自治区', '').replace('省', '').replace('市', '');
  }

  // 植被/地形值（0-100，西部干旱低 → 南部热带高）
  var TERRAIN_VALUE = {
    '新疆维吾尔自治区': 8, '甘肃省': 12, '宁夏回族自治区': 18, '内蒙古自治区': 25,
    '青海省': 18, '西藏自治区': 15, '陕西省': 30, '山西省': 32,
    '黑龙江省': 62, '吉林省': 64, '辽宁省': 66,
    '北京市': 55, '天津市': 55, '河北省': 52, '山东省': 54,
    '河南省': 50, '安徽省': 56, '江苏省': 58, '上海市': 58,
    '湖北省': 60, '湖南省': 62, '重庆市': 60, '四川省': 58, '贵州省': 64,
    '浙江省': 68, '江西省': 66, '福建省': 70, '广东省': 74,
    '广西壮族自治区': 72, '云南省': 70, '海南省': 82,
    '台湾省': 74, '香港特别行政区': 80, '澳门特别行政区': 80
  };

  function init() {
    var mount = document.getElementById('travel-map');
    if (!mount) return;
    if (typeof echarts === 'undefined') return;

    Promise.all([
      fetch(GEOJSON).then(function (r) { return r.json(); }),
      fetch(DATA_JSON).then(function (r) { return r.json(); }).catch(function () { return { visited: [], counts: {} }; })
    ]).then(function (res) {
      var geojson = res[0];
      var data = res[1];
      var counts = data.counts || {};
      var visitedSet = {};
      (data.visited || []).forEach(function (n) { visitedSet[n] = true; });

      echarts.registerMap('china', geojson);

      var mapData = geojson.features.map(function (f) {
        var full = f.properties.name;
        var short = shortName(full);
        var v = TERRAIN_VALUE[full] != null ? TERRAIN_VALUE[full] : 50;
        if (visitedSet[short]) {
          return {
            name: full, value: v, short: short,
            itemStyle: { areaColor: '#a97fd4', shadowColor: 'rgba(169,127,212,0.85)', shadowBlur: 18 }
          };
        }
        return { name: full, value: v, short: short };
      });

      var chart = echarts.init(mount);
      chart.setOption({
        backgroundColor: '#14242e',
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(26, 26, 46, 0.92)',
          borderColor: 'transparent',
          textStyle: { color: '#fff', fontSize: 13 },
          formatter: function (p) {
            var short = p.data.short;
            var c = counts[short] || 0;
            return short + (c > 0 ? ' · ' + c + ' 篇' : ' · 未去过');
          }
        },
        visualMap: {
          show: false,
          min: 0,
          max: 100,
          inRange: { color: ['#d4c08a', '#c0c47a', '#94b870', '#6aa45c', '#468a48'] }
        },
        series: [{
          type: 'map',
          map: 'china',
          roam: true,
          scaleLimit: { min: 0.8, max: 5 },
          label: { show: false },
          itemStyle: {
            borderColor: '#3a4a56',
            borderWidth: 1,
            areaColor: '#94b870'
          },
          emphasis: {
            itemStyle: { areaColor: '#c9a8e8', shadowColor: 'rgba(169,127,212,0.9)', shadowBlur: 24 },
            label: { show: true, color: '#fff', fontSize: 12, fontWeight: 'bold' }
          },
          data: mapData
        }]
      });

      chart.on('click', function (p) {
        if (p.data && p.data.short && visitedSet[p.data.short]) {
          location.href = '/categories/' + encodeURIComponent(CATEGORY) + '/' + encodeURIComponent(p.data.short) + '/';
        }
      });

      window.addEventListener('resize', function () { chart.resize(); });
    }).catch(function () {
      mount.innerHTML = '<p style="text-align:center;color:#999;">地图加载失败，请刷新重试</p>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
