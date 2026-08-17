---
title: "Go 并发：Goroutines"
date: 2026-07-13 23:07:23
categories:
  - 学习笔记
  - Go后端
tags:
  - Go
---

goroutine 是由 Go 运行时管理的轻量级线程。

go f(x, y, z)

启动一个新的 goroutine 运行

f(x, y, z)

`f` 、 `x` 、 `y` 和 `z` 的评估在当前 goroutine 中进行，而 `f` 的执行在新 goroutine 中进行。

Goroutine 运行在同一个地址空间，因此对共享内存的访问必须同步。sync [`sync`](https://go.dev/pkg/sync/) 提供了一些有用的原语，不过在 Go 中你很少会用到它们，因为还有其他原语可用。（参见下一张幻灯片。）