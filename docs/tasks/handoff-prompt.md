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
