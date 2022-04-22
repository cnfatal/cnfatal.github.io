---
title: 使用 kind 快速搭建kubernetes测试环境
---

kind 全称为 "kubernetes in docker",用于将 kubernetes 运行于 docker 容器内。
每个容器为一个 node，支持一个物理机多个 node，kind 通常用于快速搭建测试集群。
其内部使用 kubeadm 来完成 kubernetes 集群初始化，并自带 csi 实现 local-storage 以及 cni 实现 kind network，保证开箱可用。

## 创建集群

确定 k8s 版本，k8s 版本是由 node 镜像确定，可以从[DockerHub](https://hub.docker.com/r/kindest/node/tags)镜像仓库选择合适的版本。

### 配置镜像代理(mirror)

由于容器内部仅包含 k8s 镜像，其余镜像需要从公网拉取，这通常较为缓慢。

解决方式有几种方式：

- 使用[本地镜像仓库](https://kind.sigs.k8s.io/docs/user/local-registry/)
- 使用[镜像代理](https://github.com/containerd/containerd/blob/main/docs/cri/registry.md#configure-registry-endpoint)(即将废弃)
- 挂载 containerd content 目录（技术难度较大）

### 加速 etcd

etcd 为高磁盘 IO，在非 ssd 机器上可能导致集群响应缓慢。
作为改善，可以将 etcd data 目录指向 tmpfs，以使用内存作为数据存储。通过来说这回占用约百 MB 的内存空间，如果内存足够，且确实无需持久化时可以使用它此方式。

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
kubeadmConfigPatches:
  - |
    apiVersion: kubeadm.k8s.io/v1beta2
    kind: ClusterConfiguration
    etcd:
      local:
        dataDir: /tmp/etcd # /tmp directory is a tmpfs(in memory),use it for speeding up etcd and lower disk IO.
```

### 创建 kind cluster

```sh
#! /bin/sh

cat <<EOF | kind create cluster --kubeconfig=${HOME}/.kube/config --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: kubegems
networking:
  apiServerAddress: 10.12.32.11 # your host ip
  apiServerPort: 6443
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".containerd]
    snapshotter = "native"
  - |-
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
      endpoint = ["http://proxy:5000"]
  - |-

nodes:
  - role: worker
    image: kindest/node:v1.20.2
  - role: control-plane
    image: kindest/node:v1.20.2
    extraPortMappings:
      - containerPort: 30000
        hostPort: 30000
EOF

docker volume create registry
docker run -d --name proxy --restart=always --net=kind -vregistry:/var/lib/registry -e REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io registry:2

```
