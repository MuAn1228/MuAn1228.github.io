---
title: "Go 接口：Stringers"
date: 2026-07-12 11:48:54
categories:
  - 学习笔记
  - Go后端
tags:
  - Go
---

Stringers没有办法直译成中文😂
#### 定义
[`fmt`](https://go.dev/pkg/fmt/) 包定义的 [`Stringer`](https://go.dev/pkg/fmt/#Stringer) 是最普遍使用的接口之一。
```go
type Stringer interface {
    String() string
}
```
`Stringer` 是一种可以将自身描述为字符串的类型 `fmt` 包 （以及许多其他用户）都希望通过此接口打印值。

---

Stringer让你能**自定义类型的打印格式**。

#### 1. Stringer 接口是什么？

`fmt` 包中定义了这样一个接口：
```go
type Stringer interface {
    String() string
}
```
任何类型只要实现了 `String() string` 方法，就自动满足 `Stringer` 接口。

---

#### 2. 它有什么用？
当你用 `fmt.Println`、`fmt.Printf` 等函数打印一个值时，如果这个值的类型实现了 `Stringer`，**`fmt` 就会自动调用它的 `String()` 方法，用返回的字符串来代替默认的打印格式**

这就像给类型装了一个“自我介绍”按钮，打印时就按你定义的方式说话。

---

#### 3. A Tour Of Go中的实例
此例源自A Tour Of Go——方法和接口——17/26——Stringers
```go
type Person struct {
    Name string
    Age  int
}
func (p Person) String() string {
    return fmt.Sprintf("%v (%v years)", p.Name, p.Age)
}
```
`Person` 结构体有两个字段：`Name` 和 `Age`。
`String()` 方法的接收者是 `Person`（值类型），它返回一个格式化好的字符串，例如 `"Arthur Dent (42 years)"`。

```go
a := Person{"Arthur Dent", 42}
z := Person{"Zaphod Beeblebrox", 9001}
fmt.Println(a, z)
```
如果没有 `String()` 方法，`fmt.Println(a, z)` 会打印：` {Arthur Dent 42} {Zaphod Beeblebrox 9001}`（结构体默认格式）。

因为 `Person` 实现了 `Stringer`，所以实际输出是：

```text
Arthur Dent (42 years) Zaphod Beeblebrox (9001 years)
```

可读性大大提升。

---

#### 4. 为什么说 `Stringer` 无处不在？

很多 Go 标准库的类型都实现了 `Stringer`，例如 `time.Time`、`net.IP` 等。你也可以给自己的类型轻松加上，使得打印日志、调试信息时更加清晰友好。

---

`Stringer` 接口让你可以自定义类型在打印时的字符串表示，`fmt` 包会自动调用它。本示例通过 `Person` 类型实现了 `String()` 方法，让打印输出变成了可读的句子，而不是生硬的结构体字段列表。