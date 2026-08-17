# Current Task

## Goal
把 Obsidian 中的 Go 后端笔记和力扣面试 150 题笔记迁移到 Hexo 博客，做好标签/分类，并发布。

## Status
completed

## Completed
- 检查两个 Obsidian 目录结构和内容
- 确认力扣 26/27/88 已存在于博客，为其增加「面试150题」标签
- 生成 19 篇 Go 笔记 + 1 篇 C 语言入门文章，目录 `source/_posts/Go后端/`
- Go 笔记分类：学习笔记 / Go后端，标签：Go
- C 语言入门分类：学习笔记 / C语言，标签：C语言
- 本地 `hexo clean && hexo s` 预览通过，无报错
- 删除临时导入脚本（避免 Hexo 自动执行）
- 已提交并推送到 `origin source:main`，提交哈希 `502efda`

## In Progress
无

## Modified Files
- `source/_posts/算法题/力扣26.md`（新增 tag「面试150题」）
- `source/_posts/算法题/力扣27.md`（新增 tag「面试150题」）
- `source/_posts/算法题/力扣88.md`（新增 tag「面试150题」）
- `source/_posts/Go后端/`（新建 19 篇文章）
- `source/_posts/C语言入门五关卡.md`（新建）
- `docs/tasks/current-task.md`

## Current Problems
无

## Current Errors
无

## Attempts
- 使用 Node.js 脚本批量生成 front-matter 和复制内容
- 发现脚本放在 `scripts/` 会被 Hexo 自动执行，已删除

## Failed Attempts
无

## Decisions
- 力扣面试 150 题中 26/27/88 已发布，通过新增 tag「面试150题」将其归入系列
- Go 笔记标题按子目录前缀为「Go 接口 / Go 方法 / Go 泛型 / Go 并发」
- C入门.md 单独作为 C 语言入门文章发布

## Next Step
执行 `git add -A && git commit && git push origin source:main`，然后用户手动触发 GitHub Actions「Update Contributions & Deploy」。

## Do Not Repeat
不要把临时脚本放在 `scripts/` 目录，Hexo 会自动执行该目录下所有 .js。

## Verification
- 本地 Hexo 预览正常启动
- 文章总数从 20 增加到 40
- Go 后端目录 19 篇 + C 语言 1 篇
