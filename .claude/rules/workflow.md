# Agent 工作流规则

## 任务开始前

1. 读取 `CLAUDE.md`。
2. 读取 `docs/tasks/current-task.md`。
3. 检查 `git status` 和当前分支。
4. 只读取与任务直接相关的文件；不要全仓库扫描。

## 任务进行中

1. **小步快跑**: 小范围修改 → 最小验证 → 继续下一步。
2. **优先增量修改**: 用 `Edit` 而非整文件重写，减少 diff 和上下文噪音。
3. **及时验证**: 改完 JS/CSS 后本地 `hexo clean && hexo s`；改配置后必须 `hexo clean`。
4. **Git 作为状态层**: 关键阶段后检查 `git diff`；稳定后建议用户 commit，不擅自提交。
5. **避免重复**: 不重新读取已理解且未变化的文件；不重复尝试已失败的方案。

## 任务状态维护

维护 `docs/tasks/current-task.md`，在以下时机更新：

- 开始新任务
- 完成重要阶段
- 方案失败
- 技术路线变化
- 上下文接近上限
- Session 结束
- 任务完成

## 输出控制

默认只报告：

1. 修改了哪些文件
2. 每个文件的关键改动
3. 验证结果
4. 是否还有问题
5. 下一步

不重复贴出已写入文件的完整代码，不逐行解释显而易见的内容。

## 部署

1. 停止本地 `hexo s`。
2. `cd /d/blog && git add -A && git commit -m "..." && git push origin source:main`
3. 提醒用户去 GitHub Actions 手动触发「Update Contributions & Deploy」。
4. 不要用 `hexo d`。
