# 项目交接说明（Handoff）

## 项目概况
- 这是一个 Hexo 博客项目（Hexo 8.x + Butterfly 5.7.0 主题）。
- 仓库：https://github.com/MuAn1228/MuAn1228.github.io
- 线上地址：https://MuAn1228.github.io/
- 本地项目根目录：`D:\blog`（Windows）。
- 注意：你的终端/工作目录可能默认不在 `D:\blog`（例如可能在 `d:\code\trae_blog\blog`）。执行任何命令前先确认并切换到 `D:\blog`。

## 构建 / 预览 / 部署
- 本地预览：`hexo clean && hexo s`（默认 http://localhost:4000）
- 部署：`git push origin source:main`（本地分支 `source` → 远端 `main`），然后由用户在 GitHub 上手动触发工作流「Update Contributions & Deploy」。**不要使用 `hexo d`**。
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

## 后续工作方式
1. 改代码 → 本地 `hexo s` 预览验证 → `git commit` → `git push origin source:main` → 提醒用户手动触发部署工作流。
2. 尽量只改需要改的地方，不引入无关变更。