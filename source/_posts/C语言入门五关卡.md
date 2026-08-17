---
title: "C 语言入门五关卡"
date: 2026-07-05 19:17:08
categories:
  - 学习笔记
  - C语言
tags:
  - C语言
---

不靠 AI，独立写出下面这 5 个东西，就算过了。

---
  五个关卡
  
  关卡一：反转单链表
  // 给你一个头节点，返回反转后的头节点
```c
  struct Node* reverse(struct Node* head);
```
  最基础的数据结构操作。如果这都写不出来，指针没过关。

---

  关卡二：动态数组
  实现一个能自动扩容的数组：
  ```c
    typedef struct {
      int* data;
      int size;
      int capacity;
  } Vector;

void vector_push(Vector* v, int value);  // 追加元素，容量不够时自动扩容（realloc）
int  vector_get(Vector* v, int index);   // 获取元素
void vector_free(Vector* v);             // 释放内存
  ```
  这里考的是 malloc、realloc、free，以及结构体指针。内存泄漏了就不算过。

  ---
  关卡三：字符串分割
```c
  // 把 "hello,world,go" 按逗号分割成 ["hello", "world", "go"]
  // 返回字符串数组，以及字符串个数
  // split_str 需要调用者 free
  char** split(const char* str, char delimiter, int* out_count);
```
  考察的东西：手动管理字符串内存、二级指针、字符串结束符 \0、边界条件（空字符串、连续分隔符、末尾分隔符）。
  C 没有 malloc 以外的方式处理变长字符串。这个写完了你就理解为什么高级语言都有 split 内置函数了。

  ---
  关卡四：链表实现的优先队列
```c
  typedef struct {
      // ...你设计内部结构
  } PriorityQueue;

  void pq_push(PriorityQueue* pq, int value, int priority);
  int  pq_pop(PriorityQueue* pq);   // 返回优先级最高的值
  int  pq_is_empty(PriorityQueue* pq);
```
  可以用有序链表实现（插入时排序），不用堆。考察设计数据结构的能力。

---
  关卡五（终极）：简化版 malloc
```c
  #define POOL_SIZE 4096

  void pool_init();           // 初始化一个 4096 字节的内存池
  void* pool_alloc(int size); // 从池里分配 size 字节，返回指针
  void  pool_free(void* ptr); // 释放之前分配的内存
  void  pool_stats();         // 打印当前空闲/已用字节数
```

  不需要像真正的 malloc 那样高效，能用就行。最简单的实现方式是用空闲链表：把空闲块串成链表，分配时找到够大的块切一块下来
  ，释放时放回链表并合并相邻空闲块。

  这个写完，你就理解了：
  - malloc 不是魔法，就是一个管理大数组的函数
  - 什么叫内存碎片
  - 为什么 free 不需要传大小——它把大小记在块的头里了
  ---
  怎么用这些关卡

  不用一口气全部做完。按这个顺序：

  1. 先做关卡一和关卡二，这是基本功
  2. 开始学 Go 之后，每隔几天回来做一个关卡，当换脑子
  3. 关卡五放在暑假最后两周做，或者寒假做

  前三个关卡全部通过，你就可以跟面试官说"我 C 语言没问题"。
  
  ---
  唯一的规则

  不看 AI 生成的代码，不看网上的完整答案。

  可以查：
  - C 标准库文档（man malloc 或 cppreference.com）
  - 语法书/课本
  - 编译报错信息

  不可以：
  - 把题目丢给 ChatGPT
  - 复制粘贴别人的实现
  - 对着答案敲

  报错、卡住、内存泄漏、segment fault——自己调通才算自己的。