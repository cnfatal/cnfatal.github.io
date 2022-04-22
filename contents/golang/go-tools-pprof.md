---
title: pprof 使用
---

golang pprof 是 golang 的可视化和性能分析的工具。其提供了可视化的 web 页面，火焰图等更直观的工具。

可以使用 go tool pprof 进行使用,go pprof 现在随着 golang 发行版发布。不再需要额外安装。原版本来自<github.com/google/pprof>。

## 启用 pprof 端点

需要我们的程序开放了 pprof web 端点。

一般建议的方式为在需要使用的地方引用`net/http/pprof`包。

```go
import _ "net/http/pprof"
```

该方式会在默认的 http.DefaultServeMux 中插入 debug pprof 端点。

```go
// pprof.go:79
func init() {
  http.HandleFunc("/debug/pprof/", Index)
  http.HandleFunc("/debug/pprof/cmdline", Cmdline)
  http.HandleFunc("/debug/pprof/profile", Profile)
  http.HandleFunc("/debug/pprof/symbol", Symbol)
  http.HandleFunc("/debug/pprof/trace", Trace)
}
```

不过在一般的开发中不使用该方式，而是使用自定义的 handler，如下。

```go
  m := http.NewServeMux()
  m.Handle("/debug/vars", expvar.Handler()) //用于查看exvar包中的存储的数据，由于一般无人使用该包，所以意义不大。
  m.HandleFunc("/debug/pprof/", pprof.Index))
  m.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
  m.HandleFunc("/debug/pprof/profile", pprof.Profile)
  m.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
  m.HandleFunc("/debug/pprof/trace", pprof.Trace)
```

pprof 包内调用`runtime`包中函数以获取各种运行时信息，其包含如下分析指标。

allocs: 过去所有内存分配的样本
block: 导致同步原语阻塞的堆栈跟踪
cmdline: 当前程序的命令行调用，与/proc/中的 cmdline 相同
goroutine: 当前所有 goroutine 的堆栈跟踪
heap: A 活动对象的内存分配的采样。您可以指定 gc GET 参数以在获取堆样本之前运行 GC。
mutex: 竞争互斥体持有人的堆栈痕迹
profile: CPU 配置文件。您可以在秒 GET 参数中指定持续时间。获取概要文件后，使用 go tool pprof 命令调查概要文件。
threadcreate: 导致创建新 OS 线程的堆栈跟踪
trace: 当前程序执行的痕迹。您可以在秒 GET 参数中指定持续时间。获取跟踪文件后，请使用 go 工具 trace 命令调查跟踪。

## 使用 pprof

```sh
go tool pprof http://localhost:6060/debug/pprof/profile
```

如果使用 -http 选项指定需要 web 交互页面，则需要安装 `dot` 命令。ubuntu 上通过以下方式安装：

```sh
sudo apt install graphviz
```

则使用方式为

```sh
go tool pprof -http :8080 http://localhost:6060/debug/pprof/profile #运行 cpu profile 并在本地 :8080 通过浏览器查看

```

使用命令行则为：

```sh
# 执行CPU性能分析，会默认从当前开始执行30scpu采样。
$ go tool pprof http://localhost:6060/debug/pprof/profile
# 也可以通过参数 seconds 指定采样时间。
$ go tool pprof http://localhost:6060/debug/pprof/profile\?seconds=60
# 采样结束后默认进入命令行界面
Fetching profile over HTTP from http://localhost:6060/debug/pprof/profile
Saved profile in /home/user/pprof/pprof.-.samples.cpu.001.pb.gz
File: -
Type: cpu
Time: Dec 24, 2020 at 6:24pm (CST)
Duration: 30.06s, Total samples = 590ms ( 1.96%)
Entering interactive mode (type "help" for commands, "o" for options)
(pprof)
(pprof) top
Showing nodes accounting for 250ms, 42.37% of 590ms total
Showing top 10 nodes out of 285
      flat  flat%   sum%        cum   cum%
      50ms  8.47%  8.47%       50ms  8.47%  runtime.futex
      30ms  5.08% 13.56%      100ms 16.95%  runtime.findrunnable
      30ms  5.08% 18.64%       30ms  5.08%  syscall.Syscall
      20ms  3.39% 22.03%       20ms  3.39%  aeshashbody
      20ms  3.39% 25.42%       20ms  3.39%  encoding/json.(*decodeState).rescanLiteral
      20ms  3.39% 28.81%       30ms  5.08%  encoding/json.checkValid
      20ms  3.39% 32.20%       20ms  3.39%  runtime.epollwait
      20ms  3.39% 35.59%       30ms  5.08%  runtime.gentraceback
      20ms  3.39% 38.98%       20ms  3.39%  runtime.memclrNoHeapPointers
      20ms  3.39% 42.37%       20ms  3.39%  runtime.memmove
```

flat：函数上运行耗时
flat%：函数上运行耗时 总比例
sum%：函数累积使用 CPU 时间比例
cum：函数及之上的调用运行总耗时
cum%：函数及之上的调用运行总耗时比例

内存 profile

```sh
go tool pprof -http :8080 http://localhost:6060/debug/pprof/heap
```
