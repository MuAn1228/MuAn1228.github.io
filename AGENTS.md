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
- **页面内联 `<script src>` 特效脚本不要加 `defer`**（books-ascii-title / pixel-snow / travel-reel 的 defer 已于 2026-08-24 移除，提交 5f0a8bf）——defer 会让特效脚本晚于依赖脚本执行，造成加载时序问题。

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
- 黑洞效果整体呈现叠在 **展示页顶部**（铺满 100vw），下方是原「极简居中」展示内容，中间用渐变过渡（2026-08-24 起渐变高度 60px、目标色 `rgba(0,0,0,0.35)`，提交 5f0a8bf），适配明/暗模式。
- 黑洞 hero 容器在 `source/showcase/index.md` 里是 `#showcase` 内最顶部的 `<div id="blackhole-hero" class="blackhole-hero">`，canvas 由 `blackhole.js` 注入，用容器宽高自适应。
- 展示页相关 CSS 统一放在 custom.css 的「展示页顶部黑洞横幅」块，**选择器必须写 `html:has(#showcase) …`，不能写 `html.page-showcase …`**——Hexo/Butterfly 生成的 `<html>` 上**没有** `page-showcase` 类，写 `html.page-showcase` 会让所有样式失效，导致顶部白条、内容铺不满宽度。
- 顶部白条/窄条的另一个元凶：theme 默认 `.layout` 首个子节点 `#page` 是白色卡片（`padding:50px 40px; width:74%`），黑洞被包在里面就露出白条。需要在展示页把 `#content-inner #page` / `#article-container` 的 `padding/margin` 清零、`width:100%`、背景透明。
- 黑洞视觉参数（2026-08-24 定稿，提交 5f0a8bf）：吸积盘 `diskInner:3.0 / diskOuter:10.0`；相机初始正对赤道面 `(0,0.5,50)` 距离适中；`sph.phi` 上限 `0.95π` 才能看到南极；滚轮缩放范围 `1.5~60`；像素比上限 2；辉光 `glow*0.025`、整体亮度 `*0.8`。
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

## 行情终端模块（/finance/，美股+基金仪表盘，导航名「交易」）
- 文件：`source/finance/index.md`（HTML 结构）+ `source/js/finance-tracker.js`（数据引擎+布局管理器+渲染，单文件 IIFE）+ `source/css/finance.css`。全屏暗色终端风格，URL `/finance/`，页面 title 与导航菜单均为「交易」（导航位于 展示 之后）。
- **数据源（2026-08-24 定案，别再走弯路）**：
  - Yahoo **v7 quote 已死**（官方锁 crumb，返回 Unauthorized）。用 **v8 spark 批量接口**（`/v8/finance/spark?symbols=…&range=2d&interval=1d`）一次拉全部 60 标的；K线用 v8 chart。spark 无市值/盘态 → 市值用内置快照，盘态由 IANA 时区本地算。**坑：spark 的 `chartPreviousClose` 是 range 起点之前的收盘（range=2d 时是两天前），算日涨跌必须取 close 序列倒数第二个点。**
  - CORS 走**代理池**（corsproxy.io → allorigins → codetabs，自动熔断记忆）。**注意：用 curl 探测代理必须带 `-H "Origin: …"`，否则 corsproxy 返回 403 会误判不可用。**
  - 新闻：rss2json 公共 API 解析 Yahoo Finance RSS。Alpha Vantage / Stooq 均已弃用（额度 25 次/天；Stooq 服务端故障）。
  - **基金数据免代理**：天天基金 `pingzhongdata/<code>.js`（历史净值+syl_1y/3y/6y/1n，串行加载防全局变量覆盖）+ 腾讯 `qt.gtimg.cn/q=jjXXXX`（批量最新净值，GBK，字段 `code~name~估值~估涨~~净值~累计~日涨跌%~日期`）。script 标签加载天然无 CORS。`fundgz.1234567.com.cn` 已死勿用。
- 布局：localStorage `gmt-layout-v2`；预设 4 套在 JS `PRESETS`；右列组件（如 09 基金）用 `right:8px` 锚定 + 预设 geo width=-1 表示。
- 用户自选基金 4 只在 JS `FUNDS` 常量（017811/016370/019172/017641），用户本人是基金交易者。
- **移动端适配（2026-08-24，提交 6b674ea）**：全部在 `finance.css` 的媒体查询里处理，JS 不用改。
  - `@media (max-width:1024px)`：页面关横向溢出（html/body `overflow-x:hidden`）、命令栏紧凑、隐藏 `.w-asof`/`.cmd-ver`。
  - `@media (max-width:768px)`：组件全宽纵向堆叠——`#grid` 改 static、`.widget` 用 `position:static;width:100%;left/top/right:auto!important` 覆盖 JS 内联绝对定位；**图/表类组件必须设显式高度**（heatmap 400 / breadth 240 / news 460 / sector 300 / aapl 320 / metal 280 / clock 380 / indices 440 / funds auto），否则会塌陷（news 的 `#news-list` 是 `absolute;inset:27px 0 0`、breadth/clock/indices 用 flex:1 或百分比高度，`height:auto` 时内容被裁、与相邻组件重叠）；sticky 命令栏/跑马灯/工具栏改 static 防止滚动时盖住内容。
  - **坑**：本环境浏览器无法真正模拟移动视口（CDP/device metrics override 无效，读到的还是桌面宽度），移动端布局只能靠 CSS 推理 + 用户在手机实测反馈。
- **顶部背景图（2026-08-24，提交 1b7f1e9）**：`source/img/finance/header-bg.webp`（由原 header-bg.png 264KB 经 sharp 转出 ~25KB），原 png 已删，CSS 引用 `/img/finance/header-bg.webp`。改 finance.css / index.md 后记得把 `<link ...finance.css?` 版本号 `?v=N` +1，否则浏览器缓存旧样式。
- 验证：项目有 jsdom，用 jsdom 冒烟测试（stub canvas/fetch 补 Origin 头）可端到端验证，见 `.workbuddy/skills/hexo-jsdom-smoke-test/`。Chrome 无头截图在本机环境失败，勿浪费时间。

## 音乐播放器模块（全站常驻，重要）
- **架构**：`source/js/music-playlist.js` 是全站唯一音频引擎（迷你播放器，硬编码 49 首歌单，fixed mini APlayer），通过 `window.__blogMusic` 暴露接口；音乐页 `/fun/music/` 的大播放器 `music-playlist-grid.js`（读 `/data/music-playlist.json` 394 首）复用同一引擎。两者共用：切页声音不断、状态镜像。
- **本地化机制**：本地 mp3 存 GitHub 仓库 `MuAn1228/music-assets`（默认分支 `master`），经 jsDelivr 分发（`https://cdn.jsdelivr.net/gh/MuAn1228/music-assets@master/<songId>.mp3`）。**仓库真实白名单以 `source/data/local-playlist-ids.json`（155 个 id）为唯一权威**，判定代码里一律读它，不要凭歌名/直觉硬编码。
- **音源优先级（2026-08-26 提交 5862597 定案）**：① CDN 白名单（最稳）→ ② Meting API `api.injahow.cn/meting/?server=netease&type=song&id=xxx` → ③ 网易云官方外链 `https://music.163.com/song/media/outer/url?id=xxx.mp3` 兜底（仅约 40% 免费可外链的歌曲可用，版权受限返回 HTML）。
- **必读坑（别再踩）**：
  - **假本地坑**：曾把 4 首歌标了 `local:true` 但仓库无文件（1496089152/1831482748/2101397575/1497588709），播放时 jsDelivr 404 静默失败。已改为按 local-playlist-ids.json 白名单判定并去掉错误标记。
  - `api.i-meto.com` 已复活（元数据可用），但**音频 URL 必须带 `Referer: https://api.i-meto.com/` 才能 206**，浏览器播放自带本站 referer → 必然 404，勿用。
  - `api.injahow.cn` 存在全局限流（返回 `{"message":"请求次数已达上限"}`），别再为此折腾代码，限流是常态，failover 已兜住。
  - 网易云 CDN 直链带时效签名（`m801.music.126.net/20260826...`），只用作当前会话的 src，不能存 sessionStorage 跨页复用。
- **切页续播/防卡死**：`pjax:send` 记录 `wasPlayingOnNav`，`pjax:complete` 时非用户主动暂停则 `ap.play()`；audio `error` 且当前为大播放器曲目时交给音乐页自己处理，迷你列表则自动跳下一首（`skipCount>2` 停止，防整单死循环）。
- **切页性能**：`source/js/pjax-prefetch.js`（注入在 music-playlist.js 之前）对悬停/聚焦的站内链接做低优先级 `<link rel=prefetch>`，把 pjax 的 fetch 提前到空闲时段，避免瞬时并发挤占音频缓冲。
- **当前状态（2026-08-26 推送后）**：49 首中 10 首走 CDN（稳定），40 首走网络源（Meting 限流时仅官方外链可用歌能播）。**彻底方案 = 把迷你歌单缺的 mp3 下载上传到 music-assets 仓库（需可写该仓库的 GitHub 凭据），未执行，等用户实测反馈后按需做。**
- 验证：jsdom 冒烟测试可以端到端验证解析逻辑（stub APlayer/Audio + mock Meting 拒绝，见 .workbuddy/skills/hexo-jsdom-smoke-test/）；浏览器沙箱无音频输出，切页续播只能验证状态（isPlaying）即可。

## 电影观看外链安全模块（/watch/，方案 A，2026-08-24）
- **功能**：电影卡「在线观看」→ 离站确认页 `/watch/?movie=<id>` → 用户主动「继续访问」→ 第三方（目标为「网飞猫」）。**安全第一：宁可链接不可用，也不把用户带到未核验的第三方网站。**
- 文件：
  - `source/data/movies.json`：每部电影加 `id` + `watch:{site,path}` 映射（`path` 是**人工审核过的站内路径**，不是完整 URL）。
  - `source/data/sites.json`：**人工审核白名单**（唯一可信域名来源）。当前 ncat 为 `status:healthy`、`verificationMode:manual_user_environment`、`baseUrl=https://www.ncat21.com`（2026-08-25 人工核验 + 正式启用，configVersion=14）。
  - `source/data/health.json`：**watchdog 自动生成**的安全决策数据（客户端 Fail-Closed 依赖）。
  - `source/js/watch.js`：UMD 安全校验模块，导出 `evaluateWatch`（纯函数）并驱动确认页。任何检查失败 → `{ok:false}`，绝不跳转。
  - `source/watch/index.md`：离站确认页（HTML 骨架，逻辑在 watch.js）。
  - `source/js/media-grid.js`：电影卡渲染「在线观看」按钮，点击只把 movie id 带到确认页。
  - `watchdog_check.py` + `.github/workflows/watchdog.yml`：GitHub Actions 每 6h 跑一次（cron `23 */6 * * *`），对 sites.json 里 healthy 的站点做 DNS/TLS/HTTP/redirect/fingerprint/riskScan 检查，写 health.json。
- **核心安全规则（改动前必读，勿放宽）**：
  - 状态**只有两态**：`HEALTHY` / `DISABLED`。异常/UNKNOWN/超时/配置错/数据损坏/域名变化/redirect 异常/风险信号 → 一律 `DISABLED`。
  - **destination 只能由 movie_id → site_id → approved path 构建**。禁止开放重定向（不出现 `/go?url=` `/watch?url=`），用户永远不能提供 URL。
  - `health.json` **Fail Closed**：不存在/解析错/schema 不符/版本不支持/过期/status 非 healthy/映射缺失/target 不符白名单 → DENY。**不做任何 fallback**（旧 health.json、旧域名、搜索结果、猜测 URL）。
  - **redirect 链逐跳验证**：每跳只允许 approved host + 人工批准的 `allowedRedirectHosts`，仅 https、无 userinfo。
  - **新域名不自动发现/自动恢复**：人工核验 → 手动填 sites.json → 建基线 → 置 healthy → watchdog 下次检查通过 → health.json 变 healthy。
  - Threat Intelligence 未接入 → `not_configured`（不是「更安全」的证据）；`MALICIOUS/SUSPICIOUS/TIMEOUT/UNAVAILABLE/RATE_LIMITED` → DISABLED。
  - fingerprint/risk marker 只是**风险信号**，不是「网站安全」的证明。
- **人工恢复 ncat 的流程（2026-08-25 已完成）**：拿到真实域名 → 人工核验 → 填 `sites.json` 的 `baseUrl/hosts/allowedRedirectHosts/baseline` → `begin` 迁移（pending_verification）→ 正式 watchdog → `approve`（healthy）→ `renew` 签发限时 permit → 客户端恢复「继续访问」。
- **verificationMode（2026-08-25 新增，verificationMode 已纳入 SECURITY_FIELDS / siteConfigHash）**：
  - 枚举仅允许 `automated`（默认）/ `manual_user_environment`。缺失/非法 → 站点无效、health disabled（Fail Closed）。
  - **manual 模式语义**：机器负责所有可自动证明的安全门（DNS/TLS/配置绑定），**不关闭任何机器门**；仅「内容确认」由人工在真实用户环境完成，并以限时 maintenancePermit 承接。
  - **`BLOCKED_BY_WAF` 是独立证据态**，严格定义为 **DNS PASS + TLS PASS + 明确 WAF/anti-bot 阻断证据**（HTTP 850 / 明确 anti-bot challenge / 明确 WAF 响应头）。普通 403/404/500/timeout/connection reset **不得**归类为 BLOCKED_BY_WAF，保持原 UNKNOWN/FAIL 语义。禁止任何站点特判。
  - health 顶层 `status` 保留二态 `healthy/disabled`，另加诊断三态 `healthState`（`AUTOMATED_HEALTHY`/`MANUAL_VERIFIED`/`DISABLED`）与 `automatedContentCheck`（`PASS`/`BLOCKED_BY_WAF`/`FAIL`/`UNKNOWN`）。合法组合：`healthy+AUTOMATED_HEALTHY`、`healthy+MANUAL_VERIFIED`、`disabled+DISABLED`；非法组合客户端 DENY。
  - **`healthy` 仅表示机器基础安全门与当前 verificationMode 所要求的安全条件成立，【不】意味着内容级自动检查 PASS**（`healthy+MANUAL_VERIFIED+BLOCKED_BY_WAF` 即内容被 WAF 阻断、由人工许可承接）。
  - manual 模式 ALLOW 需 **有效 maintenancePermit**：12–24h，含 `issuedAt/expiresAt/approvedHost/configVersion/siteConfigHash/verificationMethod/verificationNotes` + 全部 7 项 attestation；任何关键字段缺失 → DENY；不允许永久 permit、不允许自动续签；permit 绑定 approvedHost/configVersion/siteConfigHash/verificationMode，换域名或配置变化后旧 permit 自动失效。
  - FAIL / 通用 UNKNOWN **永远不能人工翻案**（manual renew 门禁要求 health 已为 MANUAL_VERIFIED + BLOCKED_BY_WAF）；candidate 永远不能进入跳转链；禁止 fallback 旧域名/候选域名。
  - 时钟异常防护：客户端拒绝 `now < permit.issuedAt` 与 `now < health.generatedAt`（防回拨时钟复用过期许可），结合短 TTL 双重收窄窗口。
  - 人工签发 permit 走 `tools/domain-migrate.py renew --site ncat --issued-by 姓名 --verification-method … --verification-notes … --attestation <7 项>`（TTL 默认 24h，manual 强制 [12h,24h]）。
- **当前状态（2026-08-25 正式启用）**：ncat = `healthy`（approvedHost=`www.ncat21.com`，唯一 approved host，configVersion=14）；health.json = `healthy + MANUAL_VERIFIED + BLOCKED_BY_WAF`（DNS/TLS PASS，内容被 WAF 阻断、由人工许可承接）；`maintenancePermit` 已签发（TTL 12h，人工 renew，禁止 24h/自动续签/永久 permit）。**状态只能人工变更：permit 到期须人工 `tools/domain-migrate.py renew`；禁止自动续签、自动改状态、自动 candidate→approved。**
- **watchdog 与部署**：watchdog 用 `GITHUB_TOKEN` push health.json 到 main **不会**触发 `update-contributions.yml`（GitHub 防递归规则），所以 watchdog 自己带部署步骤（Setup Pages + deploy-pages）。两者共用 `concurrency.group: pages` 防冲突。
- 测试：`node test/watch-security.js`（177 个用例）+ `node test/fault-drill.js`（55）+ `node test/hash-crosscheck.js`（63）+ `python test/candidate-security.py`（52）+ `python test/dns-security.py`（55）+ `python test/domain-migrate-security.py`（77），全部 exit 0 才通过。

## 后续工作方式
1. 改代码 → 本地 `hexo s` 预览验证 → `git commit` → `git push origin source:main` → **自动部署（约 1-2 分钟），无需手动触发**。
2. 尽量只改需要改的地方，不引入无关变更。
3. 提交前先 `git status` 检查是否有历史遗留的本地未提交改动——用户说"线上没生效"时，多半是改动没推送，先查 diff 再动手。