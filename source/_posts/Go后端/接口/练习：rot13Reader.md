---
title: "Go 接口：练习：rot13Reader"
date: 2026-07-13 18:53:52
categories:
  - 学习笔记
  - Go后端
tags:
  - Go
---

此例源自A Tour Of Go——方法和接口——23/26——练习：rot13Reader
常见的模式是使用 [io.Reader](https://go.dev/pkg/io/#Reader) 包装另一个 `io.Reader` ，以某种方式修改流。
例如， [gzip.NewReader](https://go.dev/pkg/compress/gzip/#NewReader) 函数接受一个 `io.Reader` （压缩数据流），并返回一个 `*gzip.Reader` ，该 *gzip.Reader 也实现了 `io.Reader` （解压缩数据流）。
实现一个 `rot13Reader` ，它实现了 `io.Reader` 接口，并从 `io.Reader` 中读取数据，通过将 [rot13](https://en.wikipedia.org/wiki/ROT13) 替换密码应用于所有字母字符来修改流。
我们为您提供了 `rot13Reader` 类型。请通过实现其 `Read` 方法将其转换为 `io.Reader` 
类型。

题目代码：
```go
package main

import (
	"io"
	"os"
	"strings"
)

type rot13Reader struct {
	r io.Reader
}

func main() {
	s := strings.NewReader("Lbh penpxrq gur pbqr!")
	r := rot13Reader{s}
	io.Copy(os.Stdout, &r)
}

```

#### 核心原理
`rot13Reader` 内部持有一个 `io.Reader`，你要**从它那里读取数据**，而不是自己生成数据。
然后对读到的数据进行 **rot13 加密/解密**（因为是可逆的，加密解密同一套算法）。
最后返回处理后的字节数和遇到的错误（如果有）。

**rot13 变换规则** 详细信息见维基百科
只对英文字母进行移位：
大写字母 A-M → N-Z；N-Z → A-M。
小写字母 a-m → n-z；n-z → a-m。
非字母字符原样保留。
 
**Read 方法实现步骤**
调用 `r.r.Read(b)`，从内部读取器读取数据到 `b` 中，获得实际读取的字节数 `n` 和错误 `err`。
对 `b[:n]` 中的每个字节应用 rot13 变换。
返回 `n` 和 `err`（这样调用者能知道是否读到了末尾或出错）。

目标代码：
```go
package main

import (
	"io"
	"os"
	"strings"
)

type rot13Reader struct {
	r io.Reader
}

func (rot *rot13Reader) Read(b []byte) (int,error){
	n,err := rot.r.Read(b)
	if n>0 {
		for i := 0; i<n; i++{
			b[i] = rot13(b[i])
		}
	}
	return n,err
}

func rot13 (c byte) byte{
	switch {
	case c >= 'A' && c <= 'Z':
		return 'A'+(c-'A'+13)%26
	case c >= 'a' && c <= 'z':
		return 'a'+(c-'a'+13)%26
	default:
		return c
	}
}

func main() {
	s := strings.NewReader("Lbh penpxrq gur pbqr!")
	r := rot13Reader{s}
	io.Copy(os.Stdout, &r)
}

```
