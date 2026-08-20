# Handoff Document -- 2026-08-20（最终版 v7）

## Context
本次会话完成：粒子标题参数调优、鼠标指针换 RGB Cursor Dark、电影页像素雪、以及「首页挂绳特效」的加入与最终删除。所有改动已推送，等待部署。

## 本次会话完成的工作（2026-08-20）

### 1. 粒子标题参数调优 -- 已推送（4ada2cb）
- 排斥半径 `RADIUS` 从 70 逐步调到 **15**，粒径 `DOT` 从 2 调到 **1.5**
- 文件：`source/js/name-particles.js`

### 2. 鼠标指针换成 RGB Cursor Dark -- 已推送（832e794）
- 移除旧的紫色渐变光点光标（cursor.js 源文件已删除），改为 RGB Cursor Dark 动画
- 样式在 `source/css/custom.css`（`* { cursor: url(...) }` 段）

### 3. 电影页标题横幅：像素雪 -- 已推送（3a7c167）
- `source/js/pixel-snow.js` + `movies/index.md` 容器 + custom.css 样式 + inject.bottom 注入
- 最终调整为：像素雪铺满电影标题横幅，标题文字 `#page-site-info`（z-index:2）在雪之上

### 4. 首页挂绳特效（lanyard）-- 已加入后整体删除
- 加入：`source/js/lanyard.js`（原生 Three.js + Verlet 物理）+ 3:4 照片胸卡 + 程序化金属夹，挂在导航栏 Mu An's Blog 右侧
- 期间多轮修改位置/尺寸/图片方向/调试层（fe22e45），最终用户决定**整体删除**
- 删除（5e954f8）：`lanyard.js`、`lib/GLTFLoader.js`、`img/lanyard/`、`lib/lanyard/`、custom.css 样式、inject 注入
- **`lib/three.min.js` 保留**（hero-3d / rubik / pixel-snow / game-ballpit 都在用）

### 5. 更早的会话（2026-08-19）
- 游戏海报补齐与调整、为书籍/游戏/电影网格统一添加 note 悬停气泡、填充 16 本书阅读笔记 -- 已推送

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
| 4ada2cb | 缩小粒子标题鼠标排斥半径与粒径（RADIUS=15 / DOT=1.5） |
| 832e794 | 鼠标指针换成 RGB Cursor Dark，移除旧紫色光点光标 |
| 3a7c167 | 电影页标题横幅新增像素雪特效 |
| f3d85d4 | 首页标题右侧添加挂绳特效（后经多轮修改） |
| fe22e45 | 挂绳修正：移到导航栏站点名右侧、3:4 照片铺满、修图正立、移除调试层 |
| 5e954f8 | **删除首页挂绳特效**（lanyard.js / GLTFLoader / 资源 / CSS / 注入） |
| f84870d | 删除 FPS 射击小游戏模块 |
| c13b683 | 更新游戏模块：删除血源诅咒/天天酷跑，新增6款，替换植物大战僵尸海报 |
| d35f709 | 更新游戏模块：替换海报、新增9款游戏、删除现代战争2和祖玛 |
| 0612214 | 为书籍/游戏/电影网格添加 note 悬停气泡，并填充书籍阅读笔记 |

## 待处理问题
- 最新提交 `5e954f8` 需手动触发 **「Update Contributions & Deploy」** 工作流（连同此前未部署的改动一起上线）
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
