// ===== 黑洞 GARGANTUA（可交互 hero 卡片版）=====
// 移植自 https://guitrj.github.io/BH+disk/
// 挂在展示页(/showcase/)顶部 #blackhole-hero 容器内：
//   - OrbitControls：左键旋转、右键平移、滚轮缩放
//   - 引力透镜 + 吸积盘 + 星空（Shader）
//   - Shader 已调亮，避免展示页内容看不清
(function () {
  if (!/\/showcase\/?($|\?|#)/.test(window.location.pathname)) return;

  document.documentElement.classList.add('page-showcase');

  var container = document.getElementById('blackhole-hero');
  if (!container) return;

  // 配置项（磁盘更大些、颜色更亮）
  var config = {
    blackHoleRadius: 1.0,
    diskInner: 3.0,
    diskOuter: 8.0
  };

  import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js').then(function (THREE) {
    var width = container.clientWidth || window.innerWidth;
    var height = container.clientHeight || window.innerHeight;

    var scene = new THREE.Scene();

    // 手动轨道控制状态：左键旋转、右键平移、滚轮缩放
    var target = new THREE.Vector3(0, 0.5, 0);
    // 初始相机放得更远，进入页面时黑洞看起来更小（可滚轮放大）
    var sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(0, 5, 55).sub(target));
    // 初始相机位置
    var camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
    camera.lookAt(target);

    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.className = 'blackhole-bg';
    container.appendChild(renderer.domElement);

    // 交互监听
    var dragBtn = null;
    var lastXY = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', function (e) {
      dragBtn = (e.button === 2) ? 'right' : 'left';
      lastXY.x = e.clientX; lastXY.y = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointerup', function () { dragBtn = null; });
    window.addEventListener('pointercancel', function () { dragBtn = null; });
    renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    renderer.domElement.addEventListener('pointermove', function (e) {
      if (!dragBtn) return;
      var dx = e.clientX - lastXY.x, dy = e.clientY - lastXY.y;
      lastXY.x = e.clientX; lastXY.y = e.clientY;
      if (dragBtn === 'left') {
        // 旋转
        sph.theta -= dx * 0.005;
        sph.phi -= dy * 0.005;
        // 允许从北极(phi≈0)一直转到南极(phi≈π)，不再卡在赤道附近
        sph.phi = Math.max(0.05, Math.min(Math.PI * 0.95, sph.phi));
      } else {
        // 平移：沿相机右/上方向平移目标点
        var fwd = new THREE.Vector3();
        var rightv = new THREE.Vector3();
        var upvv = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        rightv.crossVectors(fwd, camera.up).normalize();
        upvv.crossVectors(rightv, fwd).normalize();
        var s = 0.01 * (sph.radius / 13);
        target.add(rightv.multiplyScalar(-dx * s)).add(upvv.multiplyScalar(dy * s));
      }
    });
    renderer.domElement.addEventListener('wheel', function (e) {
      e.preventDefault();
      sph.radius *= (1 + (e.deltaY > 0 ? 1 : -1) * 0.08);
      sph.radius = Math.max(5, Math.min(60, sph.radius));
    }, { passive: false });

    var blackHoleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(width, height) },
        iCameraPos: { value: camera.position },
        iCameraDir: { value: new THREE.Vector3() },
        iCameraUp: { value: camera.up },
        iFov: { value: camera.fov },
        uDiskInner: { value: config.diskInner },
        uDiskOuter: { value: config.diskOuter },
        uBhRadius: { value: config.blackHoleRadius }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float iTime;',
        'uniform vec2 iResolution;',
        'uniform vec3 iCameraPos;',
        'uniform vec3 iCameraDir;',
        'uniform vec3 iCameraUp;',
        'uniform float iFov;',
        'uniform float uDiskInner;',
        'uniform float uDiskOuter;',
        'uniform float uBhRadius;',
        'varying vec2 vUv;',
        '',
        '#define MAX_STEPS 150',
        '#define MAX_DIST 150.0',
        '#define PI 3.14159265359',
        '',
        'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float hash3(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        'float noise(vec2 p) {',
        '  vec2 i = floor(p); vec2 f = fract(p);',
        '  f = f * f * (3.0 - 2.0 * f);',
        '  float a = hash(i); float b = hash(i + vec2(1.0,0.0));',
        '  float c = hash(i + vec2(0.0,1.0)); float d = hash(i + vec2(1.0,1.0));',
        '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
        '}',
        'float fbm(vec2 p) { float f=0.0; float w=0.5; float scale=1.0; for(int i=0;i<4;i++){ f+=w*noise(p*scale); scale*=2.0; w*=0.5; } return f; }',
        'vec3 getStarField(vec3 dir) {',
        '  vec3 col = vec3(0.0);',
        '  float theta = iTime * 0.012;',
        '  float cs = cos(theta); float sn = sin(theta);',
        '  mat2 rot = mat2(cs, -sn, sn, cs);',
        '  dir.xz = rot * dir.xz; dir.xy = rot * dir.xy;',
        '  for(float i=1.0; i<=2.0; i++) {',
        '    float scale = (i == 1.0) ? 20.0 : 45.0;',
        '    vec3 p = dir * scale;',
        '    vec3 id = floor(p); vec3 local = fract(p) - 0.5;',
        '    float seed = hash3(id + i * 123.45);',
        '    float threshold = (i == 1.0) ? 0.25 : 0.1;',
        '    if (seed > threshold) {',
        '      vec3 posOffset = vec3(fract(seed*12.5)-0.5, fract(seed*34.1)-0.5, fract(seed*56.7)-0.5) * 0.6;',
        '      float dist = length(local - posOffset);',
        '      float sizeBase = (i == 1.0) ? 0.05 : 0.03;',
        '      float size = sizeBase + 0.04 * fract(seed * 10.0);',
        '      float core = smoothstep(size, size * 0.2, dist);',
        '      float glow = exp(-dist * 8.0 / size) * 0.5;',
        '      float starShape = core + glow;',
        '      float pulseSpeed = 0.5 + 2.0 * fract(seed * 99.0);',
        '      float pulse = 0.6 + 0.4 * sin(iTime * pulseSpeed + seed * 6.28);',
        '      vec3 tint;',
        '      float colorSeed = fract(seed * 43.2);',
        '      if (colorSeed < 0.2) tint = vec3(0.4,0.7,1.0);',
        '      else if (colorSeed < 0.4) tint = vec3(0.6,0.9,1.0);',
        '      else if (colorSeed < 0.7) tint = vec3(1.0,0.95,0.8);',
        '      else if (colorSeed < 0.9) tint = vec3(1.0,0.7,0.4);',
        '      else tint = vec3(1.0,0.3,0.2);',
        '      float intensity = (i == 1.0) ? 3.5 : 1.8;',
        '      col += tint * starShape * pulse * intensity;',
        '    }',
        '  }',
        '  return col;',
        '}',
        'vec4 getDiskColor(vec3 pos, float distToCenter) {',
        '  if (distToCenter < uDiskInner - 0.1 || distToCenter > uDiskOuter + 1.0) return vec4(0.0);',
        '  float angle = atan(pos.z, pos.x);',
        '  float speed = 3.5 / (distToCenter * 0.5 + 0.1);',
        '  float rotAngle = angle + iTime * speed * 0.5;',
        '  float gas = fbm(vec2(distToCenter * 1.2, rotAngle * 3.5));',
        '  float ringPattern = sin(distToCenter * 5.0 + gas * 2.5);',
        '  ringPattern = smoothstep(-0.4, 0.94, ringPattern);',
        '  float intensity = (0.4 + 0.6 * gas) * (0.3 + 0.7 * ringPattern);',
        '  float outerFade = smoothstep(uDiskOuter, uDiskOuter - 3.0, distToCenter);',
        '  float innerFade = smoothstep(uDiskInner - 0.2, uDiskInner + 0.8, distToCenter);',
        '  vec3 colInner = vec3(1.0,0.98,0.95); vec3 colMid = vec3(1.0,0.7,0.3); vec3 colOuter = vec3(0.9,0.2,0.1);',
        '  float t = (distToCenter - uDiskInner) / (uDiskOuter - uDiskInner);',
        '  vec3 baseColor = mix(colInner, colMid, smoothstep(0.0,0.3,t));',
        '  baseColor = mix(baseColor, colOuter, smoothstep(0.3,1.0,t));',
        '  vec3 velocity = normalize(vec3(-pos.z, 0.0, pos.x));',
        '  vec3 viewDir = normalize(pos - iCameraPos);',
        '  float doppler = dot(velocity, viewDir);',
        '  float beam = 1.0 + doppler * 0.6; beam = max(0.2, beam);',
        '  vec3 shiftColor = baseColor;',
        '  if (doppler > 0.0) shiftColor += vec3(0.1,0.1,0.2) * doppler;',
        '  else shiftColor *= vec3(1.0,0.92,0.85);',
        '  float alpha = innerFade * outerFade * intensity;',
        '  return vec4(shiftColor * beam * 2.4, alpha);',
        '}',
        'void main() {',
        '  vec2 uv = vUv * 2.0 - 1.0;',
        '  uv.x *= iResolution.x / iResolution.y;',
        '  vec3 camPos = iCameraPos;',
        '  vec3 camDir = normalize(iCameraDir);',
        '  vec3 camRight = normalize(cross(camDir, iCameraUp));',
        '  vec3 camUp = cross(camRight, camDir);',
        '  float fovRad = iFov * PI / 180.0;',
        '  float focalLength = 1.0 / tan(fovRad * 0.5);',
        '  vec3 rayDir = normalize(camRight * uv.x + camUp * uv.y + camDir * focalLength);',
        '  vec3 currentPos = camPos;',
        '  vec3 currentDir = rayDir;',
        '  vec3 accColor = vec3(0.0);',
        '  float accAlpha = 0.0;',
        '  float glow = 0.0;',
        '  bool escaped = false;',
        '  for(int i = 0; i < MAX_STEPS; i++) {',
        '    float r = length(currentPos);',
        '    if (r < uBhRadius) { escaped = false; break; }',
        '    if (r > MAX_DIST) { escaped = true; break; }',
        '    float step = max(0.04, r * 0.08);',
        '    vec3 force = -normalize(currentPos) * (1.5 / (r * r));',
        '    currentDir += force * step;',
        '    currentDir = normalize(currentDir);',
        '    vec3 nextPos = currentPos + currentDir * step;',
        '    if ((currentPos.y > 0.0 && nextPos.y < 0.0) || (currentPos.y < 0.0 && nextPos.y > 0.0)) {',
        '      float tt = (0.0 - currentPos.y) / (nextPos.y - currentPos.y);',
        '      vec3 hitPos = currentPos + (nextPos - currentPos) * tt;',
        '      float hitDist = length(hitPos);',
        '      vec4 diskCol = getDiskColor(hitPos, hitDist);',
        '      if (diskCol.a > 0.0) {',
        '        float stepAlpha = diskCol.a * 0.8;',
        '        accColor += diskCol.rgb * (1.0 - accAlpha) * stepAlpha;',
        '        accAlpha += stepAlpha;',
        '      }',
        '    }',
        '    glow += 0.01 / (pow(r, 4.0) + 0.1);',
        '    currentPos = nextPos;',
        '    if (accAlpha > 0.98) { escaped = true; break; }',
        '  }',
        '  vec3 finalColor = accColor;',
        '  if (escaped) {',
        '    vec3 starColor = getStarField(currentDir);',
        '    finalColor += starColor * (1.0 - accAlpha);',
        '  }',
        '  vec3 glowColor = mix(vec3(1.0,0.6,0.3), vec3(0.5,0.85,1.0), 1.0/(glow+1.0));',
        '  finalColor += glowColor * glow * 0.04;',
        '  finalColor *= 1.05;',
        '  // 保持深空纯黑（还原 BH+disk 原始观感）',
        '  float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;',
        '  finalColor = clamp((finalColor * (a * finalColor + b)) / (finalColor * (c * finalColor + d) + e), 0.0, 1.0);',
        '  finalColor = pow(finalColor, vec3(1.0 / 2.2));',
        '  // 轻微暗角即可，不再过度压暗',
        '  float distFromCenter = length(uv);',
        '  finalColor *= smoothstep(1.9, 0.7, distFromCenter) * 0.82 + 0.18;',
        '  gl_FragColor = vec4(finalColor, 1.0);',
        '}'
      ].join('\n')
    });

    var geometry = new THREE.PlaneGeometry(2, 2);
    var mesh = new THREE.Mesh(geometry, blackHoleMaterial);
    mesh.frustumCulled = false;
    scene.add(mesh);

    var clock = new THREE.Clock();
    var shaderTime = 0;
    var camDir = new THREE.Vector3();

    function animate() {
      requestAnimationFrame(animate);
      if (document.visibilityState === 'hidden') { clock.getDelta(); return; } // 后台暂停
      var delta = clock.getDelta();
      shaderTime = (shaderTime || 0) + delta;
      // 由球坐标更新相机位置（轨道控制）
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(target);

      var u = blackHoleMaterial.uniforms;
      u.iTime.value = shaderTime;
      u.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
      u.iCameraPos.value.copy(camera.position);
      // 相机可能超出无穷平面，直接用 uniform
      camera.getWorldDirection(camDir);
      u.iCameraDir.value.copy(camDir);
      u.iCameraUp.value.copy(camera.up);
      renderer.render(scene, camera);
    }

    function onResize() {
      var w = container.clientWidth || window.innerWidth;
      var h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      blackHoleMaterial.uniforms.iFov.value = camera.fov;
      blackHoleMaterial.uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }
    window.addEventListener('resize', onResize);

    animate();
  }).catch(function () {
    // CDN 加载失败：降级为暗色渐变卡片
    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.inset = '0';
    div.style.background = 'radial-gradient(circle at 50% 40%, #2a3648 0%, #0b0e16 100%)';
    container.appendChild(div);
  });
})();