# Mu An's Blog

[![Hexo](https://img.shields.io/badge/Hexo-8.1.2-0e83cd?logo=hexo)](https://hexo.io)
[![Butterfly](https://img.shields.io/badge/Theme-Butterfly_5.7.0-ff69b4)](https://github.com/jerryc127/hexo-theme-butterfly)
[![Node](https://img.shields.io/badge/Node-20-339933?logo=node.js)](https://nodejs.org)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?logo=github-pages)](https://pages.github.com)
[![CI/CD](https://img.shields.io/badge/CI/CD-GitHub_Actions-2088FF?logo=github-actions)](https://github.com/features/actions)

一个基于 Hexo + Butterfly 的个人博客，托管在 GitHub Pages。记录技术成长，也记录生活点滴。

---

## ✨ 项目简介

这是我的个人博客，搭建于 **Hexo 8** 静态站点生成器之上，使用 **Butterfly 5.7.0** 主题并深度定制。博客内容涵盖编程学习笔记（Go 后端、算法题解）、旅行记录、阅读/电影/游戏收藏，以及一些私人随笔。

站点在视觉上下了不少功夫——大量使用 Canvas/WebGL 实现自定义特效（粒子文字、3D 球池、黑洞、漂移墙等），同时通过按需加载策略保证页面轻量快速。

## 🛠️ 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | [Hexo 8](https://hexo.io) |
| 主题 | [Butterfly 5.7.0](https://github.com/jerryc127/hexo-theme-butterfly) |
| 语言 | JavaScript, CSS, Python, HTML |
| 渲染 | EJS, Pug, Stylus, Marked |
| 运行时 | Node.js 20 |
| 托管 | GitHub Pages |
| CI/CD | GitHub Actions |
| 3D 图形 | Three.js, Vanta.js |
| 物理引擎 | Matter.js |
| 地图 | Leaflet + 高德卫星影像 |
| 评论 | Giscus (GitHub Discussions) |
| 统计 | Vercount (访客), Umami (分析) |
| 搜索 | hexo-generator-searchdb (本地搜索) |
| 数学公式 | KaTeX |

## 🌟 主要功能

### 视觉效果

- **粒子文字标题** — 大多数页面标题用 Canvas 粒子渲染，鼠标悬停产生排斥效果
- **首页 3D 变形环面结** — Three.js TorusKnot，顶点波浪形变
- **Vanta.js 飞鸟动态背景** — 首页横幅，3D 鸟群飞过
- **樱花飘落** — 全站固定樱花花瓣飘落
- **点击特效** — NH₄⁺ 文字 + 粉色爱心爆炸 + 核心价值观光影文字
- **自定义鼠标指针** — RGB Cursor Dark 动画
- **3D 球池** — 游戏页顶部横幅，游戏封面作为球体贴图，带重力和碰撞
- **漂移墙** — 书籍页封面 3D 透视漂移墙
- **像素雪** — 电影页标题横幅，WebGL 像素雪
- **胶片画廊** — 旅行页标题横幅，倾斜胶片条随滚动漂移
- **字母故障** — 展示页标题字母故障效果
- **黑洞 GARGANTUA** — 展示页顶部，Three.js 吸积盘+引力透镜，可交互
- **3D 魔方** — 小游戏页可交互 Rubik's Cube
- **3D 标签云** — 侧边栏旋转标签云
- **Skills 桶** — 展示页技术 Logo 下落碰撞（Matter.js）

### 内容模块

- **首页 GitHub 数据** — 贡献热力图 + 关注/仓库/贡献统计卡
- **图片滚动展示墙** — 首页横向无限循环照片墙，点击放大
- **打字机副标题** — 首页多句轮播打字机效果
- **音乐播放器** — 固定迷你播放器（49 首），可折叠，切页自动续播
- **音乐页面** — 394 首专辑网格 + 大播放器，与迷你播放器共用引擎
- **电影/游戏/书籍网格** — 数据驱动的媒体卡片展示
- **电影观看外链** — 离站安全确认页，多层安全校验
- **旅行地图** — 高德卫星影像底图，已访问省份发光高亮
- **旅行胶片画廊** — 多条倾斜胶片条展示旅行照片
- **私密文章** — AES-256-GCM 加密，口令解密，仅当前 Tab 可见
- **交易行情终端** — 暗色终端风格的美股+基金仪表盘
- **展示页** — 关于我/Skills/作品/联系

### 交互与体验

- **评论系统** — Giscus (GitHub Discussions)
- **本地搜索** — 全站搜索
- **访客统计** — Vercount，站长访问不计入
- **打赏灯箱** — 微信/支付宝二维码点击放大
- **Live2D 看板娘** — 右下角交互式看板娘（Pio / Tia 切换）
- **页面资源按需加载** — 首页特效仅在首页加载，非关键资源空闲时加载
- **pjax 预取** — 悬停站内链接时低优先级预取，减少切页卡顿
- **移动端性能守卫** — 移动端限制 DPR，关闭重型 3D 特效
- **夜间模式** — 默认深色模式，可切换浅色
- **图片懒加载** — 原生 lazy loading
- **KaTeX 数学公式** — 文章内公式渲染

## 📁 项目结构

```text
.
├── _config.yml                  # Hexo 主配置
├── _config.butterfly.yml        # Butterfly 主题配置（导航/特效/评论/统计等）
├── package.json                 # 依赖管理
├── source/
│   ├── _posts/                  # 文章目录（Go 后端/算法题/旅行日记等）
│   ├── _data/                   # 数据文件（movies.json, games.json, books.json 等）
│   ├── css/
│   │   ├── custom.css           # 自定义全局样式
│   │   └── finance.css          # 交易终端样式
│   ├── js/                      # 自定义 JS 特效与功能
│   │   ├── page-assets.js       # 资源按需加载管理器
│   │   ├── name-particles.js    # 粒子文字特效
│   │   ├── hero-3d.js           # 首页 3D 环面结
│   │   ├── blackhole.js         # 展示页黑洞
│   │   ├── game-ballpit.js      # 游戏页 3D 球池
│   │   ├── driftwall.js         # 书籍页漂移墙
│   │   ├── pixel-snow.js        # 电影页像素雪
│   │   ├── travel-reel.js       # 旅行页胶片画廊
│   │   ├── watch.js             # 外链安全校验模块
│   │   ├── music-playlist.js    # 全站音乐引擎
│   │   ├── live2d.js            # 看板娘
│   │   ├── private-essays.js    # 私密文章解密
│   │   ├── finance-tracker.js   # 交易行情终端
│   │   └── ...                  # 其他脚本
│   ├── data/                    # 站点数据（JSON）
│   ├── img/                     # 图片资源
│   ├── lib/                     # 第三方库（three.js, leaflet, live2d 等）
│   ├── fun/                     # 音乐/电影/游戏/阅读/小游戏页面
│   ├── showcase/                # 展示页
│   ├── travel/                  # 旅行页
│   ├── finance/                 # 交易行情页
│   ├── watch/                   # 外链安全确认页
│   └── private/                 # 私密文章页
├── scripts/                     # Hexo 辅助脚本
├── .github/workflows/
│   ├── update-contributions.yml # 自动部署 + 更新 GitHub 数据
│   └── watchdog.yml             # 外链站点健康检查
├── test/                        # 安全测试用例
├── tools/                       # 运维工具（域名迁移/续签/加密等）
└── watchdog/                    # 外链监控候选数据
```

## 🚀 本地运行

### 环境要求

- Node.js 20+
- npm

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
hexo clean     # 清理缓存
hexo generate  # 生成静态文件
hexo server    # 启动本地预览
```

默认访问 `http://localhost:4000`。

## 📦 部署

本项目采用 **GitHub Actions** 自动部署到 **GitHub Pages**。

**触发方式**：推送代码到 `main` 分支（本地分支 `source` → 远端 `main`）。

部署流程：

1. `git push origin source:main`
2. GitHub Actions 自动运行：安装依赖 → 抓取 GitHub 贡献数据 → `hexo generate` 构建 → 部署到 Pages
3. 约 1-2 分钟后部署完成

**注意**：不要使用 `hexo deploy` 命令，部署已完全由 GitHub Actions 接管。

### GitHub Secrets

| Secret | 用途 |
| --- | --- |
| `GH_TOKEN` | GitHub API 令牌（用于抓取贡献数据，需 `repo` 和 `user` 权限） |

### 本地配置

修改 `_config.yml` 中的 `deploy` 配置和 `url` 为你的仓库地址：

```yaml
url: https://你的用户名.github.io/
deploy:
  type: git
  repo: git@github.com:你的用户名/你的用户名.github.io.git
  branch: main
```

## 🎨 自定义与配置

### 主要配置文件

| 文件 | 作用 |
| --- | --- |
| `_config.yml` | Hexo 全局配置（站点信息、URL、插件、部署等） |
| `_config.butterfly.yml` | 主题配置（导航菜单、特效开关、评论、统计、社交链接等） |

### 自定义样式

所有自定义 CSS 集中在 `source/css/custom.css`。交易终端样式在 `source/css/finance.css`。

### 自定义 JS

自定义脚本放在 `source/js/` 目录，通过 `_config.butterfly.yml` 的 `inject` 配置注入。

资源加载策略见 `source/js/page-assets.js` —— 重型脚本按页面按需加载，非关键资源在浏览器空闲时加载。

### 修改导航菜单

编辑 `_config.butterfly.yml` 中的 `menu` 配置。

### 添加副标题

编辑 `_config.butterfly.yml` 中的 `subtitle.sub` 列表。

## 📝 创建文章

```bash
hexo new post "文章标题"
```

文章文件生成在 `source/_posts/` 目录下，支持分类和标签。

## 🔧 开发命令

```bash
hexo clean          # 清理生成缓存
hexo generate       # 生成静态文件
hexo server         # 启动本地预览
hexo new post "标题" # 创建新文章
```

## 🔐 特殊设计

### 外链安全机制

电影卡「在线观看」功能涉及跳转到第三方网站。项目实现了一套完整的安全校验系统：

- **Fail Closed** — 任何安全检查不通过均拒绝跳转，没有任何 fallback
- **Allowlist** — 目标域名仅来自人工审核的 `sites.json` 白名单
- **配置哈希绑定** — 安全配置通过跨语言一致的 SHA-256 哈希绑定，防止篡改
- **人工维护许可** — 健康站点需要限时人工维护许可，过期自动失效
- **定时健康检查** — GitHub Actions 每 6 小时自动检查站点 DNS/TLS/HTTP/跳转链
- **候选隔离** — 候选域名完全隔离，不参与跳转决策

详见 `source/js/watch.js`、`watchdog_check.py` 及 `test/` 目录下的测试用例。

### 私密文章

私密文章使用 **AES-256-GCM** 加密存储，口令通过 PBKDF2-SHA256 派生密钥，解密后明文仅存在于当前浏览器 Tab 中。

### 页面资源按需加载

为避免重型脚本拖慢所有页面，实现了 `page-assets.js` 统一管理：

- 首页独占特效（Three.js、Vanta、3D 环面结等）**仅在首页加载**
- 音乐引擎和 3D 标签云在浏览器空闲时（`requestIdleCallback`）加载
- 各 3D 页面的 Three.js 脚本仅在对应页面单独加载

## 📸 页面展示

> 截图待补充。

## 🤝 开发与贡献

这是一个个人博客项目，持续迭代中。欢迎：

- 参考代码实现自己的博客
- 通过 GitHub Issues 提出建议或报告问题
- 如果基于本项目二次开发，请注明来源

## 📄 License

项目未明确指定许可证。

## 👤 Author

**Mu An** — [GitHub](https://github.com/MuAn1228)

---

> 一个不断折腾、不断迭代的个人博客项目。