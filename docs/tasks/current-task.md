# Current Task

## Goal
更新游戏模块：新增14个游戏，删除2个旧游戏，替换植物大战僵尸海报。

## Status
in_progress — 已完成海报下载和数据更新，待本地验证后推送

## 本次会话完成

### 游戏模块（/fun/games/）— 进行中
- **已删除**：血源诅咒（game09）、天天酷跑（game16）
- **已替换**：植物大战僵尸使用Steam电脑版海报（game23）
- **已新增**（Steam来源，海报已下载）：
  - 使命召唤（game21，Steam COD4 appid=4400）
  - 使命召唤：现代战争2（game22，Steam MW2 appid=1938090）
  - 元气骑士（game30，Steam Soul Knight appid=2399370）
  - 祖玛（game31，Steam Zuma Deluxe appid=1659420）
  - 滑雪大冒险（game32，Steam Ski Safari appid=413150）
  - 钢琴块（game33，Steam Piano Tiles appid=2050650）
  
- **待处理**（无Steam版，需手动补充海报）：
  - 拳皇97
  - 保卫萝卜2
  - 鲨鱼复仇
  - 疯狂小人战斗
  - air attack
  - 非现实生活
  - 超级玛丽
  - 饥饿鲨鱼进化
  - 侠盗猎车手：罪恶都市

### 小游戏模块（/fun/arcade/）— 已推送（f84870d）
- 已删除 FPS 射击模块
- 剩余：Flappy Bird / 魔方

### 已完成工作
1. 删除 FPS 射击小游戏模块（f84870d）
2. 更新游戏模块海报和列表（games.json + 27张海报）
3. 更新交接文档

## 待处理问题
- 9个移动游戏暂无海报，需手动从 TapTap/4399 等平台下载
- 需本地预览验证游戏模块显示效果

## Modified Files
- source/data/games.json（更新游戏列表，共24款）
- source/img/games/game21-33.jpg（新增7张海报）

## Next Step
1. 本地预览验证游戏模块
2. 补充缺失的9个游戏海报或暂时跳过
3. git commit && git push origin source:main
4. 提醒用户手动触发部署工作流
