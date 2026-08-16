// ===== Skills 桶：官方技术 Logo 下落 + 碰撞（Matter.js 物理引擎）=====
// 滚动到区块时才触发下落动画，点击可重放
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
      img.onload = img.onerror = function () {
        loaded++;
        if (loaded === TECHS.length) ready();
      };
      img.src = '/lib/logos/' + t.slug + '.svg';
      images[t.slug] = img;
    });

    var engine, bodies, pegs = [], started = false;

    function ready() {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !started) {
              start();
              io.disconnect();
            }
          });
        }, { threshold: 0.25 });
        io.observe(mount);
      } else {
        start();
      }
    }

    function start() {
      var Engine = Matter.Engine, Bodies = Matter.Bodies, Composite = Matter.Composite;
      engine = Engine.create();
      engine.gravity.y = 0.9;
      var WALL = 50;
      var ground = Bodies.rectangle(W / 2, H + WALL / 2 - 8, W + WALL * 2, WALL, { isStatic: true });
      var leftWall = Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
      var rightWall = Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
      Composite.add(engine.world, [ground, leftWall, rightWall]);

      // 高尔顿板钉子：中间的小圆圈，图标下落时碰撞弹跳
      var PEG_R = 8;
      pegs = [];
      for (var row = 0; row < 4; row++) {
        var py = 85 + row * 75;
        var startX = (row % 2 === 0) ? 40 : 85;
        for (var px = startX; px < W - 20; px += 90) {
          pegs.push(Bodies.circle(px, py, PEG_R, { isStatic: true }));
        }
      }
      Composite.add(engine.world, pegs);

      started = true;
      drop();

      (function render() {
        Engine.update(engine, 1000 / 60);
        ctx.clearRect(0, 0, W, H);
        // 钉子（高尔顿板圆圈）
        pegs.forEach(function (peg) {
          ctx.beginPath();
          ctx.arc(peg.position.x, peg.position.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fill();
        });
        // 桶底
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(0, H - 10, W, 10);
        bodies.forEach(function (b) {
          var x = b.position.x, y = b.position.y, r = b.circleRadius;
          var img = images[b.tech.slug];
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.stroke();
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

    // 重新掉落（点击重放）
    function drop() {
      if (!engine) return;
      var Bodies = Matter.Bodies, Composite = Matter.Composite;
      if (bodies) Composite.remove(engine.world, bodies);
      bodies = TECHS.map(function (t, i) {
        var x = 30 + Math.random() * (W - 60);
        var y = -RADIUS - 60 - (i % 5) * 45;
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
    }

    mount.addEventListener('click', function () {
      if (started) drop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
