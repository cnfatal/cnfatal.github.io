# 容器监控

OCI 制定了容器运行时规范,但是未指定容器的运行指标信息。

## CPU 内存

由于 cgroups 对容器的资源占用进行了限制，那 cgroups 一定对内存和 cpu 等使用信息进行了统计，对于容器的监控指标，直接从该容器的 cgroups 中获取即可。

以 memory 为例：

```sh
$ tree /sys/fs/cgroup/memory/ -L 1
/sys/fs/cgroup/memory/
├── cgroup.clone_children
├── cgroup.event_control
├── cgroup.procs
├── cgroup.sane_behavior
├── docker
├── init.scope
├── machine.slice
├── memory.failcnt
├── memory.force_empty
├── memory.kmem.failcnt
├── memory.kmem.limit_in_bytes
├── memory.kmem.max_usage_in_bytes
├── memory.kmem.slabinfo
├── memory.kmem.tcp.failcnt
├── memory.kmem.tcp.limit_in_bytes
├── memory.kmem.tcp.max_usage_in_bytes
├── memory.kmem.tcp.usage_in_bytes
├── memory.kmem.usage_in_bytes
├── memory.limit_in_bytes
├── memory.max_usage_in_bytes
├── memory.move_charge_at_immigrate
├── memory.numa_stat
├── memory.oom_control
├── memory.pressure_level
├── memory.soft_limit_in_bytes
├── memory.stat
├── memory.swappiness
├── memory.usage_in_bytes
├── memory.use_hierarchy
├── notify_on_release
├── release_agent
├── system.slice
├── tasks
├── user
└── user.slice
```

在 memory group 中，可以通过文件 `memory.usage_in_bytes` `memory.stat` 等文件获取到当前 group 下的内存使用。

在容器实现时，对每个容器均创建一个 group，则可以获取到仅该容器的资源占用。

## 网络

网络 IO 在 cgroups 中也有进行限制，但对于无限制的或者未设置网络限制的 runtime 来说，网络监控信息就需要从实际的网卡中进行获取了。

在 linux 系统中，可通过内核文件系统 `/proc/net/dev` 查看网络流量的使用情况。
