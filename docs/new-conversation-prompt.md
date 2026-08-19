# 新对话提示词

复制以下内容到新对话：

---

你正在协助维护一个 Hexo 博客项目，请先阅读以下背景。

# 项目概况
- Hexo 8.x + Butterfly 5.7.0 主题
- 仓库：`https://github.com/MuAn1228/MuAn1228.github.io`
- 线上地址：`https://MuAn1228.github.io/`
- 本地项目根目录：D:\blog（Windows）。执行任何命令前先切换到 D:\blog。

# 构建 / 预览 / 部署
- 本地预览：`hexo clean && hexo s`（默认 http://localhost:4000，若被占用可换 `-p 4001`）
- 部署：`git push origin source:main`（本地分支 source → 远端 main），再由用户在 GitHub 手动触发工作流「Update Contributions & Deploy」。禁止使用 `hexo d`。
- 重要教训：推送 ≠ 上线。用户反馈线上问题时，先用 WebFetch 抓取线上 JS/CSS 确认是否已部署，再排查代码。
- 提交前务必本地预览验证。

# 工程约定
- 文件名只能用 ASCII（中文文件名会导致 Hexo 500 错误）
- 自定义 JS 放 `source/js/`，自定义 CSS 集中在 `source/css/custom.css`
- 主题脚本注入点：`_config.butterfly.yml` 的 `inject.bottom`
- 依赖 `three.min.js`（r121，带 defer）的脚本注入时也必须加 defer

# 关键自定义功能
- 三个 canvas 特效：`letterglitch.js`（展示页）、`game-ballpit.js`（游戏页球池，球体贴图用游戏封面，最终方案，勿改成运动球）、`driftwall.js`（书籍页漂移墙）
- 小游戏模块 `/fun/arcade/`：Flappy Bird + 魔方两个标签页
  - `source/fun/arcade/index.md`：标签页页面
  - `source/js/flappy-bird.js`：固定 60Hz 时间步长（防高刷屏加速），GRAVITY=0.38/FLAP=-6.8
  - `source/js/rubik.js`：魔方，挂载点 `#arcade-rubik`，面板隐藏时暂停渲染
  - `source/js/arcade.js`：标签切换，派发 `arcade:switch` 事件
  - 样式在 `custom.css` 的 `.arcade-*` 段
- 媒体网格 note 气泡：
  - `source/js/media-grid.js` 统一渲染 `/fun/games/`、`/fun/movies/`、书籍规整视图
  - 悬停卡片时显示 `.media-grid-tip`，读取 `data-name/data-sub/data-note`
  - 无 note 时显示斜体「理解待补充…」
  - 书籍默认的「漂移墙」视图仍由 `driftwall.js` 渲染，不受影响

# 当前状态（务必先确认）
- 最新提交 `0612214` 已推送到远端 `main`，但线上可能尚未部署
- **未跟踪文件 `AGENTS.md` 不要提交。**
- 游戏模块共 **31 款游戏**，海报文件 `source/img/games/game01-43.jpg/png`
- 已填充 16 本书的阅读笔记到 `source/data/books.json`
- `source/data/games.json` 和 `source/data/movies.json` 已添加空 `note` 字段，等待后续填写

# 待处理问题
- **需手动触发 GitHub Actions 部署**：提交 `0612214`
- **可继续补充游戏 / 电影理解**：编辑对应 JSON 的 `"note": ""` 字段
  - 多段用 `\n\n` 分隔
  - 双引号 `"` 需转义为 `\"`
  - 改完后本地预览 → commit → push → 提醒手动触发部署

# 关键坑
1. canvas 游戏物理必须用固定时间步长，按帧计算会在高刷屏成倍加速
2. `.media-card` 有 `overflow: hidden`，tooltip 必须 `position: fixed` 放在 body 下，不能作为卡片子元素
3. 文件名必须 ASCII
4. JSON 中的图片路径必须与实际文件扩展名一致
5. 详细交接文档在 `D:\blog\docs\tasks\current-task.md` 和 `handoff.md`，请先阅读

# 工作方式
1. 改代码 → 本地 `hexo s` 预览验证 → `git commit` → `git push origin source:main` → 提醒用户手动触发部署工作流
2. 只改需要改的地方，不引入无关变更。
