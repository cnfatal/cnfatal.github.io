---
title: 使用 rust 进行嵌入式裸机开发
---

很早就听见 rust 可以作嵌入式开发，在某些程度上可以替代 C 语言了。
而 rust 本身在内存安全上的优异特性，在内核开发方向逐渐被接纳。
除了内核方向其他领域也逐渐在使用 rust。
华为、AWS、Google、微软、Mozilla、Facebook 等科技巨头也纷纷加入 rust 基金会。
rust 在编译器上也使用 llvm，有灵活简便的构建工具 cargo。

感觉 rust 软硬通吃，未来前景广阔。

> 甚至业界还有了一个 "锈化(rust)定律" -- "任何能够用 rust 重写的程序，都会被使用 rust 重写"

正好手里有个 stmf103c8t6 minimal 开发版，可以试试使用 rust 裸机开发，体验一下 rust 。

作为一个软件开发者，这次的任务难度就降低一点吧，从点亮一个 LED 等开始（硬件工程师的 “hello world”）。

先上源码： [cnfatal/stm32-rust](https://github.com/cnfatal/stm32-rust)

不想继续看的可以直接看上面的源码，有价值的都在源码里面。

## TL;DR

> 本文假设读者都有一定的嵌入式经验

## 硬件

- stm32f103c8t6 mini board。可以理解为和 [blue pill](<https://stm32-base.org/boards/STM32F103C8T6-Blue-Pill.html>) 类似的 stm32 最小系统，但额外增加了 uart-usb 芯片，一个 led 灯和一个按钮。
- daplink v1 。 arm 调试器，用于程序下载和debug。

## 软件&资料

现有直接能查到的资料有：

- [The Embedded Rust Book](https://docs.rust-embedded.org/book/)
- [Rust Book](https://doc.rust-lang.org/book/)

**作为入门，一定要先跟随 The Embedded Rust Book 完成使用 QEMU 模拟器模拟硬件这部分内容.**

必须先理解rust是如何在qemu上工作的，然后才使用实际的硬件去运行。

**不想写了... 直接看源码吧 困了🥱。**
