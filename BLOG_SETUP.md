# 博客搭建记录（Hexo + Butterfly + GitHub Pages）

> 本文件记录整个博客的搭建过程、所有配置与自定义内容，方便继续维护或新对话快速接手。
> 最后更新：2026-08-15

---

## 一、项目概览

| 项 | 值 |
|----|----|
| 框架 | Hexo 8.x |
| 主题 | Butterfly 5.7.0（npm 安装，位于 `node_modules/hexo-theme-butterfly`） |
| 托管 | GitHub Pages（用户站点，**GitHub Actions 部署**） |
| 项目目录 | `C:\Users\liboh\blog` |
| GitHub 用户名 | MuAn1228 |
| 仓库 | `MuAn1228.github.io`（已公开，SSH 已配好） |
| 线上地址 | https://MuAn1228.github.io/ |
| 邮箱 | libohang1228@163.com |
| 分支 | **部署分支 = `main`**（GitHub 默认分支，workflow 从 main 构建部署）；`source` = 备份；⚠️ 本地 checkout 在 `source`，提交后 `git push origin source:main` |

> ⚠️ **部署架构已从 `hexo d` 改成 GitHub Actions**（Pages artifact 部署）。`main` 分支现在是**源码**（不是部署产物），网站由 workflow 构建部署。

---

## 二、常用命令

```bash
cd ~/blog                        # 重要！cwd 经常被重置，务必先 cd 再操作
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
| `source/js/live2d.js` | 看板娘（自托管模型，只保留 Pio/Tia） |
| `source/js/tagcloud.js` | 3D 标签云（TagCanvas） |
| `source/js/marquee.js` | 图片滚动墙（左右按钮 + 点击放大） |
| `source/js/github-heatmap.js` | GitHub 热力图（自渲染，紫色调） |
| `source/js/typing.js` | 简介打字机效果 |
| `source/lib/` | 本地自托管库：APlayer、Meting、three.js、vanta、tagcanvas |
| `source/live2d_api/` | 看板娘模型（Potion-Maker/Pio + Tia，精简版） |
| `source/data/contributions.json` | GitHub 贡献数据（workflow 自动抓取） |
| `source/img/blog/` | 图片滚动墙的 47 张图片 |
| `source/img/` | 头像、社交二维码（微信/抖音/QQ）、打赏二维码 |
| `source/_data/widget.yml` | 自定义侧边栏卡片（GitHub 统计、热门文章、打赏） |
| `source/_posts/算法题/` | 18 篇力扣算法笔记 |
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
- **算法笔记**：18 篇力扣题（算法题分类 + 导航菜单入口）
- **旅行地图**：中国省份 SVG 地图（维基公有领域），已去过的省紫色高亮、可点击跳转该省文章；写旅行文章只需 front-matter 写 `categories: [旅行, 省份名]`（如 `[旅行, 四川]`），地图自动高亮该省
- **头像/站点图标**、**关于/标签/分类** 页面、**博客运行天数**

---

## 五、关键 ID / 值

| 项 | 值 |
|----|----|
| 网易云歌曲 | LET ME LUV U（mac ova seas / 付思遥），ID `2085859568`（⚠️ VIP 歌，只有 30 秒试听） |
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
| 音乐歌曲 | `_config.butterfly.yml` | `inject` 里 `<meting-js ... id=...>` |
| 评论配置 | `_config.butterfly.yml` | `comments` + `giscus` |
| 社交图标 | `_config.butterfly.yml` | `social` |
| 打赏/热门文章/统计卡 | `source/_data/widget.yml` | 对应卡片 |
| 作者简介/公告 | `_config.butterfly.yml` | `aside.card_author`、`card_announcement` |
| 菜单栏 | `_config.butterfly.yml` | `menu` |
| 旅行地图省份/颜色 | `source/js/travel-map.js` + `source/css/custom.css` | `PROVINCES` 映射、`.cn-province.visited` 紫色 |
| 特效开关 | `_config.butterfly.yml` | `canvas_nest`、`fireworks`、`subtitle`、`preloader` 等 |

---

## 七、坑与注意事项（重要！）

1. **部署架构改了**：现在用 GitHub Actions（Pages artifact），**不要再用 `hexo d`**（会把 main 分支覆盖成 public/，破坏源码）。改内容后 `git push origin source:main` + 触发 workflow。

2. **GitHub Actions workflow 必须在默认分支（main）**：放别的分支不会出现在 Actions UI，schedule 也不会跑（曾踩坑）。

3. **Bash 的 cwd 会重置**：执行 hexo/git 命令前务必 `cd ~/blog`。

4. **GitHub 直连不稳**（国内）：`git clone` 常 `Connection was reset`，改用 npm 安装；CDN 用 `fastly.jsdelivr.net` 或本地自托管。

5. **token 权限**：抓 GitHub 贡献数据，细粒度 token 要「All repositories」；经典 token 要 `repo` + `read:user`。只有 `read:user` 看不到**私有仓库**贡献（曾踩坑，导致热力图缺格子）。

6. **网易云 VIP 歌曲只有 30 秒试听**（Meting 免费接口的版权限制，无法绕过）；Meting API（api.i-meto.com）可能 403/限流。

7. **本地预览端口占用**：旧 `hexo s` 进程杀不干净，用：
   ```bash
   for pid in $(netstat -ano | grep ":4000" | grep -i listen | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid"; done
   ```

8. **`var` 闭包 bug**：循环里写粒子动画必须用 `let`（块级作用域），用 `var` 会导致粒子共享变量卡住（click-effect.js 踩过坑）。

9. **特效别全开**（性能），移动端部分已自动关闭（樱花/爆炸等后来打开了）。

---

## 八、可继续的方向（未做）

- [ ] 音乐：换成免费歌曲（完整播放），或本地 MP3 自托管
- [ ] 换掉 `hello-world` 示例文章
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
- **图片导入**：`D:\photo\blog` 的 47 张图，用 Python PIL 压缩（`ImageOps.exif_transpose` 修方向 + 缩放到 500px）到 `source/img/blog/`。
- **看板娘模型自托管**：从 fghrsh/live2d_api 只下载了 Pio/Tia 的核心文件（index.json、model.moc、默认贴图、motions），model_list.json 精简为两个模型。
