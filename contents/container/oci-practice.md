# OCI practice

## OCI create

参看 OCI 规范中，有指定 create 的命令行操作。`oci create <container-id> <path-to-bundle>`。

### bundle 准备

创建一个容器需要准备一个 bundle。可以借助`docker export`生成`rootfs`，借助`runc spec`生成 `config.json`。

以创建 alpine bundle 为例：

```sh
mkdir bundle
cd bundle
docker pull alpine:3.12
docker export $(docker create alpine:3.12) > rootfs.tar
mkdir rootfs
tar -C rootfs -xf rootfs.tar
runc spec
ls -l
```

此外,除了使用`runc spec`，还可以使用 `oci-runtime-tool generate`命令生成`config.json`文件。参考[runtime-tools](https://github.com/opencontainers/runtime-tools)

### 处理流程

- 用户调用`oci create`命令
- 参数验证
  - 如果未提供 `<cotainer-id>` 和 `<path-to-bundle>` 时，即命令行参数不足时报错。
  - 如果 `<path-to-bundle>` 或者路径不存在或者无法访问，则报错。该路径可以为相对路径。
  - 如果 `<container-id>` 已经存在或不唯一，则报错。
- 处理 `config.json`
  - 解析 config.json 如果格式错误或无法通过有效性验证，则报错。
  - 解析 config.json 并应用除了`process`外的每一项。如果有无法应用的项目，则报错。
- 备份 `config.json`,在容器创建完成后，即使更改`config.json`也不应当对以创建的容器有影响。

### 应用 config.json

#### root

示例:

```json
  "root": {
    "path": "rootfs",
    "readonly": true
  }
```

- 判断`root`是否存在，若不存在，则报错。
- 如果 `path` 未设置值，则报错。
- 判断`path`是否为相对路径，若是则转换为绝对路径。相对路径相对于 bundle 文件夹。
- 寻找 `path` 路径是否有效，若不存在或者无法访问，则报错。
- 判断 `readonly`值，若为 true 则根文件系统在容器内为只读。若为 false 或者未设置则忽略。

#### mounts

示例：

```json
"mounts": [
    {
        "destination": "/tmp",
        "type": "tmpfs",
        "source": "tmpfs",
        "options": ["nosuid","strictatime","mode=755","size=65536k"]
    },
    {
        "destination": "/data",
        "type": "none",
        "source": "/volumes/testing",
        "options": ["rbind","rw"]
    }
]
```

- 遍历 mounts 下所有项目
  - mount 处理详情参考[linux mount](mount.md)

#### hostname

示例：

```json
"hostname": "fkghst"
```

- 判断`hostname`是否存在和有有效值，若是则修改容器内 hostname
  - 修改 namespace hostname

#### hooks

createRuntime 必须在创建完成 namespace cgroups 等操作后，在 pivot_root 之前。该 hook 的路径解析和调用必须在运行时(主机)的 namespace 中。
CreateContainer 必须在创建完成 namespace cgroups 等操作后，在 pivot_root 之前。该 hook 的路径解析需要在运行时 namespace，而调用必须在容器的 namespace 中。
StartContainer 必须在 start 操作执行 exec 之前调用，该 hook 的路径解析需要在运行时 namespace，而调用必须在容器的 namespace 中。
