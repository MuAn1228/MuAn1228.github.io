// ===== 旅行地图（Leaflet + 卫星底图 + 浅蓝海洋遮罩 + 周边国家灰色 + 中国卫星图） =====
(function () {
  var OCEAN = '/lib/ocean.json';
  var GEOJSON = '/lib/china-world.json';
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

    var map = L.map(mount, {
      center: [35, 105],
      zoom: 4,
      minZoom: 1,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
      worldCopyJump: true
    });

    // 卫星影像底图（高德卫星，中国部分透出）
    L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 10,
      tileSize: 256
    }).addTo(map);

    Promise.all([
      fetch(OCEAN).then(function (r) { return r.json(); }),
      fetch(GEOJSON).then(function (r) { return r.json(); }),
      fetch(DATA_JSON).then(function (r) { return r.json(); }).catch(function () { return { visited: [], counts: {} }; })
    ]).then(function (res) {
      var ocean = res[0];
      var geojson = res[1];
      var data = res[2];
      var counts = data.counts || {};
      var visitedSet = {};
      (data.visited || []).forEach(function (n) { visitedSet[n] = true; });

      // 浅蓝海洋遮罩（整个世界矩形挖掉各国，海洋涂成浅蓝）
      L.geoJSON(ocean, {
        style: { color: 'transparent', weight: 0, fillColor: '#A9C6E8', fillOpacity: 1 }
      }).addTo(map);

      // 国家 + 中国省份
      L.geoJSON(geojson, {
        style: function (feature) {
          var props = feature.properties || {};
          var isChina = props.isChina;
          var short = shortName(props.name || '');
          var visited = isChina && visitedSet[short];

          if (!isChina) {
            // 周边国家：浅灰（ECharts 风格）
            return { color: '#d0d0d0', weight: 1, fillColor: '#E6E6E6', fillOpacity: 1 };
          }
          if (visited) {
            // 已访问省份：紫色 + 发光
            return { color: '#b08fd9', weight: 2, fillColor: '#8e6bb5', fillOpacity: 0.55 };
          }
          // 未访问省份：透明（卫星图透出）
          return { color: 'rgba(255,255,255,0.5)', weight: 0.8, fillColor: 'transparent', fillOpacity: 0 };
        },
        onEachFeature: function (feature, layer) {
          var props = feature.properties || {};
          var short = shortName(props.name || '');
          var visited = props.isChina && visitedSet[short];
          if (visited) {
            layer.bindTooltip(short + (counts[short] > 1 ? ' · ' + counts[short] + ' 篇' : ''), { sticky: true });
            layer.on('click', function () {
              location.href = '/categories/' + encodeURIComponent(CATEGORY) + '/' + encodeURIComponent(short) + '/';
            });
            layer.on('add', function () {
              if (layer._path) layer._path.classList.add('province-visited');
            });
          }
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
