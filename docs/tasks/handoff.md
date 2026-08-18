# Handoff Document -- 2026-08-19 (最终版)

## Context
小游戏模块开发完成，本次会话完整交付记录。

## 完成的工作

### 1. 小游戏模块（/fun/arcade/）-- 已推送（3ff70e9），待部署
### 2. 搜索功能（local search）-- 已部署
### 3. 书籍模块（fun/books）-- 已推送
### 4. 音乐模块修正 -- 已推送
### 5. 电影模块更新 -- 已推送
### 6. 导航栏中文渲染修复 -- 已推送

## 详细变更记录

| 时间 | 内容 |
|---|---|
| 本次会话 | 新建小游戏模块 /fun/arcade/：Flappy Bird（固定60Hz时间步长）、FPS 射击（本地 three.js 重写）、魔方（从主页迁入）；导航菜单加「小游戏」入口；提交 1dc2d95→6665c87→4762f4d→3ff70e9 |
| 上会话 | 书籍封面路径修正、导航栏中文渲染修复、音乐/电影/书籍模块更新 |

## 待处理问题
- **小游戏模块已推送但线上未部署**：需手动触发「Update Contributions & Deploy」工作流

## 关键文件
- source/fun/arcade/index.md（小游戏页面，三标签）
- source/js/flappy-bird.js（固定时间步长，GRAVITY=0.38/FLAP=-6.8）
- source/js/fps-game.js（本地 three.js r121，Pointer Lock + 拖拽降级）
- source/js/rubik.js（魔方，挂载点改为 #arcade-rubik）
- source/js/arcade.js（标签切换，派发 arcade:switch 事件）
- source/css/custom.css（.arcade-* / .fps-* 样式段）
- _config.butterfly.yml（菜单 + inject.bottom）

## 常用命令
```bash
cd /d/blog && hexo clean && hexo s   # 本地预览
git add -A && git commit -m "..." && git push origin source:main  # 推送
```

## 部署
禁止 hexo d，必须 git push origin source:main 触发 GitHub Actions，然后手动触发「Update Contributions & Deploy」。

## 踩坑记录
1. **FPS 点击无响应**：开始遮罩 .fps-overlay 盖住画布拦截点击，点击监听须绑在容器 wrap 上而非 canvas
2. **Flappy Bird 高刷屏加速**：物理按帧计算在 144Hz 下以 2.4 倍速运行，须用固定时间步长（accumulator 累加 delta，按 1/60s 步进）
3. **three.min.js 是 r121 且带 defer**：依赖它的脚本注入时也须加 defer，否则 window.THREE 未定义直接退出
4. **文件名必须 ASCII**：Hexo 服务器不支持中文路径，含中文的文件名会返回 500
5. **books.json 路径必须与实际文件名严格匹配**
6. **Windows Chrome backdrop-filter 渲染 Bug**：.nav-fixed 的 blur + will-change 导致中文亚像素错位
