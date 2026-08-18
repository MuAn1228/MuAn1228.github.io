# Current Task

## Goal
等待下一个任务。

## Status
idle — 小游戏模块已完成并推送（3ff70e9），**等待用户手动触发 GitHub Actions 部署**

## 本次会话完成

### 小游戏模块（/fun/arcade/）— 已推送，待部署
- 新建页面 `source/fun/arcade/index.md`，三个标签页：Flappy Bird / FPS 射击 / 魔方
- `source/js/flappy-bird.js`：canvas 自包含，固定 60Hz 时间步长（高刷屏不加速），GRAVITY=0.38 / FLAP=-6.8，localStorage 最高分
- `source/js/fps-game.js`：基于本地 three.min.js（r121）重写（原 Kimi 版依赖外部 CDN 已废弃删除），Pointer Lock 瞄准 + 按住拖拽降级 + 触屏拖拽，WASD 移动，敌人追踪/攻击，计分+最高分
- `source/js/rubik.js`：挂载点从主页 `#page-header.full_page` 改为 `#arcade-rubik`（**主页左上角魔方已移除**），面板隐藏时暂停渲染
- `source/js/arcade.js`：标签切换，派发 `arcade:switch` 事件（FPS 监听它退出 pointer lock）
- 导航菜单「娱乐」下拉新增「小游戏」入口
- 样式集中在 `source/css/custom.css`（.arcade-* / .fps-* 段）
- 提交记录：1dc2d95 → 6665c87 → 4762f4d → 3ff70e9

## 待处理问题
- **用户必须手动触发「Update Contributions & Deploy」工作流**，否则线上仍是旧代码（已确认线上 flappy-bird.js 还是 GRAVITY=0.45 的原始版本）
- 未跟踪文件 `AGENTS.md` 未提交（非本项目产物，保持不动）

## Modified Files
- source/fun/arcade/index.md（新增）
- source/js/flappy-bird.js、fps-game.js、arcade.js（新增）
- source/js/rubik.js（挂载点迁移）
- source/css/custom.css（追加样式）
- _config.butterfly.yml（菜单 + inject.bottom）

## Next Step
等待用户触发部署后验证线上效果；若 Flappy 手感仍需微调，改 flappy-bird.js 第 7 行 GRAVITY/FLAP。
