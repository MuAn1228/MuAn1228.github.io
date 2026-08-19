# Handoff Document -- 2026-08-19（最终版 v6）

## Context
本次会话完成：游戏海报补齐与调整、为书籍/游戏/电影网格统一添加 note 悬停气泡、填充 16 本书阅读笔记。所有改动已推送，等待部署。

## 完成的工作

### 1. 游戏模块（/fun/games/）-- 已推送（d35f709 + 0612214），待部署
- **已删除**：使命召唤：现代战争2、祖玛
- **已替换海报**：使命召唤、元气骑士、滑雪大冒险、钢琴块、我的世界
- **已新增 9 款海报**：拳皇97、保卫萝卜2、鲨鱼的复仇、疯狂小人战斗、air attack、非现实生活、超级玛丽、饥饿鲨鱼进化、侠盗猎车手罪恶都市
- 当前共 **31 款游戏**
- 海报文件：`source/img/games/game01-43.jpg/png`（game09、game16、game20、game22、game31 已无对应条目）

### 2. 书籍 / 游戏 / 电影 note 悬停气泡 -- 已推送（0612214），待部署
- 填充 16 本书的阅读笔记到 `source/data/books.json`
- 为 `games.json` 和 `movies.json` 添加空 `note` 字段
- `media-grid.js` 渲染网格时附加 `data-name/data-sub/data-note`
- 新增 `.media-grid-tip` 鼠标跟随气泡，无 note 时显示「理解待补充…」
- 样式与书籍「漂移墙」气泡保持一致（紫色渐变 + 毛玻璃）

### 3. 小游戏模块（/fun/arcade/）-- 无变动
- 仍保留 Flappy Bird / 魔方 两个标签

### 4. 其他已完成模块（历史）
- 搜索功能（local search）-- 已部署
- 书籍模块（fun/books）-- 已推送
- 音乐模块修正 -- 已推送
- 电影模块更新 -- 已推送
- 导航栏中文渲染修复 -- 已推送

## 提交记录
| Commit | 内容 |
|---|---|
| f84870d | 删除 FPS 射击小游戏模块 |
| c13b683 | 更新游戏模块：删除血源诅咒/天天酷跑，新增6款，替换植物大战僵尸海报 |
| d35f709 | 更新游戏模块：替换海报、新增9款游戏、删除现代战争2和祖玛 |
| 0612214 | 为书籍/游戏/电影网格添加 note 悬停气泡，并填充书籍阅读笔记 |

## 待处理问题
- 最新提交 `0612214` 需手动触发 **「Update Contributions & Deploy」** 工作流
- 游戏和电影的 `note` 字段为空，后续可补充阅读理解

## 如何补充游戏 / 电影笔记
1. 编辑 `source/data/games.json` 或 `source/data/movies.json`
2. 找到对应条目，在 `"note": ""` 中填入理解
3. 多段用 `\n\n` 分隔，双引号 `"` 转义为 `\"`
4. 保存后本地 `hexo s` 预览
5. `git add` 相关文件，`commit`，`git push origin source:main`
6. 提醒用户手动触发部署

## 关键文件
- `source/fun/games/index.md`
- `source/data/games.json`（31 款游戏）
- `source/data/books.json`（16 本书，已填充 note）
- `source/data/movies.json`（16 部电影，已添加空 note）
- `source/js/media-grid.js`（网格渲染 + note 气泡）
- `source/css/custom.css`（`.media-grid-tip` 样式）
- `source/img/games/game01-43.jpg/png`
- `source/fun/arcade/index.md`
- `source/js/flappy-bird.js`、`rubik.js`、`arcade.js`

## 踩坑记录
1. **Flappy Bird 高刷屏加速**：固定 60Hz 时间步长
2. **three.min.js 是 r121 且带 defer**：依赖脚本注入须加 defer
3. **文件名必须 ASCII**
4. **books.json 路径必须与实际文件名严格匹配**
5. **Windows Chrome backdrop-filter 渲染 Bug**
6. **游戏海报来源**：优先 Steam CDN；无 Steam 版的从 TapTap/4399/Google 找
7. **媒体网格 tooltip 定位**：使用 `position: fixed`，需做视口边缘检测，避免溢出
8. **`.media-card` 有 `overflow: hidden`**：tooltip 不能作为子元素放在卡片内部，否则会被裁切
