# Handoff Document -- 2026-08-18 (更新)

## Context
用户切换工具，本次会话完整交付记录。

## 完成的工作
1. 搜索功能（local search）-- 已部署
2. 书籍模块（fun/books）-- 已推送到 main 分支
3. 书籍封面图片 -- 全部 13 本已完成

## 书籍封面获取方法
由于豆瓣搜索 API 需要登录（error code: 004），无法通过编程方式自动获取。
使用百度搜索图片 API 成功获取了所有书籍封面：
```bash
curl -s --max-time 15 "https://image.baidu.com/search/flip?tn=baiduimage&word={书名}+封面&pn=0&rn=5" \
  | grep -oP 'https://[^"]+\.jpg' \
  | grep -v "baidu\|bdstatic\|bdimg\|placeholder" \
  | head -1
```
然后下载并保存到 `source/img/books/{书名}.jpg`

## 待处理问题
无

## 关键文件
- source/data/books.json
- source/fun/books/index.md
- source/js/media-grid.js
- _config.butterfly.yml
- _config.yml
- source/img/books/ (包含 13 张封面图片)

## 常用命令
cd /d/blog && hexo clean && hexo s
git add -A && git commit -m ... && git push origin source:main

## 部署
禁止 hexo d，必须 git push origin source:main 触发 GitHub Actions。
