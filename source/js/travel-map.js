// ===== 旅行地图（高德标准地图底图 + 已访问省份紫色高亮） =====
(function () {
  var GEOJSON = '/lib/china.json';
  var DATA_JSON = '/data/travel.json';
  var CATEGORY = '旅行';

  function shortName(full) {
    return full
      .replace('壮族自治区', '').replace('回族自治区', '')
      .replace('维吾尔自治区', '').replace('特别行政区', '')
      .replace('自治区', '').replace('省', '').replace('市', '');
  }

  function init() {
    var mount = document.getElementById('travel-map');
    if (!mount) return;
    if (typeof L === 'undefined') return;

    // 单张世界地图，禁止跨日期线重复，禁止无限横向滑动
    var map = L.map(mount, {
      center: [34, 104],
      zoom: 4,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
      worldCopyJump: false,
      maxBounds: [[-85, -190], [85, 190]],
      maxBoundsViscosity: 1.0
    });

    // 高德标准地图（浅蓝海洋 + 行政区划，干净）
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 10,
      tileSize: 256
    }).addTo(map);

    Promise.all([
      fetch(GEOJSON).then(function (r) { return r.json(); }),
      fetch(DATA_JSON).then(function (r) { return r.json(); }).catch(function () { return { visited: [], counts: {} }; })
    ]).then(function (res) {
      var geojson = res[0];
      var data = res[1];
      var counts = data.counts || {};
      var visitedSet = {};
      (data.visited || []).forEach(function (n) { visitedSet[n] = true; });

      L.geoJSON(geojson, {
        filter: function (feature) {
          var short = shortName((feature.properties && feature.properties.name) || '');
          return visitedSet[short]; // 只渲染已访问省份
        },
        style: function () {
          return { color: '#b08fd9', weight: 1.5, fillColor: '#8e6bb5', fillOpacity: 0.5 };
        },
        onEachFeature: function (feature, layer) {
          var short = shortName((feature.properties && feature.properties.name) || '');
          layer.bindTooltip(short + (counts[short] > 1 ? ' · ' + counts[short] + ' 篇' : ''), { sticky: true });
          layer.on('click', function () {
            location.href = '/categories/' + encodeURIComponent(CATEGORY) + '/' + encodeURIComponent(short) + '/';
          });
          layer.on('add', function () {
            if (layer._path) layer._path.classList.add('province-visited');
          });
        }
      }).addTo(map);
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
