// ===== 旅行地图（Leaflet + 卫星影像底图 + 中国省份半透明叠加） =====
// 真实卫星云图感：底图是卫星影像，省份边界半透明叠加，已访问省份紫色高亮
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

    var map = L.map(mount, {
      center: [35, 105],
      zoom: 4,
      minZoom: 3,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true
    });

    // 卫星影像底图（高德卫星）
    L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
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
        style: function (feature) {
          var short = shortName((feature.properties && feature.properties.name) || '');
          var visited = visitedSet[short];
          return {
            color: visited ? '#b08fd9' : 'rgba(255,255,255,0.55)',
            weight: visited ? 2 : 1,
            fillColor: visited ? '#8e6bb5' : 'transparent',
            fillOpacity: visited ? 0.4 : 0,
            opacity: visited ? 0.95 : 0.5
          };
        },
        onEachFeature: function (feature, layer) {
          var short = shortName((feature.properties && feature.properties.name) || '');
          if (visitedSet[short]) {
            layer.bindTooltip(short + (counts[short] > 1 ? ' · ' + counts[short] + ' 篇' : ''), { sticky: true });
            layer.on('click', function () {
              location.href = '/categories/' + encodeURIComponent(CATEGORY) + '/' + encodeURIComponent(short) + '/';
            });
            layer.on('mouseover', function () { layer.setStyle({ fillOpacity: 0.55 }); });
            layer.on('mouseout', function () { layer.setStyle({ fillOpacity: 0.4 }); });
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
