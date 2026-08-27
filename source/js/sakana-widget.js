/*!
 * sakana-widget.js
 * 看板娘 Sakana 式物理包装层（UI / 交互 / 生命周期）。
 *
 * 思路（方案 B）：不替换现有 Live2D 渲染，仅给 #waifu 外包一个 fixed 定位的
 * 物理包装层：
 *   #mu-sakana-wrap             —— fixed 定位外壳（延续原 #waifu 的右下角定位）
 *     .mu-sakana-physics        —— 承担 translate3d/rotate 物理变换（transform-origin 底部）
 *       .mu-sakana-base         —— 立牌底座视觉（跟随轻微摆动）
 *       #waifu(原看板娘节点)     —— 保持原有 DOM/scale/hover/工具栏逻辑不被破坏
 *
 * 交互：Pointer Events（鼠标+触摸）拖拽 → 弹簧回弹 → 惯性摆动 → 静止停 rAF。
 * 自动模式：随机间隔小冲量，克制且暂停于用户操作时可立即恢复。
 * 生命周期：等待 #waifu 出现后注入；PJAX/页面切换不重建（#waifu 在 body 上只创建一次）；
 *           document.hidden 与 #waifu-hidden 时暂停物理、停 rAF，零空转。
 */
(function () {
  'use strict';

  const CFG = {
    // ---- 通用开关 ----
    enabled: true,

    // ---- 位移上限（px）。会被 resize 联动地按角色/视口尺寸缩放 —— 见 computeLimits() ----
    maxX: 96, // 最大水平偏移
    maxY: 48, // 最大垂直偏移（比水平小，避免把角色甩上天）
    maxRotationDeg: 16, // 目标最大倾斜角（度）；硬上限为其 1.6 倍

    // ---- 弹簧参数（K 越大回弹越硬，D 越大越早停）----
    springK: 90,
    springD: 11,
    mass: 1,

    // ---- 自动模式（默认开启且克制：3.5~8s 一次小晃动）----
    autoMode: true,
    autoMinInterval: 3500, // ms
    autoMaxInterval: 8000, // ms
    autoForce: 26, // 每次冲量的速度分量上限(px/s)，较小避免甩飞
    autoForceRot: 0.12, // 每次冲量的旋转速度增量上限(rad/s)

    // ---- 拖拽跟手感 ----
    maxDragSpeed: 2600, // 松手瞬时的速度上限，防甩得过于生猛

    // ---- 响应式 ----
    minVisualWidth: 40, // 角色可视宽度的下限参考（位移由它比例化）
  };

  /* ---------------- 工具 ---------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const clampAbs = (v, lim) => clamp(v, -lim, lim);
  const rad = (d) => (d * Math.PI) / 180;
  const $ = (id) => document.getElementById(id);

  /* ---------------- 物理实例（延迟到 #waifu 找到后创建） ---------------- */
  let body = null; // MuSakanaPhysics.SpringBody
  let wrap = null; // 外壳元素
  let physicsEl = null; // 变换层
  let waifuEl = null; // 原 #waifu
  let wrapStyle = null;
  let physStyle = null;

  let running = false; // 是否处于 rAF 循环
  let rafId = 0;
  let lastTs = 0;

  // 当前已包装的 #waifu 节点（用于幂等 + 节点替换后重新包装）
  let wrappedWaifu = null;
  let physicsMissing = false;

  // 拖拽状态
  let dragging = false;
  let dragPointer = -1;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragLastX = 0;
  let dragLastY = 0;
  let dragPrevX = 0;
  let dragPrevY = 0;

  // 自动模式
  let autoTimer = 0;
  let autoDelay = 0;

  // 极限值（resize 联动）
  let LIM = { maxX: CFG.maxX, maxY: CFG.maxY, maxRot: rad(CFG.maxRotationDeg) };

  /* 根据角色可视宽度与视口尺寸动态校准位移/旋转上限 */
  function computeLimits() {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // 角色可视宽度（优先取 canvas #live2d 的渲染矩形，它已经包含 #waifu 的 scale）
    let visualW = CFG.minVisualWidth;
    const visualEl = $('live2d') || $('waifu-canvas');
    try {
      let r = null;
      if (visualEl && visualEl.getBoundingClientRect) r = visualEl.getBoundingClientRect();
      if ((!r || !r.width) && waifuEl) r = waifuEl.getBoundingClientRect();
      if (r && r.width > 0) visualW = r.width;
    } catch (e) { /* 忽略 */ }
    // 桌面角色 ~120px 宽 → maxX ≈ 0.8 倍可视宽；按视口再兜底一个比例上限
    const maxX = clamp(visualW * 0.8, 40, Math.round(vw * 0.18));
    const maxY = clamp(visualW * 0.42, 22, Math.round(vh * 0.14));
    const maxRot = rad(clamp(CFG.maxRotationDeg * (maxX / CFG.maxX), 8, CFG.maxRotationDeg));
    LIM = { maxX, maxY, maxRot };
    if (body) {
      body.maxX = maxX;
      body.maxY = maxY;
      body.maxRot = maxRot;
      body.rotClamp = maxRot * 1.6;
    }
  }

  /* ---------------- 包装 DOM ---------------- */
  function buildWrapper() {
    wrap = document.createElement('div');
    wrap.id = 'mu-sakana-wrap';
    wrap.className = 'mu-sakana-wrap'; // 定位/尺寸/z-index/touch-action 全在 sakana.css
    wrap.style.pointerEvents = 'none'; // 兜底：整个外壳不拦点击

    physicsEl = document.createElement('div');
    physicsEl.className = 'mu-sakana-physics'; // 变换原点等全部在 sakana.css

    const base = document.createElement('div');
    base.className = 'mu-sakana-base'; // 立牌底座视觉（跟随物理层轻微摆动）

    // 把原 #waifu 移入物理层。
    // 关键：原主题给 #waifu 写死了 right:60px/bottom:0 且带 !important，
    // 必须用 setProperty(..,'important') 覆盖，否则会二次偏移。
    waifuEl = $('waifu');
    if (!waifuEl) return false;
    waifuEl.style.position = 'relative';
    waifuEl.style.setProperty('left', 'auto', 'important');
    waifuEl.style.setProperty('right', 'auto', 'important');
    waifuEl.style.setProperty('bottom', 'auto', 'important');
    waifuEl.style.transformOrigin = 'bottom right'; // 保留 scale 的锚点
    waifuEl.style.pointerEvents = 'auto'; // 只让角色本体可交互

    physicsEl.appendChild(base);
    physicsEl.appendChild(waifuEl);
    wrap.appendChild(physicsEl);
    document.body.appendChild(wrap);

    wrappedWaifu = waifuEl;
    wrapStyle = wrap.style;
    physStyle = physicsEl.style;
    return true;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const s = body;
    physStyle.transform =
      'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0) ' +
      'rotate(' + s.rot.toFixed(4) + 'rad)';
  }

  function tick(ts) {
    rafId = 0; // 本帧结束时重排
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 1 / 60;
    lastTs = ts;

    // 拖拽中：位置直接追手指（跟手），速度由位移差分估算（供松手甩动）
    if (dragging) {
      const cx = clampAbs(dragStartX + (dragLastX - dragStartX), LIM.maxX);
      const cy = clampAbs(dragStartY + (dragLastY - dragStartY), LIM.maxY);
      // 速度估算：用短滑窗平均减少抖动
      const instVX = (cx - dragPrevX) / dt;
      const instVY = (cy - dragPrevY) / dt;
      const f = 0.5;
      body.vx = body.vx + (instVX - body.vx) * f;
      body.vy = body.vy + (instVY - body.vy) * f;
      // 硬限速，防甩得过猛
      body.vx = clampAbs(body.vx, CFG.maxDragSpeed);
      body.vy = clampAbs(body.vy, CFG.maxDragSpeed);
      dragPrevX = cx;
      dragPrevY = cy;

      body.x = cx;
      body.y = cy;
      body.tx = 0;
      body.ty = 0;
      // 拖拽时倾斜映射：横向速度/位移合成目标旋转（速度越快倾角越大）
      const rotTarget = clampAbs(-(cx / LIM.maxX) * 0.72 - body.vx * 0.0009, LIM.maxRot);
      body.rot += (rotTarget - body.rot) * clamp(dt * 14, 0, 1);
      body.vr = (rotTarget - body.rot) * 8;
    }
    // 弹簧积分（含自动冲量产生的位置回弹）
    body.step(dt);
    render();

    // 静止判定：无拖拽且能量足够小 → 停 rAF，节省 CPU
    if (!dragging && body.isAtRest()) {
      running = false;
      lastTs = 0;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function ensureLoop() {
    if (running || !body) return;
    running = true;
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }

  /* ---------------- 拖拽（Pointer Events：鼠标 + 触摸） ---------------- */
  function onPointerDown(e) {
    if (!body) return;
    // 不拦截工具栏按钮、气泡里的可点元素（原功能）
    const t = e.target;
    if (t && t.closest && t.closest('#waifu-tool, .mu-sakana-base')) return;
    // 只在角色本体/物理层上启动（排除 toggle 等体外元素）
    if (wrap && !wrap.contains(t)) return;
    if (e.button != null && e.button !== 0) return; // 仅主键

    dragging = true;
    dragPointer = e.pointerId;
    dragStartX = body.x;
    dragStartY = body.y;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    dragPrevX = dragStartX;
    dragPrevY = dragStartY;
    pauseAuto(true);
    try { wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (e.cancelable) e.preventDefault();
    ensureLoop();
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== dragPointer) return;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== dragPointer) return;
    dragging = false;
    dragPointer = -1;
    try { wrap.releasePointerCapture && wrap.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    // 松手：把拖拽速度留给弹簧（保留惯性甩动），目标归位
    if (body) {
      body.tx = 0;
      body.ty = 0;
    }
    resumeAuto();
  }

  function bindDrag() {
    if (!wrap || !physStyle) return;
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);
    // touch-action: none 已由 sakana.css 的 .mu-sakana-wrap 提供（防触摸拖拽带动页面滚动）
  }

  /* ---------------- 自动模式（克制的小晃动） ---------------- */
  function scheduleAuto() {
    if (!CFG.autoMode || !body) return;
    autoDelay = CFG.autoMinInterval + Math.random() * (CFG.autoMaxInterval - CFG.autoMinInterval);
    autoTimer = setTimeout(doAuto, autoDelay);
  }

  function doAuto() {
    autoTimer = 0;
    if (!CFG.autoMode || !body || dragging) return;
    const mag = CFG.autoForce * (0.5 + Math.random());
    const dir = Math.random() < 0.5 ? -1 : 1;
    body.applyImpulse(dir * mag * (0.4 + Math.random() * 0.6), -mag * 0.35, dir * CFG.autoForceRot * Math.random());
    ensureLoop();
    scheduleAuto();
  }

  function pauseAuto(hard) {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
    if (hard) autoDelay = 0; // 用户操作期间停止自动节奏（松手后重新计时）
  }

  function resumeAuto() {
    if (!CFG.autoMode) return;
    setTimeout(scheduleAuto, 600 + Math.random() * 1200); // 稍候再开始，避免与回弹打架
  }

  /* ---------------- 生命周期 ---------------- */
  function onVisibility() {
    if (document.hidden) {
      // 页面隐藏 → 立刻暂停物理循环（但保留拖拽状态还原，防卡死）
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      running = false;
      lastTs = 0;
      pauseAuto(false);
    } else {
      if (body && !body.isAtRest()) ensureLoop();
      if (CFG.autoMode && !autoTimer && !dragging) scheduleAuto();
    }
  }

  function onResize() {
    computeLimits();
    if (body && !dragging && body.isAtRest()) render(); // 位置不变，无需重开 rAF
  }

  // 观察 #waifu 是否被设置为 waifu-hidden（quit）→ 立即归位
  function watchHidden() {
    if (!waifuEl || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(function (muts) {
      for (let i = 0; i < muts.length; i++) {
        if (muts[i].type === 'attributes' && muts[i].attributeName === 'class') {
          handleWaifuClass();
          break;
        }
      }
    });
    obs.observe(waifuEl, { attributes: true, attributeFilter: ['class'] });
  }

  function handleWaifuClass() {
    if (waifuEl && waifuEl.classList.contains('waifu-hidden')) {
      pauseAuto(true);
      if (body) body.reset();
      if (running) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        running = false;
        lastTs = 0;
      }
      if (physicsEl) physicsEl.style.transform = 'translate3d(0,0,0)rotate(0rad)';
    } else if (waifuEl && CFG.autoMode && !autoTimer && !dragging) {
      scheduleAuto();
    }
  }

  function init() {
    if (physicsMissing) return;
    const found = $('waifu');
    if (!found) return; // 用户可能 quit 过（waifu-disabled），正常跳过
    if (found === wrappedWaifu) return; // 幂等：同一个节点只包一次
    if (wrappedWaifu) teardown(); // 出现了新的 #waifu（退出后 24h 内再次打开）→ 拆旧再包新

    if (!window.MuSakanaPhysics) {
      physicsMissing = true;
      return;
    }
    if (!buildWrapper()) return;
    computeLimits();
    body = new window.MuSakanaPhysics.SpringBody({
      springK: CFG.springK,
      springD: CFG.springD,
      mass: CFG.mass,
      maxX: LIM.maxX,
      maxY: LIM.maxY,
      maxRot: LIM.maxRot,
      rotClamp: LIM.maxRot * 1.6,
    });
    bindDrag();
    watchHidden();
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    // 初始轻轻晃一下，让用户感知到"这是可以动的"
    setTimeout(function () {
      if (body && !document.hidden) {
        body.applyImpulse((Math.random() < 0.5 ? -1 : 1) * CFG.autoForce * 1.2, -CFG.autoForce * 0.3, 0);
        ensureLoop();
      }
    }, 1500);
    if (CFG.autoMode) scheduleAuto();
  }

  /* 拆除旧包装（#waifu 节点被替换时调用），避免事件/rAF 残留 */
  function teardown() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    running = false;
    lastTs = 0;
    pauseAuto(true);
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    body = null;
    wrap = null;
    wrapStyle = null;
    physicsEl = null;
    physStyle = null;
    waifuEl = null;
    wrappedWaifu = null;
  }

  /* 启动：等异步 live2d 生成 #waifu（轮询 + DOM 观察双保险） */
  (function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
      return;
    }
    const int = setInterval(function () {
      if ($('waifu')) {
        clearInterval(int);
        init();
      }
    }, 250);
    // 超时兜底（如用户已关闭看板娘）终止轮询
    setTimeout(function () {
      clearInterval(int);
      init(); // 无论 #waifu 是否存在都释放一次判断
    }, 15000);
    // 观察 body 子节点：退出后 24h 内再次打开看板娘时 #waifu 会被重新创建，
    // 轮询已在 15s 后停止，这里保证任意时刻插入的 #waifu 都能被包上物理层。
    if (typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(function (muts) {
        for (let i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length && $('waifu')) {
            init();
            return;
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  })();
})();