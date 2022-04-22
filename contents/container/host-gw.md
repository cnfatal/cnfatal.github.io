# host-gw 模式

host-gateway 名词在 flannel 中出现，host-gw 作为 flannel 的一种 backend 与 ipip、vxlan 共同出现。

host-gw 是一种将 host 主机用作网关的使用方式，将容器网络通过 host 网络进行传输而不加以封装。非隧道技术，相比于隧道技术，减少了封包拆包的操作其性能接近主机网络。

## 原理

linux 主机本身支持作为网关的功能，能够接受转发来自其他主机的数据包。host-gw 就是将每个 linux 及其均配置成为这样的机器。每台主机上均能够有足够的路由信息将容器网络数据包送达至对应的目的地。

### 开启转发

linux 内核中，有关于 `/proc/sys/net/ipv4/ip_forward` 的内核配置项，该选项默认关闭。可通过 sysctl 查看。

```sh
$ sysctl net.ipv4.ip_forward
net.ipv4.ip_forward = 0
# 临时更改设置
$ sudo sysctl -w net.ipv4.ip_forward=1
net.ipv4.ip_forward = 1
# 持久化更改该设置
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.d/99-sysctl.conf
```

此外 iptables 中还需要支持 FORWARD 操作才能将该主机用于网络使用。

### 路由

linux 中的路由表可以通过 `ip route` 命令查看。

```sh
$ ip r
default via 192.168.121.1 dev eth0 proto dhcp src 192.168.121.209 metric 100
192.168.121.0/24 dev eth0 proto kernel scope link src 192.168.121.209
192.168.121.1 dev eth0 proto dhcp scope link src 192.168.121.209 metric 100
```

## 实验
