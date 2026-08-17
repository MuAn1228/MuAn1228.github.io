# Mu An's Blog — Claude Code 项目指南

> 个人博客，Hexo + Butterfly 主题，部署到 GitHub Pages。
> 详细交接文档见 `BLOG_SETUP.md`；本文件只保留长期稳定的项目级信息。

## 项目概览

| 项 | 值 |
|---|---|
| 目录 | `D:\blog` |
| 框架 | Hexo 8.1.2 |
| 主题 | Butterfly 5.7.0（npm 包） |
| 部署 | GitHub Pages via GitHub Actions |
| 仓库 | `MuAn1228/MuAn1228.github.io` |
| 线上地址 | https://MuAn1228.github.io/ |
| 本地分支 | `source` |
| 远程目标 | `git push origin source:main` |

## 常用命令

```bash
# 所有操作前必须先 cd 到项目目录
cd /d/blog

# 本地预览（改配置后必须 clean）
hexo clean && hexo s

# 新建文章
hexo new "文章标题"

# 部署：提交源码后手动触发 GitHub Actions「Update Contributions & Deploy」
git add -A && git commit -m "..." && git push origin source:main
```

> 禁止 `hexo d`：main 分支现在是源码，部署由 GitHub Actions 负责。

## 核心文件地图

| 文件/目录 | 职责 |
|---|---|
| `_config.yml` | 站点基础配置 |
| `_config.butterfly.yml` | 主题配置：菜单、特效、社交、评论、音乐等 |
| `source/css/custom.css` | 所有自定义样式 |
| `source/js/*.js` | 自定义交互/特效脚本 |
| `source/_posts/算法题/` | 算法题文章 |
| `source/fun/` | 娱乐页（音乐/电影/游戏/书籍） |
| `source/data/` | 游戏/电影/音乐/书籍 JSON 数据、GitHub 贡献数据 |
| `source/_data/widget.yml` | 侧边栏自定义卡片 |
| `source/lib/` | 本地自托管库（three.js r121、APlayer、Meting 等） |
| `fetch_contributions.py` | GitHub Actions 抓取贡献数据 |
| `.github/workflows/update-contributions.yml` | 自动抓取贡献 + 构建部署 |
| `BLOG_SETUP.md` | 完整交接文档（配置、ID、踩坑记录） |

## 重要约束

1. **部署**: 改完内容后 `git push origin source:main`，然后去 GitHub Actions 手动触发「Update Contributions & Deploy」。不要用 `hexo d`。
2. **本地预览**: `hexo clean && hexo s`，端口 4000。端口被占时见 `BLOG_SETUP.md` 第 7 条。
3. **three.js r121**: 旧版 API，`TorusKnotGeometry` 等几何体顶点在 `geometry.vertices` 数组，不要用 `geometry.attributes.position`。
4. **网易云音乐**: VIP/版权歌曲不要用 `music.163.com/song/media/outer/url?id=X.mp3`，会返回 HTML；用 Meting API `api.i-meto.com/meting/api?server=netease&type=song&id=X`。
5. **算法题标签规范**: `tags` 只写「力扣」，难度/比赛类型写入 `categories` 子分类。
6. **Vercount 排除自己**: 访问 `?owner=1` 一次后本机不计数。

## 开发习惯

- 特效/交互优先放 `source/js/*.js`，样式放 `source/css/custom.css`，注入在 `_config.butterfly.yml`。
- 小范围修改 → 立即本地验证 → 继续修改。
- 不要主动扫描 `node_modules/`、`public/`、`.deploy_git/`、大型日志或构建产物。
- 跨 Session 任务状态见 `docs/tasks/current-task.md`。
