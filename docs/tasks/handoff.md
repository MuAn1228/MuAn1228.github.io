# Handoff Document -- 2026-08-18 (最终版)

## Context
用户切换工具，本次会话完整交付记录。

## 完成的工作

### 1. 搜索功能（local search）-- 已部署
### 2. 书籍模块（fun/books）-- 已推送
### 3. 书籍封面图片 -- 全部 16 本已完成
### 4. 音乐模块修正 -- 已推送
### 5. 电影模块更新 -- 已推送
### 6. 导航栏中文渲染修复 -- 已推送

## 详细变更记录

| 时间 | 内容 |
|---|---|
| 上会话 | 搜索功能部署；书籍封面16本替换为 D:/photo/book/ 原图（PNG→JPEG，ASCII文件名）；音乐模块6首作者/音源修正；电影模块替换8部 |
| 本次会话 | 4本书封面路径与 books.json 不匹配修正；《这世界既残酷也温柔》作者：余华→孙宇晨；Windows Chrome 导航栏中文笔画缺失修复（custom.css 追加 font-smoothing + text-rendering） |

## 待处理问题
无

## 关键文件
- source/data/books.json
- source/data/music.json
- source/js/music-playlist.js
- source/js/media-grid.js
- source/css/custom.css（含导航栏字体渲染修复）
- _config.butterfly.yml
- _config.yml
- source/img/books/（16 张封面图片，全 ASCII 文件名）
- source/img/music/（s u.jpg、xingrong.jpg、gatal.jpg 等）
- docs/tasks/handoff-prompt.md（会话交接模板）

## 常用命令
```bash
cd /d/blog && hexo clean && hexo s   # 本地预览
git add -A && git commit -m "..." && git push origin source:main  # 部署
```

## 部署
禁止 hexo d，必须 git push origin source:main 触发 GitHub Actions，然后手动触发「Update Contributions & Deploy」。

## 踩坑记录
1. **books.json 路径必须与实际文件名严格匹配**：封面替换时文件名用了空格（`dahua datastructure.jpg`），但 books.json 里写的是下划线（`dahua_data_structure.jpg`），导致404
2. **Windows Chrome backdrop-filter 渲染 Bug**：butterfly 主题 `.nav-fixed` 激活时 `backdrop-filter: blur(7px)` + `will-change: transform` 导致中文字亚像素错位，笔画直接缺失；移动端不触发此问题
3. **网易云 API 需要登录**：豆瓣搜索 API 返回 error code 004，改用百度搜索图片 API 获取封面
4. **文件名必须 ASCII**：Hexo 服务器不支持中文路径，含中文的文件名会返回 500
