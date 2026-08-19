# Handoff Document -- 2026-08-19（最终版 v4）

## Context
本次会话完成两件事：删除 FPS 小游戏模块 + 更新游戏模块海报。

## 完成的工作

### 1. 小游戏模块（/fun/arcade/）-- 已推送（f84870d），待部署
- 已删除 FPS 射击模块
- 剩余：Flappy Bird / 魔方 两个标签

### 2. 游戏模块（/fun/games/）-- 进行中，待部署
- **已删除**：血源诅咒、天天酷跑
- **已替换**：植物大战僵尸使用Steam电脑版海报
- **已新增**（6款，有海报）：使命召唤、MW2、元气骑士、祖玛、滑雪大冒险、钢琴块
- **待补充**（9款无海报）：拳皇97、保卫萝卜2、鲨鱼复仇、疯狂小人战斗、air attack、非现实生活、超级玛丽、饥饿鲨鱼进化、GTA罪恶都市

### 3. 搜索功能（local search）-- 已部署
### 4. 书籍模块（fun/books）-- 已推送
### 5. 音乐模块修正 -- 已推送
### 6. 电影模块更新 -- 已推送
### 7. 导航栏中文渲染修复 -- 已推送

## 详细变更记录

| 时间 | 内容 |
|---|---|
| 本次会话（待推送） | 更新游戏模块：删除血源诅咒、天天酷跑；替换植物大战僵尸海报；新增6款游戏（使命召唤系列、元气骑士、祖玛、滑雪大冒险、钢琴块） |
| 本次会话（f84870d） | 删除 FPS 射击小游戏模块 |
| 更早 | 新建小游戏模块 /fun/arcade/：Flappy Bird（固定60Hz时间步长）、魔方（从主页迁入）；导航菜单加「小游戏」入口 |
| 上会话 | 书籍封面路径修正、导航栏中文渲染修复、音乐/电影/书籍模块更新 |

## 待处理问题
- **小游戏模块需重新部署**：f84870d 已推送，需手动触发「Update Contributions & Deploy」工作流
- **游戏模块待部署**：需确认本地预览无误后推送
- **9款移动游戏海报缺失**：拳皇97、保卫萝卜2、鲨鱼复仇、疯狂小人战斗、air attack、非现实生活、超级玛丽、饥饿鲨鱼进化、GTA罪恶都市 — 这些游戏没有 Steam 版，需手动从 TapTap/4399/官网等渠道下载海报

## 关键文件
- source/fun/games/index.md（游戏页面）
- source/data/games.json（游戏数据，含封面路径，共24款）
- source/img/games/game01-33.jpg（游戏海报图片）
- source/js/media-grid.js（网格渲染）
- source/js/game-ballpit.js（球池特效，使用游戏封面作为球体贴图）
- source/css/custom.css（媒体网格样式）
- _config.butterfly.yml（菜单 + inject.bottom）
- source/fun/arcade/index.md（小游戏页面，两个标签：Flappy Bird / 魔方）
- source/js/flappy-bird.js、rubik.js、arcade.js

## 常用命令
```bash
cd /d/blog && hexo clean && hexo s   # 本地预览
git add -A && git commit -m "..." && git push origin source:main  # 推送
```

## 部署
禁止 hexo d，必须 git push origin source:main 触发 GitHub Actions，然后手动触发「Update Contributions & Deploy」。

## 踩坑记录
1. **Flappy Bird 高刷屏加速**：物理按帧计算在 144Hz 下以 2.4 倍速运行，须用固定时间步长（accumulator 累加 delta，按 1/60s 步进）
2. **three.min.js 是 r121 且带 defer**：依赖它的脚本注入时也须加 defer，否则 window.THREE 未定义直接退出
3. **文件名必须 ASCII**：Hexo 服务器不支持中文路径，含中文的文件名会返回 500
4. **books.json 路径必须与实际文件名严格匹配**
5. **Windows Chrome backdrop-filter 渲染 Bug**：.nav-fixed 的 blur + will-change 导致中文亚像素错位
6. **游戏海报来源**：优先使用 Steam CDN（cdn.akamai.steamstatic.com/steam/apps/[appid]/header.jpg），无 Steam 版的移动游戏需从 TapTap/4399 等平台获取，部分经典游戏可从 Wikipedia 获取
7. **Steam API 限制**：中国网络环境下 Steam Store API 可能返回 403/连接超时，建议直接用 CDN URL 下载图片
