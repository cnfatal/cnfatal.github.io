---
title: 容器网络 vxlan 实现示例
---

纯手动实现容器基于 vxlan 的 overlay 网络。

## vxlan 介绍

VXLAN（Virtual eXtensible Local Area Network，虚拟扩展局域网），是由 IETF 定义的 NVO3（Network Virtualization over Layer 3）标准技术之一，是对传统 VLAN 协议的一种扩展。VXLAN 的特点是将 L2 的以太帧封装到 UDP 报文（即 L2 over L4）中，并在 L3 网络中传输。

VXLAN 本质上是一种隧道技术，在源网络设备与目的网络设备之间的 IP 网络上，建立一条逻辑隧道，将用户侧报文经过特定的封装后通过这条隧道转发。从用户的角度来看，接入网络的服务器就像是连接到了一个虚拟的二层交换机的不同端口上，可以方便地通信。

## 环境准备

CIDR `10.233.0.0/16`

准备 2-3 台服务器，以模拟跨主机通信。

```hosts
172.16.1.11 ubuntu1
172.16.1.12 ubuntu2
172.16.1.13 ubuntu3
```

使用的 vagrant 配合 virtualbox 启动虚拟机,一个 Vagranfile 文件如下：

```Vagrantfile
# -*- mode: ruby -*-
# vi: set ft=ruby :

$script = <<-SCRIPT
sudo ip route del 0/0
sudo ip route add default via 172.16.1.1
SCRIPT

Vagrant.configure("2") do |config|
  config.vm.box = "generic/ubuntu1804"
  config.vm.hostname = "ubuntu-1"
  config.vm.network "private_network",  ip: "172.16.1.11"
  # default router
  config.vm.provision "shell",
    run: "always",
    inline: $script
end
```

关于 vagrant 的使用和网络路由等配置不在这里讨论。

## 设置 vxlan 通信

vxlan 支持点对点/多播/手动配置等方式进行跨主机的 vxlan 通信，点对点模式通信不适用于超过两个节点的集群。
为了简化配置，使用节点间的多播地址进行 vxlan 间的通信。

> 基于多播的 vxlan 模式在主机网络（hosting network）不支持多播时无法使用，对于该问题至以及优化，在后续章节描述。

由于不同主机的 vxlan 之间使用 UDP 的多播（IGMP）进行通信以交换不同节点信息，所以需要选择同一个多播地址来完成，这里选择了 `239.1.1.1`.

此外，还需要选择一个 VNI(vxlan network identifier),作为该 L2 vxlan 的数据包标志，这里选择了 `42`.

ubuntu1 上:

```sh
# 创建一个vxlan设备
sudo ip link add vxlan0 type vxlan id 42 dstport 4789 group 239.1.1.1 dev eth1
sudo ip link set vxlan0 up
```

其他机器上进行相同的配置

正常情况下，此时不同主机上的 vxlan0 已经形成了一个 L2 网络了。

测试一下：

由于 vxlan0 没有 ip 地址，无法通过 L3 进行连通性测试，
可以使用 L2 的 `ping` 命令进行 L2 测试, ping 提供了参数 `-I` 可以指定 arp 数据包通过哪个网卡发送出去。

任意选择一台主机(ubuntu1),任意选择一个 IP 地址作为 ping 目的地址:

```sh
$ ping -I vxlan0 10.0.0.1
ping: Warning: source address might be selected on device other than vxlan0.
PING 10.0.0.1 (10.0.0.1) from 172.16.1.11 vxlan0: 56(84) bytes of data.
...
```

在其他主机(ubuntu2)上对 vxlan0 网卡抓包:

```sh
$ sudo tcpdump -nn -i vxlan0
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on vxlan0, link-type EN10MB (Ethernet), capture size 262144 bytes
11:18:22.186819 ARP, Request who-has 10.0.0.1 tell 172.16.1.12, length 28
11:18:23.189696 ARP, Request who-has 10.0.0.1 tell 172.16.1.12, length 28
...
```

arp 数据包已经成功的通过 vxlan 发送到了其他主机，L2 网络已经连通。

除了使用 ping 外，还可以对 vxlan0 设置 IP 地址

ubuntu1 vxlan0 上设置 IP `10.16.0.1/16`

```sh
$ sudo ip address add 10.16.0.1/16 dev vxlan0
$ ping 10.16.0.2
ping  10.16.0.2PING 10.16.0.2 (10.16.0.2) 56(84) bytes of data.
64 bytes from 10.16.0.2: icmp_seq=1 ttl=64 time=0.622 ms
64 bytes from 10.16.0.2: icmp_seq=2 ttl=64 time=0.918 ms
```

ubuntu1 vxlan0 上设置 IP `10.16.0.2/16`

```sh
$ sudo ip address add 10.16.0.2/16 dev vxlan0
$ sudo tcpdump -nn  -i vxlan0 -vvv
tcpdump: listening on vxlan0, link-type EN10MB (Ethernet), capture size 262144 bytes
01:40:09.770148 ARP, Ethernet (len 6), IPv4 (len 4), Request who-has 10.16.0.2 tell 10.16.0.1, length 28
01:40:09.770181 ARP, Ethernet (len 6), IPv4 (len 4), Reply 10.16.0.2 is-at 3a:39:6e:d0:2f:6b, length 28
01:40:09.770421 IP (tos 0x0, ttl 64, id 16657, offset 0, flags [DF], proto ICMP (1), length 84)
    10.16.0.1 > 10.16.0.2: ICMP echo request, id 2971, seq 1, length 64
01:40:09.770445 IP (tos 0x0, ttl 64, id 37746, offset 0, flags [none], proto ICMP (1), length 84)
    10.16.0.2 > 10.16.0.1: ICMP echo reply, id 2971, seq 1, length 64
01:40:10.889570 IP (tos 0x0, ttl 64, id 16923, offset 0, flags [DF], proto ICMP (1), length 84)
...
```

验证完成后记得移除 vxlan0 上的 IP:

```sh
sudo ip addr flush dev vxlan0
```

## 使用 bridge 来接入容器

linux bridge 是一个二层设备，所有接入到网桥上的设备都能够发现其他接入该网桥的设备。可以将`veth0` `vxlan0` 通过网桥接入到一起，实现通过 veth0 发出的流量能够进入 vxlan0，从而实现跨主机通信。

接入网桥后，vxlan0 的所有流量将进入网桥。

```sh
# 创建一个网桥设备
sudo ip link add name br0 type bridge
sudo ip link set br0 up

# 将vxlan加入网桥
sudo ip link set vxlan0 master br0
```

将 vxlan0 加入网桥后，可以在一台机器使用 `ping -I br0 10.0.0.1`，在其他机器上`sudo tcpdump -i br0` 抓包检验 L2 通信,也是能够正常通信。

### 模拟容器环境

ip 命令提供了 netns 子命令来帮助管理多个网络空间(NS_NETWORK)，可使用该子命令创建一个新的网络空间，借此来模拟容器环境。

在 ubuntu1,ubuntu2 上创建一个"容器":

```sh
# 创建一个网络空间 ns1,作为“容器”
sudo ip netns add ns1
# 创建 veth pair,一端名称为 veth0,一端名称为 eth-tmp
sudo ip link add veth0 type veth peer name eth-tmp
# 将 eth-tmp 的一端放入网络空间 ns1
sudo ip link set eth-tmp netns ns1
# 重命名 ns1 中 eth-tmp 为 eth0
sudo ip netns exec ns1 ip link set eth-tmp name eth0
# 启用所有设备
sudo ip netns exec ns1 ip link set eth0 up
sudo ip netns exec ns1 ip link set lo up
sudo ip link set veth0 up
```

将容器也接入网桥

```sh
sudo ip link set veth0 master br0
```

理论上，此时跨主机的 L2 已经能够通信。在容器内执行 ping - tcpdump 也能够跨主机 L2 联通,但此时 arp 源 IP 为 0.0.0.0 无意义。

### 设置容器

我们需要给容器设置 IP 地址路由，检验 L3 通信是否正常。

> 把该网段的第一个 IP 地址`10.233.0.1`作为网关地址预留，不分配给容器，之所以需要网关，是能够将数据包路由出去且可以在网关上进行网络策略配置。

为容器设置 IP:

ubuntu1 设置 10.233.0.2:

```sh
# 设置 ns1 中 eth0 的IP地址为"容器"IP地址: 10.233.0.2
sudo ip netns exec ns1 ip address add 10.233.0.2/16 dev eth0
# 此时在容器内部，还没有路由，需要添加路由
# 设置所有流量都通过容器 eth0 出去下一跳为网关地址 10.233.0.1
sudo ip netns exec ns1 ip route add default via 10.233.0.1 dev eth0
```

ubuntu2 设置 10.233.0.3:

```sh
sudo ip netns exec ns1 ip address add 10.233.0.3/16 dev eth0
sudo ip netns exec ns1 ip route add default via 10.233.0.1 dev eth0
```

### 设置网关

我们在上面的配置中将 10.233.0.1 作为了网关，所有容器的流量都将发送至该地址，却未配置拥有该 IP 的设备。

可以将 10.233.0.1 设置在 br0 或者 vxlan0 上都可。

我们将 br0 作为网关进行设置,每台主机都需要配置：

```sh
sudo ip addr add 10.233.0.1/16 dev br0
```

测试一下：

在 ubuntu1(10.233.0.2) 上：

```sh
$ sudo ip netns exec ns1 ping 10.233.0.3
PING 10.233.0.3 (10.233.0.3) 56(84) bytes of data.
64 bytes from 10.233.0.3: icmp_seq=1 ttl=64 time=1.26 ms
64 bytes from 10.233.0.3: icmp_seq=2 ttl=64 time=0.626 ms
```

此时，跨主机容器已经能够顺利通信,主机到容器也能够正常通信。

现在来梳理一下，从一个容器到另一个容器的 ping 命令下面都发生了什么。

以从 ubuntu1(172.16.1.11) 容器 10.233.0.2 到 ubuntu2(172.16.1.12)容器 10.233.0.3 为例：

1. 容器：10.233.0.2 网络下执行 ping，生成 arp 数据包，`who has 10.233.0.3 tell 10.233.0.2`
1. 容器：根据到路由表 `default via 10.233.0.1 dev eth0` ，将数据包从 eth0 发出。
1. 主机：veth0 收到数据包，将数据包转至 br0(10.233.0.1).br0 寻找 fdb 将数据包从 vxlan0 发出。
1. ...

## NAT out

目前为止，能够做到主机到容器，但尚不能做到从容器内部访问外网。

为了能够让容器访问外网，还需要设置 NAT，将从目的地址为非容器网段的数据包进行 NAT 转换。

涉及到数据包转发，需要开启内核`/proc/sys/net/ipv4/ip_forward`

```sh
# 开启IP转发
sudo sysctl -w net.ipv4.ip_forward=1
# 将从10.233.0.0/16源地址且目的地址非10.233.0.0/16的数据包进行伪装(MASQUERADE)
sudo iptables -t nat --append POSTROUTING --src 10.233.0.0/16 ! --dest 10.233.0.0/16 --jump MASQUERADE
```

## 手动维护 vxlan

上文使用的多播地址 239.1.1.1 进行 vxlan 之间协调。

如果在不支持多播的 underlay 网络中，则上述模式无法工作。需要手动维护 vxlan 配置。包含 forwading database ,arp table 等。

（未完待续）...
