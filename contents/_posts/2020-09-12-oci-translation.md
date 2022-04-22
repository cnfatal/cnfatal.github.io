---
title: OCI 规范翻译
---

开放容器倡议（OCI）是 Linux 基金会的项目，目的是建立围绕容器格式和运行时的开放式行业标准的明确目的的开放式治理结构。

当前有三个规范正在开发和使用中:运行时规范[runtime-spec](https://github.com/opencontainers/runtime-spec)、镜像规范[image-spec](https://github.com/opencontainers/image-spec)和分发规范[distribution-spec](https://github.com/opencontainers/distribution-spec)。

此外该组织[opencontainers](https://github.com/opencontainers)还包含了 runtime 实现 [runc](https://github.com/opencontainers/runc.git)其他实现和一些工具类。

当前的版本为:

- runtime-spec:v1.0.2
- image-spec:v1.0.1
- distribution-spec:v1.0.0-rc1

## runtime spec

开放容器计划运行时规范(runtime-spec)旨在指定容器的配置，运行环境和生命周期。

该规范指定了` linux``solaris``window``vm `四类平台下的运行环境配置，每个平台下的配置。详细参见[platforms](https://github.com/opencontainers/runtime-spec/blob/master/spec.md#platforms)。也就是说 oci 的实现，不仅仅是在 linux 环境上，还支持 windows 环境，甚至虚拟机。

该规范被分为两部分描述，一部分为 runtime 一部分为 config。

- config 部分使用 `config.json` 文件为载体进行配置，且受支持平台的不同而有所不同。并详细说明了可以创建容器的字段。指定执行环境是为了确保容器内运行的应用程序在运行时之间具有一致的环境，以及为容器的生命周期定义的常见操作。
- runtime 部分定义了容器实体能够进行的操作，生命周期，状态转换以及其相关的 hook 调用时机。

此外该规范还定义了一个 filesystem bundle 程序包,该程序包为容器运行的起点和入口。

至目前为止已经有了虚拟机和容器的实现可供参考。

Container：

- [opencontainers/runc][runc] - Reference implementation of OCI runtime
- [containers/crun][crun] - Runtime implementation in C
- [alibaba/inclavare-containers][rune] - Enclave OCI runtime for confidential computing

Virtual Machine：

- [hyperhq/runv][runv] - Hypervisor-based runtime for OCI
- [clearcontainers/runtime][cc-runtime] - Hypervisor-based OCI runtime utilising [virtcontainers][virtcontainers] by Intel®.
- [google/gvisor][gvisor] - gVisor is a user-space kernel, contains runsc to run sandboxed containers.
- [kata-containers/runtime][kata-runtime] - Hypervisor-based OCI runtime combining technology from [clearcontainers/runtime][cc-runtime] and [hyperhq/runv][runv].

### bundle

运行时规范参照[macos 应用程序包](https://en.wikipedia.org/wiki/Bundle_%28macOS%29)的方式制定了一个容器应用的 bundle。
实现了 runtime-spec 的程序以一个 bundle 开始创建容器。

```sh
runtime-impl create <cintainer-id> <bundle path>
```

bundle 包含了两部分，一部分为 bundle 的配置信息`config.json`，一部分为 bundle 的根文件系统目录`rootfs`。一个推荐的 bundle 目录结构大致为如下样子：

```sh
bundle/
├── config.json
└── rootfs

1 directory, 1 file
```

### config

该配置文件[config.json](https://github.com/opencontainers/runtime-spec/blob/master/config.md)包含对容器实施标准操作所必需的元数据。
包括要运行的过程，要注入的环境变量，要使用的沙箱功能等配置信息等。其包含了:

公共配置:

- oci，oci 版本号
- root，容器 rootfs 的位置。默认为`rootfs`名称的目录。
- mounts,指定了需要被挂载到 root 下的挂载需求。
- process,指定了容器 start 时运行的程序，包含了环境变量，终端类型，运行参数，运行目录等。在 linux 环境下还有 用户,资源限制，系统能力，系统安全(apparmor 或者 selinux),oom 策略等。
- hostname,主机名称。
- hooks,posix 兼任平台下的 [hook](https://github.com/opencontainers/runtime-spec/blob/master/config.md#posix-platform-hooks) 点。
  - prestart （已弃用），运行时空间执行，在调用启动操作之后但在执行用户指定的程序命令之前。
  - createRuntime，运行时空间执行，在创建操作期间，在创建运行时环境之后，在数据透视表根或任何等效操作之前。
  - createContainer，容器空间内执行，在创建操作期间，在创建运行时环境之后，在数据透视表根或任何等效操作之前。
  - startContainer，容器空间内执行，在调用启动操作之后但在执行用户指定的程序命令之前。
  - poststart，运行时空间执行，在执行用户指定的过程之后但在启动操作返回之前。
  - poststop，运行时空间执行，在删除容器之后但在删除操作返回之前。

平台特定的配置，以 [linux 平台配置](https://github.com/opencontainers/runtime-spec/blob/master/config-linux.md)为例：

- default filesystem,linux ABI 中除了 syscall 外还包含了一些特殊的路径。例如： `/proc` `/sys` `dev/pts` `/dev/shm`。
- namespaces,指定需要隔离的命名空间。包含:
  - pid 容器内的进程只能看到同一容器内或同一 pid 名称空间内的其他进程。
  - network 容器将具有自己的网络堆栈。
  - mount 该容器将具有一个隔离的安装台。
  - ipc 容器内的进程只能通过系统级 IPC 与同一容器内的其他进程进行通信。
  - uts 容器将能够拥有自己的主机名和域名。
  - user 容器将能够将主机的用户 ID 和组 ID 重新映射到容器中的本地用户和组。
  - cgroup 容器将具有 cgroup 层次结构的隔离视图。
- user namespace mappings，从主机到容器的用户名称空间 uid 和 gid 映射
- devices,设备映射。设置容器内部可以使用的设备。规定了一些默认需要提供的设备：
  - `/dev/null`
  - `/dev/zero`
  - `/dev/full`
  - `/dev/random`
  - `/dev/urandom`
  - `/dev/tty`
  - `/dev/console`,如果在配置中启用 terminal，则通过将伪终端 pty `bind mount` 到 `/dev/console`。
  - `/dev/ptmx`,容器内`/dev/pts/ptmx`的 `bind mount` 或者符号连接。
- control group,也称为 cgroup，用于限制容器的资源使用和处理设备访问。例如 CPU，内存， 磁盘 IO， 网络 IO， PID ，RDMA 等。包含了：
  - devices，被允许的设备类型。
  - memory，内存限制。
  - cpu,处理器使用限制。
  - blockIO，表示 blkio 实现块 IO 控制器的 cgroup 子系统。
  - hugepageLimits，巨页限制。
  - network,网络限制。
  - pids，pids cgroup 子系统。
  - RDMA，直接内存访问的限制。
  - unified,cgroup v2 限制支持。
  - intelRdt,三级缓存管理技术。
- sysctl,运行时的内核参数设置。
- seccomp，Seccomp 在 Linux 内核中提供了应用程序沙箱机制。Seccomp 配置允许您配置要对匹配的 syscall 采取的操作，而且还允许对作为参数传递给 syscall 的值进行匹配。
- rootfsPropagation,设置 rootfs's 挂载的传播机制， `shared`, `slave`, `private` 或者 `unbindable`。
- maskedPaths，将掩盖容器内提供的路径，以便无法读取它们。
- readonlyPaths，将在容器内将提供的路径设置为只读。
- mountLabel,挂载标签，将为容器中的 mount 设置 Selinux 上下文。例如：`system_u:object_r:svirt_sandbox_file_t:s0:c715,c811`
- personality，设置 Linux 执行个性（执行域）。

更详细的信息

下面是一个完整的`config.json`文件

```json
{
  "ociVersion": "1.0.1",
  "process": {
    "terminal": true,
    "user": {
      "uid": 1,
      "gid": 1,
      "additionalGids": [5, 6]
    },
    "args": ["sh"],
    "env": [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "TERM=xterm"
    ],
    "cwd": "/",
    "capabilities": {
      "bounding": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "permitted": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "inheritable": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "effective": ["CAP_AUDIT_WRITE", "CAP_KILL"],
      "ambient": ["CAP_NET_BIND_SERVICE"]
    },
    "rlimits": [
      {
        "type": "RLIMIT_CORE",
        "hard": 1024,
        "soft": 1024
      },
      {
        "type": "RLIMIT_NOFILE",
        "hard": 1024,
        "soft": 1024
      }
    ],
    "apparmorProfile": "acme_secure_profile",
    "oomScoreAdj": 100,
    "selinuxLabel": "system_u:system_r:svirt_lxc_net_t:s0:c124,c675",
    "noNewPrivileges": true
  },
  "root": {
    "path": "rootfs",
    "readonly": true
  },
  "hostname": "slartibartfast",
  "mounts": [
    {
      "destination": "/proc",
      "type": "proc",
      "source": "proc"
    },
    {
      "destination": "/dev",
      "type": "tmpfs",
      "source": "tmpfs",
      "options": ["nosuid", "strictatime", "mode=755", "size=65536k"]
    },
    {
      "destination": "/dev/pts",
      "type": "devpts",
      "source": "devpts",
      "options": [
        "nosuid",
        "noexec",
        "newinstance",
        "ptmxmode=0666",
        "mode=0620",
        "gid=5"
      ]
    },
    {
      "destination": "/dev/shm",
      "type": "tmpfs",
      "source": "shm",
      "options": ["nosuid", "noexec", "nodev", "mode=1777", "size=65536k"]
    },
    {
      "destination": "/dev/mqueue",
      "type": "mqueue",
      "source": "mqueue",
      "options": ["nosuid", "noexec", "nodev"]
    },
    {
      "destination": "/sys",
      "type": "sysfs",
      "source": "sysfs",
      "options": ["nosuid", "noexec", "nodev"]
    },
    {
      "destination": "/sys/fs/cgroup",
      "type": "cgroup",
      "source": "cgroup",
      "options": ["nosuid", "noexec", "nodev", "relatime", "ro"]
    }
  ],
  "hooks": {
    "prestart": [
      {
        "path": "/usr/bin/fix-mounts",
        "args": ["fix-mounts", "arg1", "arg2"],
        "env": ["key1=value1"]
      },
      {
        "path": "/usr/bin/setup-network"
      }
    ],
    "poststart": [
      {
        "path": "/usr/bin/notify-start",
        "timeout": 5
      }
    ],
    "poststop": [
      {
        "path": "/usr/sbin/cleanup.sh",
        "args": ["cleanup.sh", "-f"]
      }
    ]
  },
  "linux": {
    "devices": [
      {
        "path": "/dev/fuse",
        "type": "c",
        "major": 10,
        "minor": 229,
        "fileMode": 438,
        "uid": 0,
        "gid": 0
      },
      {
        "path": "/dev/sda",
        "type": "b",
        "major": 8,
        "minor": 0,
        "fileMode": 432,
        "uid": 0,
        "gid": 0
      }
    ],
    "uidMappings": [
      {
        "containerID": 0,
        "hostID": 1000,
        "size": 32000
      }
    ],
    "gidMappings": [
      {
        "containerID": 0,
        "hostID": 1000,
        "size": 32000
      }
    ],
    "sysctl": {
      "net.ipv4.ip_forward": "1",
      "net.core.somaxconn": "256"
    },
    "cgroupsPath": "/myRuntime/myContainer",
    "resources": {
      "network": {
        "classID": 1048577,
        "priorities": [
          {
            "name": "eth0",
            "priority": 500
          },
          {
            "name": "eth1",
            "priority": 1000
          }
        ]
      },
      "pids": {
        "limit": 32771
      },
      "hugepageLimits": [
        {
          "pageSize": "2MB",
          "limit": 9223372036854772000
        },
        {
          "pageSize": "64KB",
          "limit": 1000000
        }
      ],
      "memory": {
        "limit": 536870912,
        "reservation": 536870912,
        "swap": 536870912,
        "kernel": -1,
        "kernelTCP": -1,
        "swappiness": 0,
        "disableOOMKiller": false
      },
      "cpu": {
        "shares": 1024,
        "quota": 1000000,
        "period": 500000,
        "realtimeRuntime": 950000,
        "realtimePeriod": 1000000,
        "cpus": "2-3",
        "mems": "0-7"
      },
      "devices": [
        {
          "allow": false,
          "access": "rwm"
        },
        {
          "allow": true,
          "type": "c",
          "major": 10,
          "minor": 229,
          "access": "rw"
        },
        {
          "allow": true,
          "type": "b",
          "major": 8,
          "minor": 0,
          "access": "r"
        }
      ],
      "blockIO": {
        "weight": 10,
        "leafWeight": 10,
        "weightDevice": [
          {
            "major": 8,
            "minor": 0,
            "weight": 500,
            "leafWeight": 300
          },
          {
            "major": 8,
            "minor": 16,
            "weight": 500
          }
        ],
        "throttleReadBpsDevice": [
          {
            "major": 8,
            "minor": 0,
            "rate": 600
          }
        ],
        "throttleWriteIOPSDevice": [
          {
            "major": 8,
            "minor": 16,
            "rate": 300
          }
        ]
      }
    },
    "rootfsPropagation": "slave",
    "seccomp": {
      "defaultAction": "SCMP_ACT_ALLOW",
      "architectures": ["SCMP_ARCH_X86", "SCMP_ARCH_X32"],
      "syscalls": [
        {
          "names": ["getcwd", "chmod"],
          "action": "SCMP_ACT_ERRNO"
        }
      ]
    },
    "namespaces": [
      {
        "type": "pid"
      },
      {
        "type": "network"
      },
      {
        "type": "ipc"
      },
      {
        "type": "uts"
      },
      {
        "type": "mount"
      },
      {
        "type": "user"
      },
      {
        "type": "cgroup"
      }
    ],
    "maskedPaths": [
      "/proc/kcore",
      "/proc/latency_stats",
      "/proc/timer_stats",
      "/proc/sched_debug"
    ],
    "readonlyPaths": [
      "/proc/asound",
      "/proc/bus",
      "/proc/fs",
      "/proc/irq",
      "/proc/sys",
      "/proc/sysrq-trigger"
    ],
    "mountLabel": "system_u:object_r:svirt_sandbox_file_t:s0:c715,c811"
  },
  "annotations": {
    "com.example.key1": "value1",
    "com.example.key2": "value2"
  }
}
```

### runtime

运行时规范定义了 容器状态、生命周期和容器操作。

容器状态：

- `ociVersion` （字符串，必需）是状态遵循的开放容器倡议运行时规范的版本。
- `id`（字符串，必填）是容器的 ID。该主机在该主机上的所有容器中必须是唯一的。不需要在主机之间唯一。
- `status`（字符串，必需）是容器的运行时状态。该值可以是以下之一：
  - `creating`：正在创建容器（生命周期中的第 2 步）
  - `created`：运行时已完成创建操作（在生命周期的第 2 步之后），并且容器进程既未退出也不执行用户指定的程序
  - `running`：容器进程已执行用户指定的程序，但尚未退出（生命周期中的第 5 步之后）
  - `stopped`：容器过程已退出（生命周期中的第 7 步）
- `pid`（int，在 Linux 上或 Linux 上 status 是必需的，在其他平台上是可选的）是容器进程的 ID，如主机所见。` created``running `状态时存在。
- `bundle`（字符串，必需）是容器的 bundle 目录的绝对路径。提供它是为了使使用者可以在主机上找到容器的配置和根文件系统。
- `annotations`（map 类型，可选）包含与容器关联的注释列表。如果没有提供注释，则该属性可以不存在或为空。

一个示例的状态为：

```json
{
  "ociVersion": "1.0.2",
  "id": "oci-container1",
  "status": "running",
  "pid": 4422,
  "bundle": "/containers/redis",
  "annotations": {
    "myKey": "myValue"
  }
}
```

生命周期:

1. create 调用 OCI 兼容的运行时命令时，请参考包的位置和唯一标识符。
2. 必须根据中的配置创建容器的运行时环境 config.json。如果运行时无法创建中指定的环境 config.json，则必须生成错误。config.json 必须创建请求中的资源后，此时 process 不得运行用户指定的程序（来自）。config.json 在此步骤之后进行的任何更新都不得影响容器。
3. 该 prestart 钩子必须由运行时调用。如果任何 prestart 钩子失败，则运行时务必生成错误，停止容器，并在步骤 12 继续生命周期。
4. 该 createRuntime 钩子必须由运行时调用。如果任何 createRuntime 钩子失败，则运行时务必生成错误，停止容器，并在步骤 12 继续生命周期。
5. 该 createContainer 钩子必须由运行时调用。如果任何 createContainer 钩子失败，则运行时务必生成错误，停止容器，并在步骤 12 继续生命周期。
6. start 使用容器的唯一标识符调用运行时的命令。
7. 该 startContainer 钩子必须由运行时调用。如果任何 startContainer 钩子失败，则运行时务必生成错误，停止容器，并在步骤 12 继续生命周期。
8. 运行时必须运行由指定的用户指定程序 process。
9. 该 poststart 钩子必须由运行时调用。如果有任何 poststart 钩子失败，运行时必须记录一个警告，但是剩余的钩子和生命周期将继续，就像钩子成功一样。
10. 容器过程退出。这可能是由于错误，退出，崩溃或 kill 调用运行时的操作而发生的。
11. delete 使用容器的唯一标识符调用运行时的命令。
12. 必须通过取消在创建阶段（步骤 2）执行的步骤来销毁容器。
13. 该 poststop 钩子必须由运行时调用。如果有任何 poststop 钩子失败，运行时必须记录一个警告，但是剩余的钩子和生命周期将继续，就像钩子成功一样。

容器操作：

runtime 还对 oci 实现的命令行进行了规定：

| 用途     | 命令                                       | 介绍                                                                    |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| 状态查询 | state `<container-id>`                     | 此操作务必返回“容器状态”部分中指定的容器状态。                          |
| 创建容器 | create `<container-id>` `<path-to-bundle>` | 此操作必须创建一个新的容器。应用 config 中除了 process 的其他所有部分。 |
| 开始运行 | start `<container-id>`                     | 此操作必须运行所指定的用户指定程序 process。                            |
| 结束运行 | kill `<container-id>` `<signal>`           | 此操作必须将指定的信号发送到容器进程。                                  |
| 删除容器 | delete `<container-id>`                    | 删除容器必须删除在该 create 步骤中创建的资源。                          |

> 在实现上，运行时不需要对 bundle 配置进行更改。

## images spec

开放容器计划-镜像规范，该规范定义了一个 OCI 镜像，它由 manifest，image-index（可选），一组文件系统 layer 和一个配置组成。
本规范的目标是允许创建可互操作的工具，以构建，运输和准备要运行的容器映像。

> 该规范将容器镜像的组成，构建方式，传输方式均作了规定，目的是形成一个统一的格式。

与众多传输规范一样，oci image 也指定了许多的 Media Types。先了解一下 image spec 使用了哪些东西：

- `application/vnd.oci.descriptor.v1+json`,内容描述，可理解为每个部分均拥有的元数据。
- `application/vnd.oci.layout.header.v1+json`，OCI 布局。
- `application/vnd.oci.image.index.v1+json`镜像索引。
- `application/vnd.oci.image.manifest.v1+json`，镜像清单。
- `application/vnd.oci.image.config.v1+json`,镜像的配置信息，主要包含容器运行时配置，例如 rootfs 位置，命令，命令参数，环境变量，用户，工作目录，公开端口，停止信号，历史信息等。
- `application/vnd.oci.image.layer.v1.tar`,“Layer”，作为 tar 存档。
- `application/vnd.oci.image.layer.v1.tar+gzip`，“Layer”，作为用 gzip 压缩的 tar 存档。
- `application/vnd.oci.image.layer.v1.tar+zstd`,“Layer”，作为用 zstd 压缩的 tar 存档。
- `application/vnd.oci.image.layer.nondistributable.v1.tar`,“Layer”，作为具有发行限制的 tar 存档。
- `application/vnd.oci.image.layer.nondistributable.v1.tar+gzip`,“Layer”，作为具有 gzip 压缩限制的发行限制的 tar 存档。
- `application/vnd.oci.image.layer.nondistributable.v1.tar+zstd`,“Layer”，作为具有 zstd 压缩的发行限制的 tar 存档。

### descriptor

OCI 内容描述符,又成为描述符。用于描述每一个 OCI iamge spec 中的部件，在其他地方被称为“元数据”的有相似作用，为每个部件的公共部分。

内容描述符由以下字段组成：

- `mediaType` 引用内容的媒体类型。值必须符合 RFC 6838，包括其 4.2 节中的命名要求。支持 OCI 映像规范为规范中定义的资源定义的几种 MIME 类型。
- `digest` 目标内容的摘要，符合 Digests 中概述的要求。通过不受信任的来源使用时，应对照此摘要对检索到的内容进行验证。
- `size` 指定原始内容的大小（以字节为单位）。以便客户端在处理之前具有预期的内容大小。如果检索到的内容的长度与指定的长度不匹配，则不应信任该内容。
- `urls` （可选）指定可以下载该对象的 URI 列表。每个条目必须符合 RFC 3986。条目应使用 http 和 https 方案，如 RFC 7230 所定义。
- `annotations` （可选）包含此描述符的任意元数据，也就是注解或者注释。oci 中还对注解有特殊处理，参见[预定义的注解](https://github.com/opencontainers/image-spec/blob/master/annotations.md#pre-defined-annotation-keys)。

### image manifest

manifest 又称之为清单，有三个用途：

1. 寻找镜像内容。内部包含了各镜像层（layer）的 hash 值。
2. fat manifest 可以设置多架构的镜像内容。包含了不同架构的镜像 index。
3. 内容可以转换为运行时规范

manifest 内容包含：

- `schemaVersion` 为了确保与旧版本的 Docker 向后兼容这必须是`2`且不会改变。在规范的未来版本中可能会删除该字段。
- `mediaType` 保留字段，为了兼容性考虑。此字段包含此文档的媒体类型但是与描述符使用 `mediaType`意义不同。
- `config` 容器的配置对象（config）描述符。除了描述符要求之外，该值还具有以下附加限制：

  - `mediaType` 实现时必须至少支持以下媒体类型：

    - `application/vnd.oci.image.config.v1+json`

    保持可移植性的清单应使用上述媒体类型之一。

- `layers` 对象数组，数组中的每个项目都必须是镜像层(layer)的内容描述符。数组的第一个对象为镜像的最底层，依次叠加。除了描述符要求之外，该值还具有以下附加限制：

  - `mediaType` 实现时必须至少支持以下媒体类型：

    - `application/vnd.oci.image.layer.v1.tar`
    - `application/vnd.oci.image.layer.v1.tar+gzip`
    - `application/vnd.oci.image.layer.nondistributable.v1.tar`
    - `application/vnd.oci.image.layer.nondistributable.v1.tar+gzip`

    保持可移植性的清单应使用上述媒体类型之一。

- `annotations` 这个属性必须使用注释规则。

一个清单文件大概是这样：

```json
{
  "schemaVersion": 2,
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "size": 7023,
    "digest": "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7"
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "size": 32654,
      "digest": "sha256:9834876dcfb05cb167a5c24953eba58c4ac89b1adf57f28f2f9d09af107ee8f0"
    },
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "size": 16724,
      "digest": "sha256:3c3a4604a545cdc127456d94e421cd355bca5b528f4a9c1905b15da2eb4a4c6b"
    },
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "size": 73109,
      "digest": "sha256:ec4b8955958665577945c89419d1af06b5f7636b4ac3da7f12184802ad867736"
    }
  ],
  "annotations": {
    "com.example.key1": "value1",
    "com.example.key2": "value2"
  }
}
```

### image index

image index 又称为镜像索引，它是指向特定映像清单的较高级别的清单，适合一个或多个平台。
镜像索引使用`application/vnd.oci.image.index.v1+json` 媒体类型。

其内容包含：

- `schemaVersion` 对于该版本的规范，这必须是 2 为了确保与旧版本的 Docker 向后兼容。该字段的值不会改变。在规范的未来版本中可以删除该字段。
- `mediaType` 保留该属性以保持兼容性。使用时，此字段包含此文档的媒体类型，与的描述符使用不同 mediaType。
- `manifests` 对象数组,包含特定平台清单的清单。虽然这个属性必须存在，但是数组的大小可以为零。其中每个对象都包含一组描述符属性，这些描述符属性具有以下附加属性和限制：
- `mediaType` 此描述符属性具有的其他限制 manifests。实现必须至少支持以下媒体类型：

  - `application/vnd.oci.image.manifest.v1+json`

    另外，实现应支持以下媒体类型：

  - `application/vnd.oci.image.index.v1+json` （嵌套索引）

    与可移植性有关的图像索引应使用上述媒体类型之一。

- `platform` 此可选属性描述了映像的最低运行时要求。如果目标是特定于平台的，则应存在此属性。
- `architecture` 属性指定 CPU 体系结构。图片索引应该使用，并且实现应该理解在 Go 语言文档中列出的值 GOARCH。
- `os` 属性指定操作系统。图片索引应使用，并且实现应理解在 Go 语言文档中列出的值 GOOS。
- `os.version` 属性指定引用的 Blob 所针对的操作系统版本。
- `os.features` 属性指定字符串数组，每个字符串均指定必需的 OS 功能。如果 os 是 windows，图像索引应该使用，并实现应了解以下值：
  - `win32k：win32k.sys`主机上需要映像（注意：win32k.sysNano Server 上缺少该映像）如果 os 不是 windows，则值是实现定义的，并且应该提交给本规范进行标准化。
- `variant` 属性指定 CPU 的变量。下表应使用图像索引，并且应理解实现。当表中未列出 CPU 的变体时，值是实现定义的，应该将其提交给本规范进行标准化。

  | ISA / ABI     | architecture | variant |
  | ------------- | ------------ | ------- |
  | ARM 32 位 v6  | arm          | v6      |
  | ARM 32 位 v7  | arm          | v7      |
  | ARM 32 位 v8  | arm          | v8      |
  | ARM 64 位，v8 | arm64        | v8      |

- `features` 规范的将来版本保留此属性。
- `annotations` 属性必须使用注释规则。

一个镜像索引的示例为：

```json
{
  "schemaVersion": 2,
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "size": 7143,
      "digest": "sha256:e692418e4cbaf90ca69d05a66403747baa33ee08806650b51fab815ad7fc331f",
      "platform": {
        "architecture": "ppc64le",
        "os": "linux"
      }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "size": 7682,
      "digest": "sha256:5b0bcabd1ed22e9fb1310cf6c2dec7cdef19f0ad69efa1f392e94a4333501270",
      "platform": {
        "architecture": "amd64",
        "os": "linux"
      }
    }
  ],
  "annotations": {
    "com.example.key1": "value1",
    "com.example.key2": "value2"
  }
}
```

### image layer

<!-- todo：未完成 -->

## distrbution spec
