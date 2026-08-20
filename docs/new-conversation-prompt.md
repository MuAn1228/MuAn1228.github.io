# 新对话提示词

复制以下内容到新对话：

---

你正在协助维护一个 Hexo 博客项目，请先阅读以下背景。

# 项目概况
- Hexo 8.x + Butterfly 5.7.0 主题
- 仓库：`https://github.com/MuAn1228/MuAn1228.github.io`
- 线上地址：`https://MuAn1228.github.io/`
- 本地项目根目录：D:\blog（Windows）。执行任何命令前先确认并切换到 D:\blog。

# 构建 / 预览 / 部署
- 本地预览：`hexo clean && hexo s`（默认 http://localhost:4000，被占用就换更高端口，如 `-p 4030`）
- 部署：`git push origin source:main`（本地分支 source → 远端 main），再由用户在 GitHub 手动触发工作流「Update Contributions & Deploy」。禁止使用 `hexo d`。
- 重要教训：推送 ≠ 上线。用户反馈线上问题时，先用 WebFetch 抓取线上 JS/CSS 确认是否已部署，再排查代码。
- 提交前务必本地预览验证。改动 JS/CSS 后建议用新端口起服务，避免浏览器缓存旧 HTML。

# 工程约定
- 文件名只能用 ASCII（中文文件名会导致 Hexo 500 错误）
- 自定义 JS 放 `source/js/`，自定义 CSS 集中在 `source/css/custom.css`
- 主题脚本注入点：`_config.butterfly.yml` 的 `inject.bottom`
- 依赖 `three.min.js`（r121，带 defer）的脚本注入时也必须加 defer

# 关键自定义功能
- 三个 canvas 特效：`letterglitch.js`（展示页）、`game-ballpit.js`（游戏页球池，球体贴图用游戏封面，最终方案，勿改成运动球）、`driftwall.js`（书籍页漂移墙）
- 粒子标题 `name-particles.js`（大多数页）：排斥半径 `RADIUS=15`、粒径 `DOT=1.5`（用户逐步调小的最终值）
- 鼠标指针 `cursor.js`：RGB Cursor Dark 动画（旧紫色光点已移除）
- 电影页标题横幅：`pixel-snow.js` 像素雪背景
- 小游戏模块 `/fun/arcade/`：标签页式页面，含 Flappy Bird（`flappy-bird.js`，固定 60Hz 时间步长，GRAVITY=0.38/FLAP=-6.8）和魔方（`rubik.js`）；标签切换在 `arcade.js`
- 音乐模块 `/fun/music/`：
  - `music-playlist-grid.js`：音乐页顶部紫色大播放器（读取 `source/data/music-playlist.json`，394 首）
  - **必须在脚本开头做路径守卫 `if (!/\/fun\/music\/?($|\?|#)/.test(window.location.pathname)) return;`**，否则横幅会误渲染到游戏/电影等页
  - `music-playlist.js`：全局右下角迷你 APlayer（fixed+mini，49 首），全站生效，属正常
- 媒体网格 note 气泡：`media-grid.js` 统一渲染 `/fun/games/`、`/fun/movies/`、书籍规整视图，悬停显示 `data-note`；无 note 显示「理解待补充…」

# 当前状态（务必先确认）
- 最新提交 `5e954f8`（删除首页挂绳特效 lanyard）已推送 `source:main`，**线上尚未部署**（连同此前未部署的改动一起上线）
- **挂绳特效已被用户要求整体删除**：期间经历位置/尺寸/图片方向多轮修改（fe22e45），最终决定移除。`lanyard.js`、`lib/GLTFLoader.js`、`img/lanyard/`、`lib/lanyard/` 已删；**`lib/three.min.js` 必须保留**（hero-3d / rubik / pixel-snow / game-ballpit 在用）
- `AGENTS.md` 为项目交接文档（已纳入仓库），新对话先读它
- 游戏模块共 31 款游戏；`games.json` / `movies.json` 的 `note` 字段仍为空，可继续补充

# 待处理问题
- **需手动触发 GitHub Actions 部署**：提交 `5e954f8`（连同此前未部署的改动一起上线）
- 可继续补充游戏 / 电影 `note` 理解：编辑 JSON `"note": ""` 字段，多段用 `\n\n`，双引号转义 `\"`

# 关键坑
1. canvas 游戏物理必须用固定时间步长，按帧计算会在高刷屏成倍加速
2. 游戏页 `ballpit-host` 会把 `#nav` 的 z-index 从主题默认 90 降为 2，此时若有 z-index≥2 且 DOM 靠后的元素（如音乐横幅的 `#page-site-info`）会盖住「娱乐」下拉菜单
3. `.media-card` 有 `overflow: hidden`，tooltip 必须 `position: fixed` 放 body 下
4. 文件名必须 ASCII；JSON 图片路径必须与实际文件扩展名一致
5. 详细交接文档在 `D:\blog\docs\tasks\handoff.md`，请先阅读

# 工作方式
1. 改代码 → 本地 `hexo s` 预览验证 → `git commit` → `git push origin source:main` → 提醒用户手动触发部署工作流
2. 只改需要改的地方，不引入无关变更。
