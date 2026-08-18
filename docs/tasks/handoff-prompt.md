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

1. **电影模块更新**：移除诺兰4部（盗梦空间、敦刻尔克、信条、奥本海默），新增8部（阿甘正传、我不是药神、功夫、重庆森林、流浪地球、流浪地球2、小丑、九品芝麻官）
2. **书籍封面全部更新**：16本书封面替换为 D:/photo/book/ 原图，PNG转JPEG压缩，所有文件名为 ASCII
3. **音乐模块修正**：6首歌作者/音源已修正（单车→卿卿酱、恋→饼饼/慵狐/倚云听风雨、I Really Want to Stay at Your House→Samuel Kim/Lorien、De Yang Gatal Gatal Sa→布灵布灵Duang、溯→三叶、新增形容→沈以诚）

## 重要坑（务必记住）

1. **文件名必须 ASCII**：Hexo 服务器不支持中文路径，包含中文的文件名会返回 500。新增图片一律用英文命名
2. **网易云获取用户歌单**：`curl "https://api.i-meto.com/meting/api?server=netease&type=playlist&id=2793973232&limit=400"`
3. **Bash cwd 会重置**：每次执行命令前必须 `cd /d/blog`
4. **端口占用**：`for pid in $(netstat -ano | grep ":4000" | grep -i listen | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid"; done`
