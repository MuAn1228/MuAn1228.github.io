// ===== 旅行地图（ECharts + 世界 GeoJSON，中国省份可点击 + 周边国家，气象图风格） =====
(function () {
  var GEOJSON = '/lib/china-world.json';
  var DATA_JSON = '/data/travel.json';
  var CATEGORY = '旅行';

  function shortName(full) {
    return full
      .replace('壮族自治区', '').replace('回族自治区', '')
      .replace('维吾尔自治区', '').replace('特别行政区', '')
      .replace('自治区', '').replace('省', '').replace('市', '');
  }

  // 植被/地形值（0-100）
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

      echarts.registerMap('china-world', geojson);

      // 中国省份数据（带 value 走渐变；已访问紫色）
      var chinaData = [];
      geojson.features.forEach(function (f) {
        var props = f.properties || {};
        if (!props.isChina) return;
        var full = props.name || '';
        var short = shortName(full);
        if (!short) return; // 跳过十段线（无名字）
        var v = TERRAIN_VALUE[full] != null ? TERRAIN_VALUE[full] : 50;
        if (visitedSet[short]) {
          chinaData.push({
            name: full, value: v, short: short,
            itemStyle: { areaColor: '#a97fd4', shadowColor: 'rgba(169,127,212,0.85)', shadowBlur: 16 }
          });
        } else {
          chinaData.push({ name: full, value: v, short: short });
        }
      });

      var chart = echarts.init(mount);
      chart.setOption({
        backgroundColor: '#a9c6e8',
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(26,26,46,0.92)',
          borderColor: 'transparent',
          textStyle: { color: '#fff', fontSize: 13 },
          formatter: function (p) {
            if (p.data && p.data.short) {
              var c = counts[p.data.short] || 0;
              return p.data.short + (c > 0 ? ' · ' + c + ' 篇' : ' · 未去过');
            }
            return p.name || '';
          }
        },
        visualMap: {
          show: false,
          min: 0,
          max: 100,
          seriesIndex: 0,
          inRange: { color: ['#d9c98d', '#c9c288', '#b0c486', '#86b06a', '#5c9c50', '#3d7a40'] }
        },
        geo: {
          map: 'china-world',
          center: [105, 35],
          zoom: 1.8,
          roam: true,
          scaleLimit: { min: 1, max: 8 },
          label: { show: false },
          itemStyle: {
            areaColor: '#e6e6e6',
            borderColor: '#ffffff',
            borderWidth: 1
          },
          emphasis: {
            label: { show: true, color: '#555', fontSize: 11 },
            itemStyle: { areaColor: '#d8d8d8' }
          }
        },
        series: [{
          type: 'map',
          geoIndex: 0,
          data: chinaData,
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1
          },
          emphasis: {
            label: { show: true, color: '#333', fontSize: 11, fontWeight: 'bold' },
            itemStyle: { areaColor: '#c9a8e8', shadowColor: 'rgba(169,127,212,0.9)', shadowBlur: 20 }
          }
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
