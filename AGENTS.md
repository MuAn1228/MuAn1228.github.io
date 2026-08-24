# 项目交接说明（Handoff）

## 项目概况
- 这是一个 Hexo 博客项目（Hexo 8.x + Butterfly 5.7.0 主题）。
- 仓库：https://github.com/MuAn1228/MuAn1228.github.io
- 线上地址：https://MuAn1228.github.io/
- 本地项目根目录：`D:\blog`（Windows）。
- 注意：你的终端/工作目录可能默认不在 `D:\blog`（例如可能在 `d:\code\trae_blog\blog`）。执行任何命令前先确认并切换到 `D:\blog`。

## 构建 / 预览 / 部署
- 本地预览：`hexo clean && hexo s`（默认 http://localhost:4000）
- 部署：`git push origin source:main`（本地分支 `source` → 远端 `main`）。**工作流已改为 push main 自动触发**（2026-08-24 起，提交 9677906），推送后约 1-2 分钟自动部署完成，无需手动触发。**不要使用 `hexo d`**。可用匿名 API 查状态：`https://api.github.com/repos/MuAn1228/MuAn1228.github.io/actions/runs?per_page=1`。
- 提交前务必本地预览验证。

## 工程约定
- 文件名只能使用 ASCII 字符（中文文件名会导致 Hexo 500 错误）。
- 自定义 JS 放在 `source/js/`，自定义 CSS 集中在 `source/css/custom.css`。
- 主题脚本注入点：`_config.butterfly.yml` 的 `inject.bottom`。

## 关键自定义功能（canvas 特效）
| 文件 | 作用 |
| --- | --- |
| `source/js/letterglitch.js` | 展示页：标题字母故障效果 |
| `source/js/game-ballpit.js` | 游戏页顶部：3D 球池（球体贴图用游戏封面） |
| `source/js/driftwall.js` | 书籍页：漂移墙效果 |
| `source/js/name-particles.js` | 大多数页标题：粒子文本（鼠标排斥） |
| `source/js/pixel-snow.js` | 电影页标题横幅：像素雪背景 |
| `source/js/travel-reel.js` | 旅行页标题横幅：胶片画廊（React Bits Pro ReelGallery 原生 JS 复刻，倾斜胶片条随滚动漂移） |
| `source/js/cursor.js` | 鼠标指针：RGB Cursor Dark 动画（不再有紫色光点） |
| `source/js/blackhole.js` | 展示页(`/showcase/`)顶部：Three.js 黑洞 hero（吸积盘+引力透镜+缩放运镜，左键旋转/右键平移/滚轮缩放） |

## 当前状态 & 重要决策（务必记住）
- 游戏页顶部横幅的球池（`game-ballpit.js`）用 `/data/games.json` 里的游戏封面作为球体贴图，这是**最终采用方案**。
- 曾尝试把球改成程序化绘制的运动球（篮球/足球/乒乓球/台球/排球/网球/高尔夫），但用户反馈「效果还不如之前的游戏球」并已回退。**不要再改成运动球，除非用户主动要求。**
- 粒子标题参数：排斥半径 `RADIUS=15`，粒径 `DOT=1.5`（用户逐步调小后的最终值）。
- **挂绳特效（lanyard）已删除**：曾加入首页（导航栏 Mu An's Blog 右侧的 3:4 照片胸卡 + 物理摆动），期间经历过位置/尺寸/图片方向多轮修改（fe22e45），最终用户决定整体删除（5e954f8）。相关文件 `lanyard.js`、`lib/GLTFLoader.js`、`img/lanyard/`、`lib/lanyard/` 均已删除。**`lib/three.min.js` 必须保留**（hero-3d / rubik / pixel-snow / game-ballpit 都在用）。
- 以上特效及其样式均已提交并推送上线。
- 球池可调参数在 `game-ballpit.js` 顶部的 `CFG` 对象里。

## 旅行页胶片画廊（travel-reel）
- 展示源 `source/data/travel-gallery.json`，缩略图目录 `source/img/travel/`（md5 命名 .jpg，源图在 `D:\photo\lvxing\`）。
- 可调参数在 `travel-reel.js` 顶部的 `CFG`：直角矩形（`radius:0`）、无纵向拱形（`arch:0`）、加宽 3 倍视口实现无缝循环（`target=viewW*3`）。
- EXIF 方向映射容易出错（脚本曾漏掉 orient 4、错映射 orient 6 导致照片倒放）。**若某张照片方向错误，与其纠结 EXIF 映射表，用户更接受直接把该缩略图旋转 180° 的简单方案。** 修正后需浏览器目视核对（源图浏览器会自动应用 EXIF，作对照）。
- 最近一次修复：4bab6/1287988 两张照片方向（提交 10b753c，已推送远端 main）。

## 展示页黑洞 hero（/showcase/，重要坑）
- 黑洞效果整体呈现叠在 **展示页顶部**（铺满 100vw），下方是原「极简居中」展示内容，中间用渐变过渡，适配明/暗模式（`var(--card-bg)`）。
- 黑洞 hero 容器在 `source/showcase/index.md` 里是 `#showcase` 内最顶部的 `<div id="blackhole-hero" class="blackhole-hero">`，canvas 由 `blackhole.js` 注入，用容器宽高自适应。
- 展示页相关 CSS 统一放在 custom.css 的「展示页顶部黑洞横幅」块，**选择器必须写 `html:has(#showcase) …`，不能写 `html.page-showcase …`**——Hexo/Butterfly 生成的 `<html>` 上**没有** `page-showcase` 类，写 `html.page-showcase` 会让所有样式失效，导致顶部白条、内容铺不满宽度。
- 顶部白条/窄条的另一个元凶：theme 默认 `.layout` 首个子节点 `#page` 是白色卡片（`padding:50px 40px; width:74%`），黑洞被包在里面就露出白条。需要在展示页把 `#content-inner #page` / `#article-container` 的 `padding/margin` 清零、`width:100%`、背景透明。
- 初始相机已拉远（进入页面时黑洞较小、可滚轮放大）；`sph.phi` 上限放宽到 `0.95π` 才能看到南极（不然只能转到赤道）。
- 展示页桌面端已**隐藏侧边栏**（`html:has(#showcase) #content-inner #aside-content { display:none }`，提交 f273a34）——黑洞整宽铺顶会盖住右侧卡片列（个人简介/热门文章/打赏等），用户最终选择隐藏该列保持极简，不单独显示右侧模块。

## 夜间模式适配（默认 dark，重要）
- 打开即夜间模式通过 `_config.butterfly.yml` 的 `display_mode: dark` 实现：Butterfly 由服务端把 `<html data-theme="dark">` 渲染出来，**前端 localStorage 不会覆盖这个初始值**（提交 36d1b1f）。
- Butterfly 的明/暗模式由 `<html>` 上的 `data-theme` 属性驱动，自定义深色样式统一用属性选择器 `[data-theme='dark'] …`（单双引号均可，与渲染值 `dark` 匹配）。**务必用这种方式写夜间样式，不要改内联 JS。**
- 已适配的模块（提交 c65ff2b）：
  - 左侧侧边栏全部卡片：`[data-theme='dark'] .card-widget` → 深色毛玻璃 `background: rgba(18,18,24,0.78) !important`。
  - 首页底部 GitHub 热力图卡片：`[data-theme='dark'] .github-heatmap-wrap` 同样换深色毛玻璃。
  - 热力图格子颜色：由 `github-heatmap.js` 的硬编码改为 CSS 类 `.gh-lv0..4`，并在 custom.css 定义，深色模式下 `.gh-lv0`（空白格）用 `#2b2e3d`，随主题自动切换。热力图 `#github-heatmap` 由 `github-heatmap.js` 动态 append 到 `#recent-posts` 底部。
- **坑**：改夜间模式样式后，旧构建缓存会让人误以为样式没生效（背景仍显示白色半透明）。必须 `hexo clean` 重建再验证，用浏览器实测 `getComputedStyle` 的 backgroundColor 而非肉眼看旧页面。

## 展示页文字内容（Obsidian 存档）
- 展示页正文文字已存档到本地 Obsidian：`D:\obsidian\Obsidian Vault\博客\展示.md`（含 关于我/摄影/编程之路/Skills/作品/联系 全量文字）。**用户以后会在该文件里改文字**，改完再同步回 `source/showcase/index.md`。
- 网页端展示页现仅保留 关于我 → Skills → 作品 → 联系（提交 0fba330 已删除「摄影」含 6 张图、以及「编程之路」板块；这两段内容以「网页端已移除」标注保留在 展示.md 里）。
- **注意**：本机 Write/Edit 工具只允许写 `d:\blog` 工作目录，写 `D:\obsidian\...` 会被拒绝。往 Obsidian 写文件须用终端 PowerShell 的 `[System.IO.File]::WriteAllText(...)`（UTF-8 无 BOM）。

## 关于本站模块（/about-site/，新增）
- 页面内容源 `source/about-site/index.md`（导航顶层项，位于 展示 之后，与 旅行/展示/娱乐 并列）。
- 文案存档在本地 Obsidian：`D:\obsidian\Obsidian Vault\博客\关于本站.md`（含原始段落；用户后续改文字再同步回 `source/about-site/index.md`，网页端版本已润色+分节）。
- 该页为标准页面布局，标题由 name-particles 粒子化；无独立 canvas 横幅。

## 行情终端模块（/finance/，美股仪表盘）
- 文件：`source/finance/index.md`（HTML 结构）+ `source/js/finance-tracker.js`（数据引擎+布局管理器+渲染，单文件 IIFE）+ `source/css/finance.css`。全屏暗色终端风格，URL `/finance/`。
- **数据源（2026-08-24 定案，别再走弯路）**：
  - Yahoo **v7 quote 已死**（官方锁 crumb，返回 Unauthorized）。用 **v8 spark 批量接口**（`/v8/finance/spark?symbols=…&range=2d&interval=1d`）一次拉全部 60 标的；K线用 v8 chart。spark 无市值/盘态 → 市值用内置快照，盘态由 IANA 时区本地算。**坑：spark 的 `chartPreviousClose` 是 range 起点之前的收盘（range=2d 时是两天前），算日涨跌必须取 close 序列倒数第二个点。**
  - CORS 走**代理池**（corsproxy.io → allorigins → codetabs，自动熔断记忆）。**注意：用 curl 探测代理必须带 `-H "Origin: …"`，否则 corsproxy 返回 403 会误判不可用。**
  - 新闻：rss2json 公共 API 解析 Yahoo Finance RSS。Alpha Vantage / Stooq 均已弃用（额度 25 次/天；Stooq 服务端故障）。
  - **基金数据免代理**：天天基金 `pingzhongdata/<code>.js`（历史净值+syl_1y/3y/6y/1n，串行加载防全局变量覆盖）+ 腾讯 `qt.gtimg.cn/q=jjXXXX`（批量最新净值，GBK，字段 `code~name~估值~估涨~~净值~累计~日涨跌%~日期`）。script 标签加载天然无 CORS。`fundgz.1234567.com.cn` 已死勿用。
- 布局：localStorage `gmt-layout-v2`；预设 4 套在 JS `PRESETS`；右列组件（如 09 基金）用 `right:8px` 锚定 + 预设 geo width=-1 表示。
- 用户自选基金 4 只在 JS `FUNDS` 常量（017811/016370/019172/017641），用户本人是基金交易者。
- 验证：项目有 jsdom，用 jsdom 冒烟测试（stub canvas/fetch 补 Origin 头）可端到端验证，见 `.workbuddy/skills/hexo-jsdom-smoke-test/`。Chrome 无头截图在本机环境失败，勿浪费时间。

## 后续工作方式
1. 改代码 → 本地 `hexo s` 预览验证 → `git commit` → `git push origin source:main` → 提醒用户手动触发部署工作流。
2. 尽量只改需要改的地方，不引入无关变更。