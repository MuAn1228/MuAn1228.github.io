// ===== 3D 地球（Three.js 自实现，复用博客已有的 three.min.js） =====
// 仅在存在 #travel-globe 的页面运行
(function () {
  var DATA_JSON = '/data/travel.json';
  var CATEGORY = '旅行';

  // 省会城市经纬度
  var CITY = {
    '北京': [39.90, 116.40], '天津': [39.13, 117.20], '河北': [38.04, 114.51],
    '山西': [37.87, 112.55], '内蒙古': [40.84, 111.75], '辽宁': [41.80, 123.43],
    '吉林': [43.82, 125.32], '黑龙江': [45.80, 126.53], '上海': [31.23, 121.47],
    '江苏': [32.06, 118.80], '浙江': [30.27, 120.15], '安徽': [31.82, 117.23],
    '福建': [26.07, 119.30], '江西': [28.68, 115.86], '山东': [36.65, 117.12],
    '河南': [34.75, 113.63], '湖北': [30.59, 114.31], '湖南': [28.23, 112.94],
    '广东': [23.13, 113.26], '广西': [22.82, 108.32], '海南': [20.04, 110.32],
    '重庆': [29.56, 106.55], '四川': [30.57, 104.07], '贵州': [26.65, 106.63],
    '云南': [24.88, 102.83], '西藏': [29.65, 91.14], '陕西': [34.34, 108.94],
    '甘肃': [36.06, 103.83], '青海': [36.62, 101.78], '宁夏': [38.49, 106.23],
    '新疆': [43.83, 87.62], '台湾': [25.03, 121.57], '香港': [22.32, 114.17],
    '澳门': [22.20, 113.55]
  };

  function init() {
    var mount = document.getElementById('travel-globe');
    if (!mount) return;
    if (typeof THREE === 'undefined') return;

    var W = mount.clientWidth || 600;
    var H = mount.clientHeight || 520;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 3.2;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    // 地球
    var earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ map: new THREE.TextureLoader().load('/img/earth.jpg'), shininess: 5 })
    );
    scene.add(earth);

    // 灯光
    scene.add(new THREE.AmbientLight(0x8899bb, 1.3));
    var dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    // 标记组（挂在 earth 上，随地球旋转）
    var markers = new THREE.Group();
    earth.add(markers);

    function latLngToVec(lat, lng, r) {
      var phi = (90 - lat) * Math.PI / 180;
      var theta = (lng + 180) * Math.PI / 180;
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }

    fetch(DATA_JSON)
      .then(function (r) { return r.json(); })
      .catch(function () { return { visited: [], counts: {} }; })
      .then(function (data) {
        var counts = data.counts || {};
        (data.visited || []).forEach(function (name) {
          var pos = CITY[name];
          if (!pos) return;
          var p = latLngToVec(pos[0], pos[1], 1.01);
          var glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xc9a8e8, transparent: true, opacity: 0.5 })
          );
          glow.position.copy(p);
          markers.add(glow);
          var core = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xe8d5ff })
          );
          core.position.copy(p);
          markers.add(core);
        });
      });

    // 初始让中国大致朝向相机（近似）
    earth.rotation.y = Math.PI * 1.1;

    // 渲染循环
    var autoRotate = false;
    function animate() {
      requestAnimationFrame(animate);
      if (autoRotate) earth.rotation.y += 0.0015;
      renderer.render(scene, camera);
    }
    animate();

    // 相机从太空推近动画
    var camStart = 3.2, camEnd = 2.05;
    var animStart = null;
    setTimeout(function () {
      animStart = performance.now();
      requestAnimationFrame(zoomStep);
    }, 600);
    function zoomStep(now) {
      var t = (now - animStart) / 2200;
      if (t > 1) t = 1;
      var e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      camera.position.z = camStart + (camEnd - camStart) * e;
      if (t < 1) {
        requestAnimationFrame(zoomStep);
      } else {
        autoRotate = true; // 推近后开始自转
      }
    }

    window.addEventListener('resize', function () {
      var w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
