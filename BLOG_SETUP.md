# 博客搭建记录（Hexo + Butterfly + GitHub Pages）

> 本文件记录整个博客的搭建过程、所有配置与自定义内容，方便继续维护或新对话快速接手。

---

## 一、项目概览

| 项 | 值 |
|----|----|
| 框架 | Hexo 8.x |
| 主题 | Butterfly 5.7.0（npm 安装，位于 `node_modules/hexo-theme-butterfly`） |
| 托管 | GitHub Pages（用户站点） |
| 项目目录 | `C:\Users\liboh\blog` |
| GitHub 用户名 | MuAn1228 |
| 仓库 | `MuAn1228.github.io`（**已公开**，SSH 已配好） |
| 线上地址 | https://MuAn1228.github.io/ |
| 邮箱 | libohang1228@163.com |

---

## 二、常用命令

```bash
cd ~/blog                        # 重要！cwd 经常被重置，务必先 cd 再操作
hexo new "文章标题"               # 新建文章 → source/_posts/xxx.md
hexo s                           # 本地预览 → http://localhost:4000
hexo clean && hexo g && hexo d   # 一键部署上线
```

---

## 三、文件清单（各文件职责）

| 文件 | 作用 |
|------|------|
| `_config.yml` | 站点基础配置（标题 `Mu An's Blog`、作者、URL、部署信息） |
| `_config.butterfly.yml` | **主题配置核心**（特效开关、菜单、社交、评论、音乐、个性化） |
| `source/css/custom.css` | 自定义样式（背景渐变、横幅、看板娘位置/缩放、选中颜色） |
| `source/js/sakura.js` | 樱花飘落特效 |
| `source/js/cursor.js` | 光标跟随光晕（圆点 + 拖尾光环） |
| `source/js/click-effect.js` | 点击特效（爱心爆炸 + 核心价值观光影文字） |
| `source/js/vanta.js` | Vanta 飞鸟背景初始化（仅首页横幅 `#page-header.full_page`） |
| `source/lib/` | 本地自托管库：APlayer、Meting、three.min.js、vanta.birds.min.js |
| `source/img/avatar.png` | 头像（GitHub 头像，已下载本地） |
| `source/tags/ categories/ about/` | 标签 / 分类 / 关于 三个页面 |

---

## 四、已实现功能清单

### 特效
- **渐变背景**：深紫→紫→淡紫→柔粉垂直渐变（`#web_bg`）
- **Vanta 飞鸟背景**：three.js 3D 飞鸟，首页横幅，鼠标互动
- **Live2D 看板娘**：右下角，缩小到 70%，带 7 个工具栏按钮
- **樱花飘落**：全站（移动端关闭）
- **光标光晕**：蓝色圆点 + 拖尾光环
- **点击爱心爆炸**：16 颗粉色线条爱心四散（带重力、减速、渐隐）
- **点击光影文字**：核心价值观词，渐变描金 + 双层光晕
- **加载动画**、**副标题打字机**

### 功能
- **音乐播放器**：Aplayer + Meting（网易云单曲）
- **评论系统**：Giscus（GitHub Discussions，零后端）
- **社交链接**：GitHub + 邮箱
- **头像/站点图标**：GitHub 头像
- **关于/标签/分类** 页面
- **博客运行天数** 统计、页脚签名

---

## 五、关键 ID / 值

| 项 | 值 |
|----|----|
| 网易云歌曲 | LET ME LUV U（mac ova seas / 付思遥），歌曲 ID `2085859568` |
| Giscus repo | `MuAn1228/MuAn1228.github.io` |
| Giscus repo_id | `R_kgDORtelHg` |
| Giscus category_id | `DIC_kwDORtelHs4DDYVx` |
| 建站日期（运行天数） | `2026/08/15`（`_config.butterfly.yml` 的 `runtime_date`） |

---

## 六、想改某样东西 → 去哪改

| 想改 | 文件 | 位置 |
|------|------|------|
| 背景渐变颜色 | `source/css/custom.css` | `#web_bg` 的 `linear-gradient` |
| 横幅/飞鸟背景色 | `source/css/custom.css` | `#page-header.full_page`；飞鸟颜色在 `source/js/vanta.js` |
| 看板娘大小/位置 | `source/css/custom.css` | `#waifu` 的 `transform: scale()`、`right` |
| 点击爆炸爱心数量/颜色 | `source/js/click-effect.js` | `count`、`stroke:#ff69b4` |
| 点击文字内容/光影 | `source/js/click-effect.js` | `CORE` 数组、`background` 渐变、`drop-shadow` |
| 音乐歌曲/歌单 | `_config.butterfly.yml` | `inject` 里 `<meting-js ... id=...>` |
| 评论配置 | `_config.butterfly.yml` | `comments` + `giscus` |
| 作者简介/公告/页脚 | `_config.butterfly.yml` | `aside.card_author`、`card_announcement`、`footer` |
| 菜单栏 | `_config.butterfly.yml` | `menu` |
| 头像/图标 | `source/img/avatar.png`（替换文件）+ `_config.butterfly.yml` 的 `avatar`/`favicon` |
| 樱花数量/速度 | `source/js/sakura.js` | 顶部参数 |
| 特效开关 | `_config.butterfly.yml` | `canvas_nest`、`fireworks`、`click_heart`、`activate_power_mode`、`subtitle`、`preloader` 等 |

---

## 七、坑与注意事项（重要！）

1. **Bash 的 cwd 会重置**：每次执行 hexo 命令前务必 `cd ~/blog`，否则报 `Usage: hexo <command>`。
2. **GitHub 直连不稳**（国内）：`git clone` 经常 `Connection was reset`，改用 **npm 安装**（npm registry 稳定）。
3. **第三方 CDN 用 `fastly.jsdelivr.net`**（国内较稳），或**本地自托管**到 `source/lib/`（最稳，当前 three.js/vanta/APlayer/Meting 都是本地）。
4. **本地预览端口占用**：旧 `hexo s` 进程杀不干净，会占 4000 端口。用：
   ```bash
   for pid in $(netstat -ano | grep ":4000" | grep -i listen | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid"; done
   ```
5. **特效别全开**（性能），移动端已自动关闭樱花/爆炸等。
6. **`var` 闭包 bug**：循环里写粒子动画必须用 `let`（块级作用域），用 `var` 会导致所有粒子共享变量、卡住不散（已在 click-effect.js 踩过坑并修复）。
7. **不蒜子统计（busuanzi）**：Butterfly 默认开启，但其服务 `busuanzi.ibruce.info` 经常 502，属第三方故障，非本博客问题。

---

## 八、可继续的方向（未做）

- [ ] 换掉 `hello-world` 示例文章，写第一篇真正的文章
- [ ] 加友链页、相册页（瀑布流）
- [ ] 自定义域名（`MuAn1228.github.io` → 自己的域名）
- [ ] 音乐换成用户自己的歌单/单曲
- [ ] 调整各种颜色、参数到满意为止

---

## 九、技术细节备忘

- **主题配置合并**：`_config.butterfly.yml` 与主题默认配置**深度合并**，只需写要覆盖的键。
- **inject 机制**：Butterfly 通过 `inject.head/bottom` 注入自定义 CSS/JS，HTML 标签要加单引号包裹。
- **`#web_bg` 元素**：只有设置了 `background` 配置才会渲染（否则背景元素不存在）。
- **Vanta 飞鸟**：依赖 three.js（本地 `source/lib/three.min.js`）+ vanta.birds（本地），初始化在 `source/js/vanta.js`，只作用于 `#page-header.full_page`（首页）。
