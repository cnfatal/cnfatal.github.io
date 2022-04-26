---
title: 使用 kubeadm 安装 kubernetes
---

指导一步步从裸机安装 kuberntes 并配置完成周边组件。

## 前置准备

确认主机名称、IP、product_uuid 地址均唯一

```sh
ip link
sudo cat /sys/class/dmi/id/product_uuid
```

关闭 swap（临时）

```sh
sudo swapoff -a
```

持久化关闭 swap 需要编辑 `/etc/fstab` 文件，·

能够让 iptables 看见 bridge 上的流量，这是网络插件所要求。

```sh
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
br_netfilter
EOF

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sudo sysctl --system
```

### 透明代理

借助 v2ray 实现透明代理

```json
{
  "inbounds": [
    {
      "tag": "transparent",
      "port": 12345,
      "protocol": "dokodemo-door",
      "settings": {
        "network": "tcp,udp",
        "followRedirect": true
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls"]
      },
      "streamSettings": {
        "sockopt": {
          "tproxy": "tproxy" // 透明代理使用 TPROXY 方式
        }
      }
    }
  ]
}
```

透明代理参考：<https://www.kernel.org/doc/html/latest/networking/tproxy.html>

```sh
sudo ip rule add fwmark 1 lookup 100
sudo ip route add local 0.0.0.0/0 dev lo table 100

sudo iptables -t mangle -N DIVERT
sudo iptables -t mangle -A DIVERT -d 172.16.0.0/16 -j RETURN
sudo iptables -t mangle -A DIVERT -m mark --mark 0xff -j RETURN
sudo iptables -t mangle -A DIVERT -m mark --mark 1 -j RETURN
sudo iptables -t mangle -A DIVERT -j MARK --set-mark 1
sudo iptables -t mangle -A DIVERT -j ACCEPT

sudo iptables -t mangle -A PREROUTING -p tcp -m multiport --dport 80,443 -j DIVERT
sudo iptables -t mangle -A PREROUTING -p tcp -m multiport --dport 80,443 -j TPROXY --tproxy-mark 0x1/0x1 --on-port 12345

sudo iptables -t mangle -A OUTPUT -p tcp -m multiport --dport 80,443 -j DIVERT
```

## 安装 CRI

conainerd, docker,crio 可选

### containerd

```sh
cat <<EOF | sudo tee /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# Setup required sysctl params, these persist across reboots.
cat <<EOF | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

# Apply sysctl params without reboot
sudo sysctl --system
```

```sh
sudo zfs create -o mountpoint=/var/lib/containerd/io.containerd.snapshotter.v1.zfs rpool/ROOT/ubuntu_ex5snj/var/lib/containerd
```

```sh
sudo apt install containerd.io -y
```

```sh
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo systemctl restart containerd
```

设置 runc 使用 systemd cgroup 驱动 `/etc/containerd/config.toml`

```toml
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  ...
  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
    SystemdCgroup = true
```

```sh
sudo systemctl restart containerd
```

### CRI-O

可以先去<https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:>寻找最新的 OS 和 VERSION

```sh
export OS=xUbuntu_21.04
export VERSION=1.23

echo "deb [signed-by=/usr/share/keyrings/libcontainers-archive-keyring.gpg] https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/$OS/ /" | sudo tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list
echo "deb [signed-by=/usr/share/keyrings/libcontainers-crio-archive-keyring.gpg] https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable:/cri-o:/$VERSION/$OS/ /" | sudo tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable:cri-o:$VERSION.list

sudo mkdir -p /usr/share/keyrings
curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/$OS/Release.key | sudo gpg --dearmor -o /usr/share/keyrings/libcontainers-archive-keyring.gpg
curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable:/cri-o:/$VERSION/$OS/Release.key | sudo gpg --dearmor -o /usr/share/keyrings/libcontainers-crio-archive-keyring.gpg

sudo apt-get update
sudo apt-get install cri-o cri-o-runc
```

可能遇见 containers-common 和 github-golang-containers-common 包有冲突，卸载 github-golang-containers-common 包即可。若无法卸载则需要卸载 podman 等待 crio 安装完成后再安装。

对于 zfs 和 containerd zfs 一样，zfs 上需要创建在路径`/var/lib/containers/storage`下的 mountpoint 以独立管理否则 crio 下载的镜像会存储于其默认的父级 `var/lib` 下

```sh
sudo zfs create rpool/ROOT/ubuntu_ex5snj/var/lib/containers
sudo zfs create -o mountpoint=/var/lib/containers/storage rpool/ROOT/ubuntu_ex5snj/var/lib/containers/storage
```

containers-common 配置文件中默认的 storage 为 overlay，需要更改为 zfs。[CRI-O/zfs](https://wiki.archlinux.org/title/CRI-O)

```sh
sed -i 's/driver = ""/driver = "zfs"/' /etc/containers/storage.conf
```

crio 默认未启动，需要手动设置:

```sh
sudo systemctl daemon-reload
sudo systemctl enable crio
sudo systemctl start crio
```

### docker(可选)

清理旧版本 docker(可选)

```sh
sudo apt-get remove docker docker-engine docker.io containerd runc
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
```

对于 zfs ,需要为 docker 创建一个挂载点：

```sh
sudo zfs create -o mountpoint=/var/lib/docker rpool/ROOT/ubuntu_ex5snj/var/lib/docker
```

或者可选择 docker 一键安装脚本：

```sh
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh --mirror Aliyun # 阿里云镜像
sudo sh get-docker.sh --mirror AzureChinaCloud # azure中国镜像
```

或者手动安装：

> docker 原地址为：`https://download.docker.com/linux/ubuntu`
> aliyun 镜像地址为： `http://mirrors.aliyun.com/docker-ce/linux/ubuntu`

```sh
curl -fsSL http://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo \
 "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] http://mirrors.aliyun.com/docker-ce/linux/ubuntu \
 $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io -y
```

配置 docker daemon

```sh
sudo mkdir /etc/docker
cat <<EOF | sudo tee /etc/docker/daemon.json
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
}
EOF
sudo systemctl enable docker
sudo systemctl daemon-reload
sudo usermod -aG docker $USER
sudo systemctl restart docker
```

## 安装 kubernetes

使用 kubeadm 完成 kubernetes 安装，kubeadm 是一个 product ready 的 k8s 安装工具，后续维护也会比较方便。

kubeadm 推荐将 CRI cgroups driver 设置为 systemd,可以用以下方式检查:

```sh
sudo crictl -r /run/containerd/containerd.sock info
```

```sh
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl
```

google 原地址为：`https://packages.cloud.google.com/apt/`

```sh
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
sudo apt-get  -o Acquire::http::proxy="http://172.16.0.10:1080" update # 设置 apt 代理
```

aliyun 镜像地址为： `https://mirrors.aliyun.com/kubernetes/apt/`

可以使用 aliyun mirror 进行替换

```sh
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://mirrors.aliyun.com/kubernetes/apt/doc/apt-key.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://mirrors.aliyun.com/kubernetes/apt/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list
```

```sh
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
```

```sh
sudo kubeadm init --pod-network-cidr 10.244.0.0/16 --cri-socket /run/containerd/containerd.sock
```

或者使用配置文件

```yaml
# kubeadm-config.yaml
apiVersion: kubeadm.k8s.io/v1beta3
kind: InitConfiguration
nodeRegistration:
  criSocket: unix:///var/run/crio/crio.sock
---
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
networking:
  podSubnet: 10.244.0.0/16
---
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs
```

设置 kube-proxy 为 ipvs 模式 [kube proxy ipvs](https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/ipvs/README.md#cluster-created-by-kubeadm).

```sh
sudo kubeadm init --config kubeadm-config.yaml
```

添加节点：

```sh
export KUBECONFIG=/etc/kubernetes/admin.conf
sudo kubeadm join 10.0.2.15:6443 --token sun8lk.v61hbv2q4t6eyyuh \
    --discovery-token-ca-cert-hash sha256:7f3a8759ea6da926297fc082370982ee10e2ecf2a834847a9d9178ae963c0a49
```

配置 kubectl

```sh
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

## 安装 CNI

```sh
kubectl taint nodes --all node-role.kubernetes.io/master-
```

### calico

```sh
kubectl create -f https://docs.projectcalico.org/manifests/tigera-operator.yaml
kubectl create -f https://docs.projectcalico.org/manifests/custom-resources.yaml
# update cidr setting
```

### flannel

```sh
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

### kube-route

<https://github.com/cloudnativelabs/kube-router/blob/master/docs/kubeadm.md>

建议保留 kube-proxy 组件，仅安装 pod network 和 network policy

```sh
KUBECONFIG=/etc/kubernetes/admin.conf kubectl apply -f https://raw.githubusercontent.com/cloudnativelabs/kube-router/master/daemonset/kubeadm-kuberouter.yaml
```

如果替代 kube-proxy 安装：

```sh
KUBECONFIG=/etc/kubernetes/admin.conf kubectl apply -f https://raw.githubusercontent.com/cloudnativelabs/kube-router/master/daemonset/kubeadm-kuberouter-all-features.yaml
KUBECONFIG=/etc/kubernetes/admin.conf kubectl -n kube-system delete ds kube-proxy
docker run --privileged -v /lib/modules:/lib/modules --net=host k8s.gcr.io/kube-proxy-amd64:v1.15.1 kube-proxy --cleanup
```

## 安装 dashboard

```sh
kubectl create --edit -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.4.0/aio/deploy/recommended.yaml
```

开启 cluster-admin 权限以及免登录：

```yaml
- --enable-skip-login
```

```sh
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kubernetes-dashboard-admin
  namespace: kubernetes-dashboard
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: kubernetes-dashboard
    namespace: kubernetes-dashboard
EOF
```

## 安装 metallb

```sh
# see what changes would be made, returns nonzero returncode if different
kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl diff -f - -n kube-system
# actually apply the changes, returns nonzero returncode on errors only
kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.11.0/manifests/namespace.yaml
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.11.0/manifests/metallb.yaml
```

metallb 配置在 configmap 中,通过 watch 监听变化实时加载而非挂载作为配置。

配置 ippool1 前可以先看一下 ip 占用情况：

```sh
nmap -v -sn 10.12.32.0/24
```

```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: metallb-system
  name: config
data:
  config: |
    address-pools:
    - name: default
      protocol: layer2
      addresses:
      - 192.168.101.100-192.169.101.120
EOF
```

## 安装 local storage provisioner

k8s 中的 local CSI 实现 <https://github.com/kubernetes-sigs/sig-storage-local-static-provisioner> 仅能够静态使用
<https://github.com/rancher/local-path-provisioner> 在此基础上增加了动态支持

```sh
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml
```

配置使用的 configmap 进行：

<https://github.com/rancher/local-path-provisioner#customize-the-configmap>

设置为默认 storage class

```sh
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

## 安装 nginx ingress

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.1.1/deploy/static/provider/cloud/deploy.yaml
```

配置 `--enable-ssl-passthrough`

## 安装 cert-manager

```sh
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.6.1/cert-manager.yaml
```
