# Blog Handoff Prompt Template

> 复制以下完整提示词，粘贴给新对话即可快速恢复上下文。
> 适用于：换设备、换 AI 工具、新开对话、让其他 AI 接手任务。

---

你好，我是博客项目的用户。请先执行以下恢复步骤，然后告诉我当前状态：

```bash
cd /d/blog && git pull
```

然后依次读取以下文件：
1. `D:\blog\docs\tasks\current-task.md`（当前任务状态）
2. `D:\blog\docs\tasks\handoff.md`（完整交接文档）
3. `D:\blog\CLAUDE.md`（项目指南）
4. `D:\blog\BLOG_SETUP.md`（详细配置文档，按需读取）

## 关键信息

| 项 | 值 |
|---|---|
| 目录 | D:\blog |
| 框架 | Hexo 8.x + Butterfly 5.7.0 |
| 部署 | GitHub Actions（source → main） |
| 线上 | https://MuAn1228.github.io/ |
| 仓库 | MuAn1228/MuAn1228.github.io |
| 本地分支 | source |
| 推送命令 | git push origin source:main |
| 本地预览 | hexo clean && hexo s |

## 重要约束

- **禁止 hexo d**：main 是源码，部署由 GitHub Actions 负责
- **先 cd 再操作**：Bash cwd 会重置，每次都要先 cd /d/blog
- **部署后手动触发 Actions**：push 后去 GitHub Actions 触发「Update Contributions & Deploy」

读完所有文件后，用中文回复：当前任务状态、待处理问题、以及你需要我确认的内容。

---

## 本次会话完成的工作（供参考）

1. **小游戏模块（/fun/arcade/）**：新建标签页式小游戏页面，含三个游戏：
   - Flappy Bird（`source/js/flappy-bird.js`，canvas 自包含，固定 60Hz 时间步长防高刷屏加速，GRAVITY=0.38/FLAP=-6.8）
   - FPS 射击（`source/js/fps-game.js`，基于本地 three.min.js r121 重写；Pointer Lock 瞄准 + 按住拖拽降级 + 触屏拖拽）
   - 魔方（`source/js/rubik.js` 从主页迁入，**主页左上角魔方已移除**）
   - 标签切换逻辑在 `source/js/arcade.js`，样式在 custom.css 的 .arcade-* / .fps-* 段
   - 导航「娱乐」下拉新增「小游戏」入口
2. **重要：以上已推送（3ff70e9）但线上尚未部署**，需手动触发「Update Contributions & Deploy」工作流

## 上会话已完成（已推送）

1. **书籍模块修复**：4本书封面路径与文件名不匹配修正；《这世界既残酷也温柔》作者修正为孙宇晨
2. **导航栏中文渲染修复**：Windows Chrome 桌面端导航栏中文字笔画缺失（`backdrop-filter` + `will-change` 亚像素错位），custom.css 追加 font-smoothing + text-rendering 规则
3. **音乐模块修正**：6首歌作者/音源修正
4. **电影模块更新**：移除诺兰4部，新增8部
5. **书籍封面全部更新**：16本书封面替换，PNG转JPEG压缩，文件名 ASCII

## 重要坑（务必记住）

1. **文件名必须 ASCII**：Hexo 服务器不支持中文路径，包含中文的文件名会返回 500。新增图片一律用英文命名
2. **books.json img 路径必须与 source/img/books/ 实际文件名严格匹配**：上次封面替换时用了空格/连字符混合命名，books.json 里写错导致404
3. **网易云获取用户歌单**：`curl "https://api.i-meto.com/meting/api?server=netease&type=playlist&id=2793973232&limit=400"`
4. **Bash cwd 会重置**：每次执行命令前必须 `cd /d/blog`
5. **端口占用**：`for pid in $(netstat -ano | grep ":4000" | grep -i listen | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid"; done`
6. **Windows Chrome 导航栏中文笔画缺失**：原因是 butterfly 主题 `.nav-fixed` 激活时 `backdrop-filter: blur(7px)` + `will-change: transform` 组合触发亚像素错位，已在 custom.css 追加 font-smoothing + text-rendering: optimizeLegibility 修复
