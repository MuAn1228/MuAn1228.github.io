---
title: "Go 接口：接口值，底层值为 nil"
date: 2026-07-11 14:58:00
categories:
  - 学习笔记
  - Go后端
tags:
  - Go
---

#### 定义
如果接口内部的具体值为 nil，则该方法将使用 nil 接收器进行调用。
在某些语言中，这会触发空指针异常，但在 Go 语言中，通常会编写能够优雅地处理接收者为 nil 的情况的方法（如本例中的方法 `M` ）。
请注意，包含 nil 具体值的接口值本身不为 nil。

---

简单来说接口变量的内部具体值可以是 `nil`，但这个接口变量本身并不是 `nil`。只要类型不为 `nil`，接口变量自身就不为 `nil`，即使它的值为 `nil`。
可是这样听起来还是很绕🤣，我们用官方教程中的一段代码来解释

---
#### A Tour Of Go中的实例
此例源自A Tour Of Go——方法和接口——12/26——接口值，底层值为 nil
下面的示例主要说明一点接口变量的内部具体值可以是 `nil`，但这个接口变量本身并不是 `nil`。
```go
package main

import "fmt"

type I interface {
    M()
}

type T struct {
    S string
}

func (t *T) M() {
    if t == nil {                // 检查接收者是否为 nil
        fmt.Println("<nil>")
        return
    }
    fmt.Println(t.S)
}
```
定义接口 `I`，要求有 `M()` 方法。
`*T` 实现了 `M()`，并且 `M()` 内部**对 `nil` 接收者做了优雅处理**：如果 `t` 是 `nil`，打印 `"<nil>"` 而不崩溃。
```go
func main() {
    var i I

    var t *T          // t 是一个 *T 类型的 nil 指针
    i = t             // 把 nil 指针赋给接口变量 i
    describe(i)       // 输出：(&lt;nil&gt;, *main.T)
    i.M()             // 调用 M，内部 t == nil，打印 "<nil>"

    i = &T{"hello"}
    describe(i)       // 输出：(&{hello}, *main.T)
    i.M()             // 打印 "hello"
}

func describe(i I) {
	fmt.Printf("(%v, %T)\n", i, i)
}
```
`var t *T` 声明一个 `*T` 类型的指针，未初始化，值为 `nil`。
`i = t`：接口 `i` 现在**持有**了 `t`，即它内部的具体值是 `nil`，但**接口变量 `i` 本身不是 `nil`**（因为它有类型信息 `*main.T`）。
`describe(i)` 打印 `(%v, %T)`，你会看到值显示为 `<nil>`，而类型是 `*main.T`。
`i.M()` 调用了 `(*T).M`，因为接收者 `t` 是 `nil`，所以走进 `if t == nil` 分支，打印 `"<nil>"`，没有 panic。

---
#### 应掌握的知识点：
##### a) 接口值的两部分：类型 + 值
接口变量实际上是一个 `(类型, 值)` 对：
当 `i = t` 时，接口值是 `(*main.T, nil)`。
 当 `i = &T{"hello"}` 时，接口值是 `(*main.T, &{hello})`。
只要**类型不为 `nil`**，接口变量自身就不为 `nil`，即使它的值为 `nil`。
##### b) 空指针异常不会发生
许多语言（如 Java）中，对一个 `null` 引用调用方法会抛出空指针异常。但在 Go 中，方法可以**检测自己的接收者是否为 `nil`** 并优雅处理。这是一种常见的设计模式，比如处理错误或默认行为。
#### c) 容易踩的坑
```go
var i I
var t *T
i = t
if i != nil {
    // 这里会执行，因为 i 不是 nil（它有类型信息）
    i.M() // 安全，因为 M 处理了 nil 接收者
}
```

但如果你不小心让接口变量本身变成 `nil`（没有类型信息），调用方法就会 panic：
```go
var i I
i.M() // panic: runtime error: invalid memory address or nil pointer dereference
```

所以需要区分“接口本身为 `nil`”和“接口内部值为 `nil`”。