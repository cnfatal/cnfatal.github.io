# sriov in container

sriov 在容器中直接操作 VF 网卡

## 环境

操作系统: ubuntu server 19.10
网卡: Intel I350 T2

## 设置 SRIOV

1. 在 bios 中开启虚拟化技术和 Intel® VT-d 或者 AMD-VI (IOMMU).
1. 如果需要将 VF 分配给虚拟使用，则需要在 linux 中开启 I/O Memory Management Unit (IOMMU)支持，当分配给 VM 时，VF 需要 IOMMU 支持才能正常工作.（未设置此步骤）
1. 使用 `sudo cat /sys/class/net/enp1s0f0/device/sriov_totalvfs`,能够看见支持的最大 VF 数量。
1. `echo 7 | sudo tee /sys/class/net/enp1s0f0/device/sriov_numvfs` 直接设置 vf 数量，之后能够在 `ip a`中看见多出来的 VF。

   ```sh
   $ echo 7 | sudo tee /sys/class/net/enp1s0f0/device/sriov_numvfs
   $ ip a
   1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
      link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
      inet 127.0.0.1/8 scope host lo
         valid_lft forever preferred_lft forever
      inet6 ::1/128 scope host
         valid_lft forever preferred_lft forever
   2: enp2s0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc fq_codel state DOWN group default qlen 1000
      link/ether e0:d5:5e:4d:11:16 brd ff:ff:ff:ff:ff:ff
      inet6 fe80::e2d5:5eff:fe4d:1116/64 scope link
         valid_lft forever preferred_lft forever
   3: enp3s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
      link/ether 08:1f:71:02:d8:81 brd ff:ff:ff:ff:ff:ff
      inet 192.168.0.52/16 brd 192.168.255.255 scope global dynamic enp3s0
         valid_lft 172695sec preferred_lft 172695sec
      inet6 fe80::a1f:71ff:fe02:d881/64 scope link
         valid_lft forever preferred_lft forever
   4: enp1s0f0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether a0:36:9f:a3:70:f2 brd ff:ff:ff:ff:ff:ff
   5: enp1s0f1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether a0:36:9f:a3:70:f3 brd ff:ff:ff:ff:ff:ff
   6: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default
      link/ether 02:42:72:3a:ce:74 brd ff:ff:ff:ff:ff:ff
      inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
         valid_lft forever preferred_lft forever
   7: enp1s0f0v0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether da:1d:22:4f:43:f6 brd ff:ff:ff:ff:ff:ff
   8: enp1s0f0v1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether a2:5d:0d:4b:48:21 brd ff:ff:ff:ff:ff:ff
   9: enp1s0f0v2: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether 82:b4:00:35:e4:45 brd ff:ff:ff:ff:ff:ff
   10: enp1s0f0v3: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether e6:74:0e:53:af:2f brd ff:ff:ff:ff:ff:ff
   11: enp1s0f0v4: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether 96:be:c4:09:b9:2d brd ff:ff:ff:ff:ff:ff
   12: enp1s0f0v5: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether 2a:a3:35:53:2e:60 brd ff:ff:ff:ff:ff:ff
   13: enp1s0f0v6: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
      link/ether 1a:23:2f:e8:ca:43 brd ff:ff:ff:ff:ff:ff
   ```

   > 许多文章中所说的使用 `modprobe -r igb && modprobe igb max_vfs=7` 方式也可以设置 VF，但是已经 deprecated。所以使用 PCI SYS 接口是推荐的方式。
   > 参考[OpenStack Using SR-IOV functionality](https://docs.openstack.org/liberty/networking-guide/adv-config-sriov.html)

1. 可以使用 `lspci -d ::"0200"` 来过滤仅查看 enthernet pci。

## 安装 DPDK

系统要求: 对于大多数平台，不需要特殊的 BIOS 设置即可使用基本的 DPDK 功能。但是，为了获得其他 HPET 计时器和电源管理功能以及高性能的小数据包，可能需要更改 BIOS 设置。请参阅[启用其他功能](https://doc.dpdk.org/guides/linux_gsg/enable_func.html#enabling-additional-functionality)部分， 以获取有关所需更改的更多信息。

> 如果启用了 UEFI 安全启动，则 Linux 内核可能会禁止在系统上使用 UIO。因此，供 DPDK 使用的设备应绑定到 vfio-pci 内核模块，而不是 igb_uio 或 uio_pci_generic。有关更多详细信息，请参见将网络端口与内核模块绑定和解除绑定。

DPDK 目前还没稳定的 DPDK release，官方推荐是从源码编译。但是能够从 ubuntu 源搜索到 dpdk 相关包。当然如果需要对 DPDK 编译选项进行定制则需要手动编译。

尝试安装 dpdk，可以安装时增加参数 `--sugusts packages` 一并安装建议安装的包，但是注意磁盘占用。

```sh
$ sudo apt-cache search dpdk
dpdk - Data Plane Development Kit (runtime)
dpdk-doc - Data Plane Development Kit (documentation)
librte-bus-pci18.11 - Data Plane Development Kit (librte_bus_pci runtime library)
...
$ sudo apt-get install dpdk
# 对于开发使用可以安装 dpdk-dev
```

DPDK driver 支持，参看官方文档： [Linux Drivers](https://doc.dpdk.org/guides/linux_gsg/linux_drivers.html)

不同的 PMD 可能需要不同的内核驱动程序才能正常工作。根据所使用的 PMD，应加载相应的内核驱动程序并将其绑定到网络端口。支持使用以下类型驱动：

1. UIO

   一个小的内核模块，用于设置设备，将设备内存映射到用户空间并注册中断。
   在许多情况下，uio_pci_genericLinux 内核中包含的标准模块可以提供 uio 功能。
   uio_pci_generic 模块不支持 VF 的创建。

   ```sh
   sudo modprobe uio_pci_generic
   ```

   作为 uio_pci_generic 的替代，DPDK 还包括 igb_uio 模块，该模块支持 VF，可在 kmod 子目录中找到并加载：

   ```sh
   sudo modprobe uio
   sudo insmod kmod/igb_uio.ko
   ```

   如果内核没有该模块，则需要 `sudo apt-get install dpdk-igb-uio-dkms`

   > 如果 bios 启用了安全启动，则无法使用 UIO，此时就需要 vfio-pci 模块来替代上述模块了。

1. VFIO

   与 UIO 相比，依靠 IOMMU 保护，驱动程序更强大，更安全。要使用 VFIO，必须加载 vfio-pci 模块：

   ```sh
   sudo modprobe vfio-pci
   ```

   如果要使用 vfio ，则需要内核 >= 3.6.0,一般情况下默认携带该 mod。要使用该模块，需要 BIOS 和内核均支持虚拟化。
   但是，vfio-pci 模块不支持创建 VF,也就是说 vfio-pci 模块一般用于驱动 VF，而不是 PF。

   > 可以在没有 IOMMU 的情况下使用 VFIO。尽管这与使用 UIO 一样不安全，但在 IOMMU 不可用的情况下，它的确使用户可以保持 VFIO 拥有的设备访问和编程的程度。

1. Bifurcated Driver

   使用分叉驱动程序的 PMD 与设备内核驱动程序共存。在这种模型上，NIC 由内核控制，而数据路径由 PMD 直接在设备顶部执行。

   这种模型具有以下优点：

   它是安全且强大的，因为内存管理和隔离是由内核完成的。
   它使用户可以使用旧版 Linux 工具，例如在同一网络端口上运行 DPDK 应用程序时 ethtool 或 ifconfig 在运行这些工具时。
   它使 DPDK 应用程序可以仅过滤部分流量，而其余部分将由内核驱动程序控制。流分叉由 NIC 硬件执行。例如，使用流隔离模式可以严格选择 DPDK 中接收的内容。
   有关分支驱动程序的更多信息，请参见[Mellanox 分支 DPDK PMD](https://www.dpdk.org/wp-content/uploads/sites/35/2016/10/Day02-Session04-RonyEfraim-Userspace2016.pdf)。

### 内核模块与端口绑定

使用 UIO 或者 VFIO 驱动的 PMD，所有 DPDK 的应用程序使用的端口必须在运行之前绑定到 uio_pci_generic, igb_uio or vfio-pci 模块。
因为许多 PMD 会忽略任何被 linux 控制的端口，导致应用程序不能使用这些端口。

DPDK 提供了一个名为 dpdk-devbind.py 的实用程序脚本。此实用程序可用于提供系统上网络端口的当前状态的视图，以及绑定和解除绑定来自不同内核模块（包括 uio 和 vfio 模块）的那些端口。

```sh
$ dpdk-devbind.py --status

Network devices using DPDK-compatible driver
============================================
0000:01:00.0 'I350 Gigabit Network Connection 1521' drv=uio_pci_generic unused=igb,vfio-pci
0000:01:00.1 'I350 Gigabit Network Connection 1521' drv=uio_pci_generic unused=igb,vfio-pci

Network devices using kernel driver
===================================
0000:02:00.0 'RTL8111/8168/8411 PCI Express Gigabit Ethernet Controller 8168' if=enp2s0 drv=r8169 unused=vfio-pci,uio_pci_generic
0000:03:00.0 'RTL8111/8168/8411 PCI Express Gigabit Ethernet Controller 8168' if=enp3s0 drv=r8169 unused=vfio-pci,uio_pci_generic *Active*

No 'Crypto' devices detected
============================

No 'Eventdev' devices detected
==============================

No 'Mempool' devices detected
=============================

No 'Compress' devices detected
==============================
```

> 由于 VFIO 的工作方式，与 VFIO 一起使用的设备存在某些限制。主要取决于 IOMMU 组的工作方式。
> 任何 VF 设备都可以单独与 VFIO 一起使用，但是物理设备将需要将所有端口绑定到 VFIO，或者将其中一些端口绑定到 VFIO，而其他端口则根本不需要绑定任何东西。
> 如果您的设备位于 PCI 到 PCI 桥接器的后面，则该桥接器将成为设备所在的 IOMMU 组的一部分。
> 因此，桥接器驱动程序也应从桥接器 PCI 设备上解除绑定，以便 VFIO 与在桥后面的设备一起使用。

### 配置 Crypto 设备

硬件支持: Crypto QAT 需要 Intel 的硬件加速设备，QAT 对称加密 PMD（以下称为 QAT SYM [PMD]）为以下硬件加速器设备提供轮询模式加密驱动程序支持：

Intel QuickAssist Technology DH895xCC
Intel QuickAssist Technology C62x
Intel QuickAssist Technology C3xxx
Intel QuickAssist Technology D15xx
Intel QuickAssist Technology C4xxx

> 由于没有相应的硬件设备，所以使用 QAT Crypto PMD 类型的驱动设备无法使用。跳过该环节。

可以使用[OpenSSL Crypto Poll Mode Driver](https://doc.dpdk.org/guides/cryptodevs/openssl.html)来设置 DPDK 的 Crypto。

## 启动 FD.io/VPP

### 安装 vpp

参考文档 [Ubuntu 18.04 - Setup the FD.io Repository](https://fd.io/docs/vpp/master/gettingstarted/installing/ubuntu.html)

1. 创建文件 `/etc/apt/sources.list.d/99fd.io.list`

   ```list
   deb [trusted=yes] https://packagecloud.io/fdio/release/ubuntu bionic main
   ```

   添加 resource gpgkey:

   ```sh
   curl -L https://packagecloud.io/fdio/release/gpgkey | sudo apt-key add -
   ```

1. 安装 VPP release

   ```sh
   sudo apt-get update
   sudo apt-get install vpp vpp-plugin-core vpp-plugin-dpdk
   ```

   如果需要进行基于 VPP 的开发需要安装

   ```sh
   sudo apt-get install vpp-api-python python3-vpp-api vpp-dbg vpp-dev
   ```

   由于是 ubuntu server 19.10 eoan, 上述包需要依赖 18.04 bionic 的源里面的包，所以需要将源 bionic 加入。
   创建文件 `/etc/apt/sources.list.d/bionic.list`

   ```list
    deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ bionic main restricted universe multiverse
   ```

### 配置 VPP

配置 HugePages Memory,参考[Huge Pages](https://fd.io/docs/vpp/master/gettingstarted/users/configuring/hugepages.html) 和 [DPDK-System Requirements](https://doc.dpdk.org/guides/linux_gsg/sys_reqs.html)

除非 CPU 支持更大的 huge page，否则可以不用更改当前设置。

示例配置：

```dotnetcli

```

### vppctl 操作

vppctl 命令详细文档需要查看[Debug CLI](https://docs.fd.io/vpp/17.07/clicmd.html),VPP [Useful Debug CLI
](https://fd.io/docs/vpp/master/reference/cmdreference/index.html) 已经不推荐和不完整。

由于网卡控制权已经完全由 VPP（DPDK）接管，所以应用程序无法直接使用该网卡提供服务，所以需要使用虚拟网卡对的方式，一边由 VPP 控制，一边由 linux 控制。

> 网络对使用的是 vth pair 或者 tun/tap

vth pair 用于不同命名空间数据传输，tun 仅是在主机上模拟一个网络设备，二层设备叫 tap，三层设备叫 tun。

按照上述：

1. 如果在主机上使用 VPP，则仅需要在主机上增加 tap/tun 设备。
1. 如果是在主机控制容器中流量使用 VPP 则需要创建 vth pair。
1. 如果是在容器中独立使用 vpp ，则需要主机将 VF 控制权移交给容器，在容器内使用 tap 方式使用 VPP。

## 问题记录

### numvfs 设置失败

```sh
$ echo 7 | sudo tee /sys/bus/pci/devices/0000\:01\:00.1/sriov_numvfs
7
tee: '/sys/bus/pci/devices/0000:01:00.1/sriov_numvfs': Cannot allocate memory
# cat /sys/class/net/enp1s0f0/device/sriov_numvfs
0
# echo '7' > /sys/class/net/enp1s0f0/device/sriov_numvfs
bash: echo: write error: Cannot allocate memory
# dmesg
[  481.570274] igb 0000:01:00.0: can't enable 7 VFs (bus 02 out of range of [bus 01])
```

主板 lspci

```sh
$ lspci
00:00.0 Host bridge: Intel Corporation Xeon E3-1200 v6/7th Gen Core Processor Host Bridge/DRAM Registers (rev 06)
00:01.0 PCI bridge: Intel Corporation Xeon E3-1200 v5/E3-1500 v5/6th Gen Core Processor PCIe Controller (x16) (rev 06)
00:02.0 VGA compatible controller: Intel Corporation HD Graphics 630 (rev 04)
00:14.0 USB controller: Intel Corporation 200 Series/Z370 Chipset Family USB 3.0 xHCI Controller
00:16.0 Communication controller: Intel Corporation 200 Series PCH CSME HECI #1
00:17.0 SATA controller: Intel Corporation 200 Series PCH SATA controller [AHCI mode]
00:1c.0 PCI bridge: Intel Corporation 200 Series PCH PCI Express Root Port #5 (rev f0)
00:1c.7 PCI bridge: Intel Corporation 200 Series PCH PCI Express Root Port #8 (rev f0)
00:1d.0 PCI bridge: Intel Corporation 200 Series PCH PCI Express Root Port #9 (rev f0)
00:1f.0 ISA bridge: Intel Corporation 200 Series PCH LPC Controller (B250)
00:1f.2 Memory controller: Intel Corporation 200 Series/Z370 Chipset Family Power Management Controller
00:1f.3 Audio device: Intel Corporation 200 Series PCH HD Audio
00:1f.4 SMBus: Intel Corporation 200 Series/Z370 Chipset Family SMBus Controller
01:00.0 Ethernet controller: Intel Corporation I350 Gigabit Network Connection (rev 01)
01:00.1 Ethernet controller: Intel Corporation I350 Gigabit Network Connection (rev 01)
03:00.0 Ethernet controller: Realtek Semiconductor Co., Ltd. RTL8111/8168/8411 PCI Express Gigabit Ethernet Controller (rev 15)
```

1. 尝试过将主板的 x16 pcie 速率设置为 gen2,将主板 bios 升级至最新版本。
   因 [英特尔 ® 以太网服务器适配器 I350-T2](https://ark.intel.com/content/www/cn/zh/ark/products/59062/intel-ethernet-server-adapter-i350-t2.html)
   中 `系统接口类型: PCIe v2.1 (5.0 GT/s)` `速度和插槽宽度: 5 GT/s, x4 Lane`.失败。

1. 尝试在 grup 启动参数中设置 pci=assign-busses，重启后后网络接口 dhcp 失效（可能还有其他问题），且依旧不能设置 VF。失败。

1. 最终在 [[E1000-devel] Problem : SR-IOV: bus number out of range](https://www.mail-archive.com/e1000-devel@lists.sourceforge.net/msg06052.html)
   中提到: > The x16 slots in a lot of mother boards are meant for graphics cards.
   I've seen some problems with putting network or other types of PCIe
   cards in them. Can you try moving the NIC to a different slot with a
   x4 or x8 connector?

解决方案：最终更换了主板，将该网卡插入主板 pci x4 口上，工作正常.

### 在 host，如果使用 PF 在 VPP 中，则无法创建 VF

在 host 上，如果将 PF 纳入 VPP，则无论如何均无法创建 VF。仅能使用 igb 驱动 PF 创建 VF，然后将这些 VF 纳入 VPP DPDK 管理。

vpp 在启动时默认会将所有支持的 interface 纳入管理，自动切换驱动默认为 uio_pci_generic。

vpp 启动是会跳过将状态设置为 UP 的 PF。

保持 vpp config 中的驱动配置为默认，如果非“auto”则需要手动去绑定 VF 或 PF 的驱动。

### addresses conflicts

```sh
$ sudo vppctl set interface ip address  VirtualFunctionEthernet1/10/0 10.10.1.1/24
$ sudo vppctl set interface ip address  VirtualFunctionEthernet1/10/1 10.10.1.2/24
set interface ip address: failed to add 10.10.1.2/24 on VirtualFunctionEthernet1/10/1 which conflicts with 10.10.1.1/24 for interface VirtualFunctionEthernet1/10/0
```

解决办法：每一个 interface 的网络地址不能交叉，也就是说每一个 interface 即为一个子网
