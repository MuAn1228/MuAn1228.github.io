# Current Task

## Goal
维护博客页面特效与娱乐模块：粒子标题、鼠标指针、电影页像素雪、首页挂绳特效（已删除）。

## Status
本次会话改动已全部推送（最新 `5e954f8`），等待用户手动触发 GitHub Actions 部署。

## 本次会话完成（2026-08-20）

### 1. 粒子标题参数调优 -- 已推送（4ada2cb）
- 排斥半径 `RADIUS` 70→**15**，粒径 `DOT` 2→**1.5**（`source/js/name-particles.js`）

### 2. 鼠标指针 RGB Cursor Dark -- 已推送（832e794）
- 旧紫色光点光标已移除，换为 RGB Cursor Dark 动画（样式在 custom.css）

### 3. 电影页像素雪 -- 已推送（3a7c167）
- `source/js/pixel-snow.js`，铺满电影标题横幅，标题文字在雪之上

### 4. 首页挂绳特效（lanyard）-- 已整体删除（5e954f8）
- 曾加入导航栏 Mu An's Blog 右侧的 3:4 照片胸卡挂绳（历经 fe22e45 多轮修正），最终用户要求删除
- 已删除：`lanyard.js`、`lib/GLTFLoader.js`、`img/lanyard/`、`lib/lanyard/`、custom.css 样式、inject 注入
- **`lib/three.min.js` 保留**（hero-3d / rubik / pixel-snow / game-ballpit 在用）

## 已完成工作（更早会话）
- 游戏海报补齐与调整（31 款游戏）
- 书籍/游戏/电影网格 note 悬停气泡 + 16 本书阅读笔记（0612214）
- 小游戏模块 /fun/arcade/（Flappy Bird + 魔方）

## 待处理问题
- **需手动触发 GitHub Actions 部署**：最新提交 `5e954f8`（连同此前未部署改动一起上线）
- 游戏 / 电影的 `note` 字段为空，可继续补充阅读理解

## Next Step
1. 用户在 GitHub 手动触发「Update Contributions & Deploy」
2. 部署后线上验证：粒子标题（RADIUS=15/DOT=1.5）、RGB 光标、电影页像素雪，且首页已无挂绳
3. 后续可继续填充游戏 / 电影的 `note` 字段（编辑 JSON → 本地预览 → commit → push → 提醒手动部署）
