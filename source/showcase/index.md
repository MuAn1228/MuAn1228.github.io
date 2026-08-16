---
title: 展示
---

<div class="showcase">

<img class="showcase-avatar" src="/img/avatar.png" alt="Li Bohang">
<canvas id="showcase-name" class="particle-text" data-text="Li Bohang" data-color="#8e6bb5" aria-label="Li Bohang"></canvas>
<p class="showcase-sub">浙江理工大学 · 智能科学与技术 · 本科学生</p>

<section class="showcase-sec">
<h2>关于我</h2>

<p>从有记忆起，我就一直处于学生阶段。我喜欢了解不同领域的各种事物——只要是天下事，我都愿意了解一二。可以说，我是一个杂学家。</p>

<p>一岁半被送进幼儿园，小学接受着相对系统的快乐教育；中学因一次报名失误进了家附近的公办初中，又靠分配生政策进入全市最好的高中；最后高考失利来到现在的大学，连计算机专业都是靠转专业进来的。</p>

<p>我喜欢游戏，玩过的不下 200 款；会滑轮滑，做简单的健身；试过口琴，学过蛙泳；如今正迷上摄影，只是还没拥有第一台正式相机。</p>

<p>现在我在杭州就读计算机专业。虽没做出什么实质成果，但仅仅是生活在杭州这一点，已经让我很幸福。我的理想，是和爱的人在杭州度过余生，创作出更有价值的作品；我的梦想，是去中国科学院大学计算所攻读人工智能——虽然难，但仅仅是梦想。</p>
</section>

<section class="showcase-sec">
<h2>摄影</h2>

<p class="showcase-muted">正在入门，还没拥有第一台正式相机。下面是一些我喜欢的照片。</p>

<div class="showcase-photos">
<img src="/img/blog/img01.jpg" alt="照片">
<img src="/img/blog/img06.jpg" alt="照片">
<img src="/img/blog/img11.jpg" alt="照片">
<img src="/img/blog/img16.jpg" alt="照片">
<img src="/img/blog/img21.jpg" alt="照片">
<img src="/img/blog/img26.jpg" alt="照片">
</div>
</section>

<section class="showcase-sec">
<h2>编程之路</h2>

<ul class="showcase-list">
<li><strong>Python</strong>· 编程入门语言</li>
<li><strong>C</strong>· 数据结构课设「列车管理系统」</li>
<li><strong>C++</strong>· 面向对象</li>
<li><strong>Go</strong>· 基础，云原生方向</li>
<li><strong>Java</strong>· 下学期计划，第一个软件项目</li>
</ul>

<p class="showcase-muted">目标：成为一名全栈工程师，以后端为主。</p>
</section>

<section class="showcase-sec">
<h2>Skills</h2>
<div id="skills-bucket" class="skills-bucket"></div>
</section>

<section class="showcase-sec">
<h2>作品</h2>

<p>我目前的产出主要在 <a href="https://github.com/MuAn1228">GitHub</a> 仓库和 Obsidian 笔记里。</p>
<p class="showcase-muted">它们都还处于起步阶段，我并不满足于此。</p>
</section>

<section class="showcase-sec">
<h2>联系</h2>

<p class="showcase-links">
<a href="https://github.com/MuAn1228">GitHub</a>
<a href="mailto:libohang1228@163.com">邮箱</a>
<a href="https://wpa.qq.com/msgrd?v=3&uin=1420482988&site=qq&menu=yes">QQ</a>
<span>微信 lbh071031</span>
<a href="https://space.bilibili.com/424086446">B站</a>
<a href="https://www.zhihu.com/people/tian-tian-19-45-51">知乎</a>
<span>抖音 lbh071031</span>
</p>
</section>

</div>

<script>
(function () {
  function reveal() {
    var imgs = document.querySelectorAll('.showcase-photos img');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      imgs.forEach(function (img) { io.observe(img); });
    } else {
      imgs.forEach(function (img) { img.classList.add('revealed'); });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }
})();
</script>
