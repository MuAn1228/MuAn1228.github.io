# 上下文管理规则

## 读取原则

1. **先定位，再读取**: 用 `Grep`/`Glob`/`git status` 找到相关文件，再读内容。
2. **不要全仓扫描**: 除非任务明确要求审计或迁移，否则不遍历整个仓库。
3. **不读无关目录**: 默认不读 `node_modules/`、`public/`、`.deploy_git/`、缓存、二进制、构建产物。
4. **不重复读取**: 已经理解且未变化的文件不再读取。
5. **大型文件**: 超过几百行的文件优先用 `Grep` 定位或用 `offset/limit` 读相关区间。

## 搜索优先级

1. `git status` / `git diff`
2. `Grep` 关键字
3. 读取相关文件
4. 必要时 `Glob` 列举

## 大型日志处理

只提取：ERROR、WARN、FAIL、stack trace、相关时间段、相关模块。不要把完整日志塞进上下文。

## 跨 Session 交接

新 Session 接手时只依赖：

- `CLAUDE.md`
- `docs/tasks/current-task.md`
- 当前代码
- `git status`
- `git diff`

若 `current-task.md` 与代码状态冲突，以代码/git/测试结果为准，先修正任务文档。

## 上下文接近上限

当出现 context warning 或 auto-compaction：

1. 完成当前最小闭环。
2. 更新 `docs/tasks/current-task.md`。
3. 记录最新错误、已验证结果、已失败方案、下一步。
4. 建议用户使用 `/compact` 或开启新 Session。

## 工具使用

- 能用 CLI 完成的轻量任务，不启动 MCP。
- 不相关任务之间使用 `/clear`。
- 长任务持续使用同一 Session，必要时 `/compact`。
