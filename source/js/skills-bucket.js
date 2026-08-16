// ===== Skills 桶：技术图标下落 + 碰撞（Matter.js 物理引擎）=====
// 在展示页的 #skills-bucket 容器里渲染：技术图标从上往下掉，落到桶里碰撞堆叠
(function () {
  var TECHS = [
    { name: 'Python', color: '#3776AB' },
    { name: 'C', color: '#555555' },
    { name: 'C++', color: '#00599C' },
    { name: 'Go', color: '#00ADD8' },
    { name: 'Java', color: '#e8912d' },
    { name: 'Git', color: '#F05032' },
    { name: 'Hexo', color: '#0E83CD' },
    { name: 'JS', color: '#d4b106' },
    { name: 'React', color: '#53c1de' },
    { name: 'Vue', color: '#4FC08D' },
    { name: 'Linux', color: '#6b7280' },
    { name: 'Docker', color: '#2496ED' }
  ];

  function init() {
    var mount = document.getElementById('skills-bucket');
    if (!mount) return;
    if (typeof Matter === 'undefined') return;

    var W = 600;
    var H = 360;
    var RADIUS = 26;

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    mount.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var Engine = Matter.Engine, Bodies = Matter.Bodies, Composite = Matter.Composite;
    var engine = Engine.create();
    engine.gravity.y = 1;

    // 桶：底部 + 左右壁（静态）
    var WALL = 50;
    var ground = Bodies.rectangle(W / 2, H + WALL / 2 - 8, W + WALL * 2, WALL, { isStatic: true });
    var leftWall = Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
    var rightWall = Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
    Composite.add(engine.world, [ground, leftWall, rightWall]);

    // 图标（圆，从顶部上方错开掉落）
    var bodies = TECHS.map(function (t, i) {
      var x = W / (TECHS.length + 1) * (i + 1) + (i % 3 - 1) * 8;
      var y = -RADIUS - i * 45;
      var b = Bodies.circle(x, y, RADIUS, {
        label: t.name,
        restitution: 0.45,
        friction: 0.05,
        render: { fillStyle: t.color }
      });
      b.tech = t;
      return b;
    });
    Composite.add(engine.world, bodies);

    // 渲染循环
    (function render() {
      Engine.update(engine, 1000 / 60);
      ctx.clearRect(0, 0, W, H);

      // 桶底（地面线）
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, H - 10, W, 10);

      bodies.forEach(function (b) {
        var x = b.position.x, y = b.position.y;
        var r = b.circleRadius;
        var t = b.tech;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.name, x, y);
      });
      requestAnimationFrame(render);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
