/*!
 * sakana-physics.js
 * 看板娘物理引擎（纯计算，零 DOM 依赖）—— 弹簧/阻尼/惯性/回弹/旋转。
 * 灵感来自 sakana-widget 3.x 的二维弹簧系统，但为当前 Live2D 看板娘重新实现。
 * 对外暴露 window.MuSakanaPhysics.SpringBody。
 * 注意：本文件不操作任何 DOM，只负责数值积分，由 sakana-widget.js 驱动。
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  /* 一维阻尼弹簧（位置朝 target 收拢），半隐式欧拉积分 */
  class DampedSpring {
    constructor(k, damping) {
      this.k = k; // 刚性系数
      this.damping = damping; // 阻尼系数
    }
    /* return: 加速度 = (k*(target-pos) - damping*vel) */
    accel(target, pos, vel) {
      return this.k * (target - pos) - this.damping * vel;
    }
  }

  /*
   * SpringBody —— 看板娘物理体
   * 状态量：x/y（相对锚点的位移，px）、vx/vy（速度）、rot（弧度）、vr（角速度）
   * 锚点固定为 (0,0)：即动画化前的原始位置。
   * 拖拽时由外部把 target 设到指针偏移，松手后 target 回到 0。
   */
  class SpringBody {
    constructor(opts) {
      opts = opts || {};
      this.mass = opts.mass != null ? opts.mass : 1;
      this.spring = new DampedSpring(
        opts.springK != null ? opts.springK : 90, // 太刚则回弹生硬，这里已按手感标定
        opts.springD != null ? opts.springD : 11
      );
      // 旋转用的一阶平滑（目标 rot 来自横向位移映射，带滞后与回正）
      this.rotSpringK = opts.rotSpringK != null ? opts.rotSpringK : 28;
      this.rotSpringD = opts.rotSpringD != null ? opts.rotSpringD : 7;

      this.maxX = opts.maxX != null ? opts.maxX : 90; // 最大水平位移(px)
      this.maxY = opts.maxY != null ? opts.maxY : 40; // 最大垂直位移(px)
      this.maxRot = opts.maxRot != null ? opts.maxRot : 0.28; // 最大目标倾斜(rad ≈ 16°)
      this.rotClamp = opts.rotClamp != null ? opts.rotClamp : this.maxRot * 1.6; // 角速度/角度硬上限

      // 状态
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.rot = 0;
      this.vr = 0;

      // 目标（拖拽时外部设置为指针偏移；松手后置回 0）
      this.tx = 0;
      this.ty = 0;
      // 静止判定阈值
      this.sleepThreshold = opts.sleepThreshold != null ? opts.sleepThreshold : 0.06;
    }

    /* 把目标设为指针相对锚点的偏移（Internal clamp 防止甩飞） */
    setTarget(x, y, dt) {
      this.tx = clamp(x, -this.maxX, this.maxX);
      this.ty = clamp(y, -this.maxY, this.maxY);
      this._targetDt = dt; // 提供给让 rot 滞后跟随的预期帧时长
    }

    /* 施加一个速度冲量（自动晃动 / 外部触发用） */
    applyImpulse(ix, iy, ir) {
      this.vx += ix;
      this.vy += iy;
      this.vr += ir != null ? ir : 0;
    }

    /* 立即归零（隐藏/销毁时调用） */
    reset() {
      this.x = this.y = this.vx = this.vy = this.rot = this.vr = 0;
      this.tx = this.ty = 0;
    }

    /* 单步积分，dt 秒 */
    step(dt) {
      dt = clamp(dt, 1 / 240, 1 / 20); // 防异常帧时长

      // 位置弹簧：向 target 收拢，同时吸收松手时的惯性
      let a = this.spring.accel(this.tx, this.x, this.vx);
      this.vx += a * dt;
      this.x += this.vx * dt;
      innerClampAxis(this, 'x', 'vx', this.maxX);

      a = this.spring.accel(this.ty, this.y, this.vy);
      this.vy += a * dt;
      this.y += this.vy * dt;
      innerClampAxis(this, 'y', 'vy', this.maxY);

      // 旋转：目标倾斜量 = 横向位移的映射（拉得越远倾得越多，符号相反形成“拖拽拖角”）
      const rotTarget = clamp(-(this.x / this.maxX), -1, 1) * this.maxRot;
      const ar = this.rotSpringK * (rotTarget - this.rot) - this.rotSpringD * this.vr;
      this.vr += ar * dt;
      this.rot += this.vr * dt;
      this.rot = clamp(this.rot, -this.rotClamp, this.rotClamp);
    }

    /* 是否静止（供外层停机，避免无谓的 rAF） */
    isAtRest() {
      const s = this.sleepThreshold;
      return (
        Math.abs(this.x) < s &&
        Math.abs(this.y) < s &&
        Math.abs(this.vx) < s &&
        Math.abs(this.vy) < s &&
        Math.abs(this.rot) < s &&
        Math.abs(this.vr) < s
      );
    }

    /* 当前总能量近似值（用于“晃够就歇”的阈值判断） */
    energy() {
      return (
        this.x * this.x +
        this.y * this.y +
        this.vx * this.vx +
        this.vy * this.vy +
        this.rot * this.rot +
        this.vr * this.vr
      );
    }
  }

  function innerClampAxis(self, p, v, max) {
    if (self[p] > max) {
      self[p] = max;
      if (self[v] > 0) self[v] = 0;
    } else if (self[p] < -max) {
      self[p] = -max;
      if (self[v] < 0) self[v] = 0;
    }
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  global.MuSakanaPhysics = {
    SpringBody: SpringBody,
    TAU: TAU,
    clamp: clamp
  };
})(window);