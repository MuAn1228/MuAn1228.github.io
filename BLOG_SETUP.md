# 博客搭建记录（Hexo + Butterfly + GitHub Pages）

> 本文件记录整个博客的搭建过程、所有配置与自定义内容，方便继续维护或新对话快速接手。
> 最后更新：2026-08-16

---

## 一、项目概览

| 项 | 值 |
|----|----|
| 框架 | Hexo 8.x |
| 主题 | Butterfly 5.7.0（npm 安装，位于 `node_modules/hexo-theme-butterfly`） |
| 托管 | GitHub Pages（用户站点，**GitHub Actions 部署**） |
| 项目目录 | `D:\blog` |
| GitHub 用户名 | MuAn1228 |
| 仓库 | `MuAn1228.github.io`（已公开，SSH 已配好） |
| 线上地址 | https://MuAn1228.github.io/ |
| 邮箱 | libohang1228@163.com |
| 分支 | **部署分支 = `main`**（GitHub 默认分支，workflow 从 main 构建部署）；`source` = 备份；⚠️ 本地 checkout 在 `source`，提交后 `git push origin source:main` |

> ⚠️ **部署架构已从 `hexo d` 改成 GitHub Actions**（Pages artifact 部署）。`main` 分支现在是**源码**（不是部署产物），网站由 workflow 构建部署。

---

## 二、常用命令

```bash
cd /d/blog                        # 重要！cwd 经常被重置，务必先 cd 再操作
hexo new "文章标题"               # 新建文章 → source/_posts/xxx.md
hexo s                           # 本地预览 → http://localhost:4000

# 部署（改内容后）：
git add -A && git commit -m "改动说明" && git push origin source:main
# 然后去 GitHub Actions 手动触发「Update Contributions & Deploy」，或等每天 08:17 自动跑
```

> 本地预览验证特效时，先 `hexo g` 生成，再用 `hexo s`（端口占用处理见「坑」）。

---

## 三、文件清单（各文件职责）

| 文件 | 作用 |
|------|------|
| `_config.yml` | 站点基础配置（标题、作者、URL） |
| `_config.butterfly.yml` | **主题配置核心**（特效开关、菜单、社交、评论、音乐、个性化） |
| `source/css/custom.css` | **所有自定义样式**（背景渐变、横幅、卡片毛玻璃、滚动条、看板娘、热力图、滚动墙、灯箱等） |
| `source/js/sakura.js` | 樱花飘落 |
| `source/js/cursor.js` | 光标跟随光晕（渐变圆点 + 光环） |
| `source/js/click-effect.js` | 点击特效（爱心爆炸 + NH₄⁺ + 核心价值观光影文字） |
| `source/js/vanta.js` | Vanta 飞鸟背景（首页横幅） |
| `source/js/hero-3d.js` | 首页变形环面结（3D 拓扑结构，紫色发光 + 顶点波浪形变 + 鼠标视差） |
| `source/js/rubik.js` | 首页 3D 魔方（拖拽表面转层 + 右键转视角 + 打乱） |
| `source/js/visitor-count.js` | 访客统计（Vercount）+ 排除站长自己 |
| `source/js/live2d.js` | 看板娘（自托管模型，只保留 Pio/Tia） |
| `source/js/tagcloud.js` | 3D 标签云（TagCanvas） |
| `source/js/marquee.js` | 图片滚动墙（左右按钮 + 点击放大） |
| `source/js/music-playlist.js` | 音乐播放列表（49 首网易云静态歌单） |
| `source/js/github-heatmap.js` | GitHub 热力图（自渲染，紫色调） |
| `source/js/typing.js` | 简介打字机效果 |
| `source/lib/` | 本地自托管库：APlayer、Meting、three.js、vanta、tagcanvas |
| `source/live2d_api/` | 看板娘模型（Potion-Maker/Pio + Tia，精简版） |
| `source/data/contributions.json` | GitHub 贡献数据（workflow 自动抓取） |
| `source/img/blog/` | 图片滚动墙的 47 张图片 |
| `source/img/` | 头像、社交二维码（微信/抖音/QQ）、打赏二维码 |
| `source/_data/widget.yml` | 自定义侧边栏卡片（GitHub 统计、热门文章、打赏） |
| `source/_posts/算法题/` | 18 篇力扣算法笔记（tags 统一「力扣」，难度/比赛类型放 categories 子分类） |
| `source/fun/` | 娱乐页（音乐/电影/游戏/书籍，导航「娱乐」下拉） |
| `source/data/games.json` `movies.json` `books.json` | 游戏/电影/书籍列表数据（name/sub/img） |
| `source/img/games/` | 游戏海报（20 款，game01-20.jpg，600×900 竖版） |
| `source/img/books/` | 书籍封面（13 本，中文文件名.jpg） |
| `source/js/media-grid.js` | 电影/游戏/书籍网格渲染（读取 `/data/*.json`，三合一） |
| `source/data/music.json` | 音乐页歌单（title/author/cover，49 首） |
| `source/js/music-grid.js` | 音乐网格渲染（音乐页） |
| `source/js/music-playlist.js` | 音乐播放器歌单（49 首，运行时 Meting API 解析 URL） |
| `source/travel/index.md` | 旅行页（中国地图，点击省份跳转该省文章） |
| `source/js/travel-map.js` | 旅行地图交互（SVG 加载、省份着色、hover 提示、点击跳转） |
| `source/lib/china.svg` | 中国省份 SVG 地图（维基公有领域，自托管） |
| `scripts/travel-data.js` | Hexo 生成器：扫描「旅行」分类文章生成 `/data/travel.json` |
| `source/tags/ categories/ about/` | 标签 / 分类 / 关于页面 |
| `fetch_contributions.py` | 抓取 GitHub 贡献数据的脚本（workflow 调用） |
| `.github/workflows/update-contributions.yml` | GitHub Actions 部署 + 贡献抓取工作流 |

---

## 四、已实现功能清单

### 特效
- **渐变背景**：深紫→紫→淡紫→柔粉垂直渐变（`#web_bg`）
- **Vanta 飞鸟背景**：three.js 3D 飞鸟，首页横幅
- **Live2D 看板娘**：右下角，缩小到 30%，**只保留 Pio 和 Tia 两个模型**（自托管）
- **樱花飘落**、**光标跟随光晕**（渐变圆点 + 光环）
- **点击爱心爆炸**：16 颗粉色线条爱心四散 + **NH₄⁺** + **核心价值观光影文字**
- **3D 标签云**：TagCanvas 旋转球体，点击跳转
- **图片滚动墙**：47 张图横向无限滚动 + 左右按钮 + 点击放大（灯箱）
- **加载动画**：旋转光环 + 站点名 + 脉冲文字
- **副标题打字机**、**简介打字机**

### 功能
- **音乐播放器**：Aplayer + Meting（网易云单曲，本地自托管库）
- **评论系统**：Giscus（GitHub Discussions）
- **社交链接**：GitHub、邮箱、QQ、微信、知乎、B站、抖音（微信/抖音/QQ 悬停二维码）
- **打赏功能**：首页侧边栏微信/支付宝收款码
- **GitHub 统计卡**：github-readme-stats（radical 主题）
- **GitHub 热力图**：自渲染，紫色调，精确数据，每天自动更新
- **算法笔记**：18 篇力扣题（算法题分类 + 导航菜单入口）；**标签/分类规范**：`tags` 只写 `力扣`，难度或比赛类型写入 `categories` 子分类（`算法题 → 简单/中等/困难/周赛/双周赛`），避免标签页堆满 leetcode/难度/周赛等零散标签
- **娱乐模块**：音乐 / 电影 / 游戏 / 书籍 四个子页（导航「娱乐」下拉），游戏 20 款带竖版海报（`games.json` + `game01-20.jpg`）；书籍 13 本带封面（`books.json` + `source/img/books/*.jpg`）
- **旅行地图**：中国省份 SVG 地图（维基公有领域），已去过的省紫色高亮、可点击跳转该省文章；写旅行文章只需 front-matter 写 `categories: [旅行, 省份名]`（如 `[旅行, 四川]`），地图自动高亮该省
- **头像/站点图标**、**关于/标签/分类** 页面、**博客运行天数**

---

## 五、关键 ID / 值

| 项 | 值 |
|----|----|
| 音乐播放器 | 49 首歌单（`source/js/music-playlist.js`，运行时 Meting API 解析 URL，VIP 歌给 30s 试听）；改歌单改这里 |
| Giscus repo | `MuAn1228/MuAn1228.github.io` |
| Giscus repo_id | `R_kgDORtelHg` |
| Giscus category_id | `DIC_kwDORtelHs4DDYVx` |
| 建站日期 | `2026/08/15`（`runtime_date`） |
| GitHub token 权限 | 需要 `repo` + `read:user`（看私有仓库贡献，`read:user` 不够） |
| GitHub secret | `GH_TOKEN`（GitHub Actions 抓贡献用） |
| 社交账号 | QQ 1420482988 / 微信 lbh071031 / 抖音 lbh071031 / B站 424086446 / 知乎 tian-tian-19-45-51 |

---

## 六、想改某样东西 → 去哪改

| 想改 | 文件 | 位置 |
|------|------|------|
| 背景渐变颜色 | `source/css/custom.css` | `#web_bg` |
| 看板娘大小/位置 | `source/css/custom.css` | `#waifu` 的 `scale()`、`right` |
| 看板娘模型 | `source/js/live2d.js` + `source/live2d_api/` | `cdnPath`、模型文件 |
| 点击爱心/文字 | `source/js/click-effect.js` | `count`、`CORE` 数组、颜色 |
| 热力图颜色 | `source/js/github-heatmap.js` | `PURPLE` 数组 |
| 图片滚动墙 | `source/js/marquee.js` + `source/img/blog/` | 图片列表、滚动速度 |
| 音乐歌曲 | `source/js/music-playlist.js` | `songs` 数组（id/name/artist/cover）；歌曲 ID 用网易云搜索 API 拿 |
| 评论配置 | `_config.butterfly.yml` | `comments` + `giscus` |
| 社交图标 | `_config.butterfly.yml` | `social` |
| 打赏/热门文章/统计卡 | `source/_data/widget.yml` | 对应卡片 |
| 作者简介/公告 | `_config.butterfly.yml` | `aside.card_author`、`card_announcement` |
| 菜单栏 | `_config.butterfly.yml` | `menu`（当前：首页/旅行/展示/娱乐▾/分类/关于；已去掉「归档」「标签」「算法题」顶级入口——「分类」是唯一浏览入口，算法题/旅行等都在其下作子集） |
| 旅行地图省份/颜色 | `source/js/travel-map.js` + `source/css/custom.css` | `PROVINCES` 映射、`.cn-province.visited` 紫色 |
| 特效开关 | `_config.butterfly.yml` | `canvas_nest`、`fireworks`、`subtitle`、`preloader` 等 |

---

## 七、坑与注意事项（重要！）

1. **部署架构改了**：现在用 GitHub Actions（Pages artifact），**不要再用 `hexo d`**（会把 main 分支覆盖成 public/，破坏源码）。改内容后 `git push origin source:main` + 触发 workflow。

2. **GitHub Actions workflow 必须在默认分支（main）**：放别的分支不会出现在 Actions UI，schedule 也不会跑（曾踩坑）。

3. **Bash 的 cwd 会重置**：执行 hexo/git 命令前务必 `cd /d/blog`。

4. **GitHub 直连不稳**（国内）：`git clone` 常 `Connection was reset`，改用 npm 安装；CDN 用 `fastly.jsdelivr.net` 或本地自托管。

5. **token 权限**：抓 GitHub 贡献数据，细粒度 token 要「All repositories」；经典 token 要 `repo` + `read:user`。只有 `read:user` 看不到**私有仓库**贡献（曾踩坑，导致热力图缺格子）。

6. **网易云音乐播放坑**：VIP 歌只有 30 秒试听（免费接口版权限制）。⚠️ 播放器**别用** `music.163.com/song/media/outer/url?id=X.mp3` 外链——它对 VIP/版权歌返回 HTML 错误页（不是音频），要用 Meting API `api.i-meto.com/meting/api?server=netease&type=song&id=X` 解析 URL（VIP 也给 30s 试听）。另外 APlayer 的 `listMaxHeight` 选项生成的 `max-height:320` 没单位（无效 CSS），歌单会撑满全屏滚不动——已在 `custom.css` 用 `.aplayer-list ol { max-height:320px; overflow-y:auto }` 强制限高滚动。

7. **本地预览端口占用**：旧 `hexo s` 进程杀不干净，用：
   ```bash
   for pid in $(netstat -ano | grep ":4000" | grep -i listen | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid"; done
   ```

8. **`var` 闭包 bug**：循环里写粒子动画必须用 `let`（块级作用域），用 `var` 会导致粒子共享变量卡住（click-effect.js 踩过坑）。

9. **特效别全开**（性能），移动端部分已自动关闭（樱花/爆炸等后来打开了）。

---

## 八、可继续的方向（未做）

- [ ] 音乐：换成免费歌曲（完整播放），或本地 MP3 自托管
- [ ] 换掉 `hello-world` 示例文章（已清掉其 12 个散标签，正文仍是 Hexo 示例内容）
- [ ] 加友链页、相册页
- [ ] 自定义域名
- [ ] 调整各种颜色/参数到满意

---

## 九、技术细节备忘

- **主题配置合并**：`_config.butterfly.yml` 与主题默认配置**深度合并**，只需写要覆盖的键。
- **inject 机制**：Butterfly 通过 `inject.head/bottom` 注入自定义 CSS/JS。
- **`#web_bg` 元素**：只有设置了 `background` 配置才会渲染。
- **Vanta 飞鸟**：依赖 three.js + vanta.birds（本地），初始化在 `source/js/vanta.js`，只作用于 `#page-header.full_page`（首页）。
- **GitHub 热力图数据流**：`fetch_contributions.py`（用 GH_TOKEN 抓 GraphQL）→ `source/data/contributions.json`（保留 weeks 结构）→ `github-heatmap.js` 渲染。
- **GitHub Actions 部署**：`.github/workflows/update-contributions.yml`，每天 08:17（UTC 00:17）抓贡献 + `hexo g` + `actions/deploy-pages` 部署；Pages source 设为「GitHub Actions」。
- **图片导入**：`D:\blog\原始图片` 的 47 张图，用 Python PIL 压缩（`ImageOps.exif_transpose` 修方向 + 缩放到 500px）到 `source/img/blog/`。
- **图片处理**：本机无 PIL/ImageMagick/ffmpeg，用 PowerShell `System.Drawing` 缩放/裁剪（`Image` 加载 → `Bitmap` 目标尺寸 → `DrawImage` → 存 JPEG，透明 PNG 先铺白底）；`file` 命令能读 JPEG 尺寸，PNG 要看完整输出（`1024 x 1024` 带空格）。
- **国内可用的无防盗链图源**：萌娘共享 `storage.moegirl.org.cn`、17173 `i.17173cdn.com`、苹果 App Store 图标（iTunes API `itunes.apple.com/search?term=…&country=us` → `artworkUrl512`，CDN `is1-ssl.mzstatic.com`）、网易云封面 `p*.music.126.net`。维基百科 `upload.wikimedia.org` 被墙（DNS 污染）、4399/百度百科有防盗链。
- **豆瓣图片 CDN 状态**：豆瓣书籍页面和搜索 API 已全面封锁（需要登录，返回 error code 004），但图片 CDN `img*.doubanio.com` 仍可直接下载（有 referer 校验）。获取封面失败时，改用百度搜索图片 API：`curl "https://image.baidu.com/search/flip?tn=baiduimage&word={书名}+封面" | grep -oP 'https://[^"]+\.jpg' | grep -v "baidu\|bdstatic\|bdimg"`。
- **网易云 API**（拿歌 ID/歌单）：搜索 `music.163.com/api/cloudsearch/pc?s=歌名&type=1&limit=1`；用户歌单列表 `music.163.com/api/user/playlist?uid=xxx`；单曲外链 `music.163.com/song/media/outer/url?id=X.mp3`（VIP 歌会返回 HTML，见「坑」第 6 条）。
- **看板娘模型自托管**：从 fghrsh/live2d_api 只下载了 Pio/Tia 的核心文件（index.json、model.moc、默认贴图、motions），model_list.json 精简为两个模型。**默认模型 = `model_list.json` 的 `models` 数组第一项**（当前 Tia 黄头发在前、Pio 女巫在后）。⚠️ 坑：live2d-widget 把选中模型索引存在 localStorage 的 `modelId`/`modelTexturesId`，改 `model_list.json` 顺序后旧缓存会错位；已在 `live2d.js` 里 `localStorage.removeItem` 强制走默认。「textures.cache」404 是正常现象（缺可选的纹理缓存文件，不影响显示）。
- **⚠️ three.js 是旧版**（`REVISION="121"`，自托管 `source/lib/three.min.js`）：`TorusKnotGeometry` 等返回的是**旧 Geometry**（顶点在 `vertices` 数组，不是新版的 `attributes.position`）。做顶点变形要用 `geometry.vertices`（Vector3 数组）+ `geometry.verticesNeedUpdate = true`，别用 `geometry.attributes`（会报 `Cannot read properties of undefined`）。
- **移动端布局**：首页（`#body-wrap:has(#recent-posts)`）简介在上；内页正文在上、侧边栏沉底（`custom.css` 里 `order: -1` 只作用于首页）。移动端提速：Vanta 飞鸟 `window.innerWidth <= 768` 跳过渲染，three/vanta 脚本加 `defer` 异步加载。
- **图片滚动墙无缝循环**（`source/js/marquee.js`）：track 用「两份图片」实现无限循环。⚠️ 坑：循环周期必须量 `imgs[47].getBoundingClientRect().left - imgs[0].getBoundingClientRect().left`（真实周期），不能用 `scrollWidth/2`（会差半个 gap 导致 8px 跳变）；向左回到开头要「先瞬间预定位到等价负位置再平滑过渡」，否则会露出左侧空白。
- **首页 3D 魔方**（`source/js/rubik.js`）：Raycaster 射线选中 cubie，拖拽表面转对应层、右键/双指拖拽转视角、「打乱」按钮。⚠️ 坑：旧版 three.js 的 `getWorldQuaternion(...).invert` 不是函数，要把拖拽方向转到局部空间得用 `new THREE.Matrix4().getInverse(cubeGroup.matrixWorld)` + `transformDirection`；转层方向可用 `FLIP` 变量整体反向（`FLIP=1` 改 `-1`）。⏳ 待改进：转视角用的欧拉角有万向锁，对角线拖拽略拧，待换四元数。
- **访客统计 + 排除自己**（`source/js/visitor-count.js`）：页脚用 Vercount（`events.vercount.one/js`）显示 PV/UV。Vercount 计数是「写入即读取」，无法只读不计数；排除站长自己的做法是——访问 `?owner=1` 一次给本机打 localStorage 标记 `blog_owner`，之后本机不再加载 Vercount 脚本（不计数），页脚显示「站长模式」，想看真实数据用手机/无痕。
