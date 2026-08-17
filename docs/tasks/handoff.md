# Handoff Document -- 2026-08-18

## Context
用户切换工具，本次会话完整交付记录。

## 完成的工作
1. 搜索功能（local search）-- 已部署
2. 书籍模块（fun/books）-- 已推送到 main 分支

## 待处理问题
- 书籍封面图片暂无（豆瓣被封），需手动放到 source/img/books/ 并更新 books.json
- 本地 3 个未推送 commit：a9916e1, a9dcf9b, a9da385

## 关键文件
- source/data/books.json
- source/fun/books/index.md
- source/js/media-grid.js
- _config.butterfly.yml
- _config.yml

## 常用命令
cd /d/blog && hexo clean && hexo s
git add -A && git commit -m ... && git push origin source:main

## 部署
禁止 hexo d，必须 git push origin source:main 触发 GitHub Actions。
