// ===== Skills 桶：官方技术 Logo 下落 + 碰撞（Matter.js 物理引擎）=====
// 在展示页的 #skills-bucket 容器里渲染：官方 SVG logo 从上往下掉，落到桶里碰撞堆叠
(function () {
  var TECHS = [
    { slug: 'python', name: 'Python' },
    { slug: 'c', name: 'C' },
    { slug: 'cplusplus', name: 'C++' },
    { slug: 'go', name: 'Go' },
    { slug: 'openjdk', name: 'Java' },
    { slug: 'javascript', name: 'JavaScript' },
    { slug: 'react', name: 'React' },
    { slug: 'vuedotjs', name: 'Vue' },
    { slug: 'html5', name: 'HTML5' },
    { slug: 'css', name: 'CSS' },
    { slug: 'git', name: 'Git' },
    { slug: 'docker', name: 'Docker' },
    { slug: 'nodedotjs', name: 'Node.js' },
    { slug: 'linux', name: 'Linux' }
  ];

  function init() {
    var mount = document.getElementById('skills-bucket');
    if (!mount) return;
    if (typeof Matter === 'undefined') return;

    var W = 600;
    var H = 400;
    var RADIUS = 28;

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    mount.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    // 加载官方 logo 图片
    var images = {};
    var loaded = 0;
    TECHS.forEach(function (t) {
      var img = new Image();
      img.onload = function () {
        loaded++;
        if (loaded === TECHS.length) start();
      };
      img.onerror = function () {
        loaded++;
        if (loaded === TECHS.length) start();
      };
      img.src = '/lib/logos/' + t.slug + '.svg';
      images[t.slug] = img;
    });

    function start() {
      var Engine = Matter.Engine, Bodies = Matter.Bodies, Composite = Matter.Composite;
      var engine = Engine.create();
      engine.gravity.y = 1;

      // 桶：底部 + 左右壁（静态）
      var WALL = 50;
      var ground = Bodies.rectangle(W / 2, H + WALL / 2 - 8, W + WALL * 2, WALL, { isStatic: true });
      var leftWall = Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
      var rightWall = Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
      Composite.add(engine.world, [ground, leftWall, rightWall]);

      // 图标：随机 x 落点 + 轻微错开高度，让它们掉落时互相碰撞
      var bodies = TECHS.map(function (t, i) {
        var x = 30 + Math.random() * (W - 60);
        var y = -RADIUS - (i % 4) * 35;
        var b = Bodies.circle(x, y, RADIUS, {
          restitution: 0.6,
          friction: 0.1,
          density: 0.001,
          label: t.name
        });
        b.tech = t;
        return b;
      });
      Composite.add(engine.world, bodies);

      (function render() {
        Engine.update(engine, 1000 / 60);
        ctx.clearRect(0, 0, W, H);

        // 桶底
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(0, H - 10, W, 10);

        bodies.forEach(function (b) {
          var x = b.position.x;
          var y = b.position.y;
          var r = b.circleRadius;
          var img = images[b.tech.slug];

          // 白底圆（logo 衬底）
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.stroke();

          // 官方 logo（随物理体旋转）
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(b.angle);
            var s = r * 1.5;
            ctx.drawImage(img, -s / 2, -s / 2, s, s);
            ctx.restore();
          }
        });
        requestAnimationFrame(render);
      })();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
