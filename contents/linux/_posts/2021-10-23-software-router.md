---
title: 基于 ubuntu 配置家庭网关(软路由)并替换光猫
tags: [软路由, linux, ubuntu, 网关, 光猫，epon]
---

最近想设置一个自己的服务器,一方面合理利用现有宽带的公网 IP 资源，可以在服务器上运行一些常规的服务，一方面能够替换掉运营商网关实现更灵活的网关功能。

遂规划搭建一个家庭网关。

## 规划

设备使用的是组装 X64 PC，具体硬件不做说明，大同小异。随便找一个不要的旧电脑也可以。

操作系统安装的是 `Ubuntu Server 22.04.1 LTS minimal`

当前有的网络硬件:

- `enp1s0` 1000/10000Base SFP 接口
- `enp2s1` 1000Base-T RJ45 接口
- `wlp3s0` 无线网卡

```sh
$ ip link
...
2: enp2s0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc mq master br0 state DOWN mode DEFAULT group default qlen 1000
    link/ether 70:85:c2:a9:d5:02 brd ff:ff:ff:ff:ff:ff
3: enp1s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT group default qlen 1000
    link/ether 90:e2:ba:8b:91:b4 brd ff:ff:ff:ff:ff:ff
...
5: wlp3s0: <BROADCAST,MULTICAST> mtu 1500 qdisc noqueue state DOWN mode DEFAULT group default qlen 1000
    link/ether 3c:6a:a7:a0:d6:10 brd ff:ff:ff:ff:ff:ff
```

计划将 `enp1s0` 作为 WAN 口进行 pppoe 与服务商连接，`enp2s0` 作为有线 LAN 口对内网提供服务。`wlp3s0` 提供 2.4G/5G 作为 WLAN 使用。

ubuntu server 默认使用 systemd-networkd 配合 netplan 进行网络管理，配置非常简洁，后续的配置大部分都基于 netplan。
先看官方文档:[netplan reference](https://netplan.io/reference)以及示例配置:[netplan examples](https://netplan.io/examples)

## epon wan setup

家用环境一般是运营商 FTTH，光猫负责拨号,内网设备 nat 上网，但是光猫功能有限，硬件也一般。

一种常规解决方案是光猫改桥接，下联主路由拨号和提供更多功能，这种方式网上有很多教程。

接下来使用了另一种方式更为彻底的方式，直接光纤到主路由，抛弃光猫。

没有了光猫，就需要能够处理 Pon 网络的设备。

运营商 FTTH 一般有两种 EPON 或 GPON，要确定是哪一种可以直接看光猫上有 EPON 或者 GPON 字样。
更多关于 EPON 和 GPON 协议和技术不再这里讨论

要能够和 EPON OLT 正常通信，需要有合格的 ONU 硬件才行，由于使用的是 SFP 接口的网卡，需要找到 SFP/SFP+ 的 ONU 模块，**并且还要支持 CTC 2.1 OAM 扩展**，通用 epon onu 最多支持使用 mac 认证，而电信 epon 要求 onu 使用扩展 OAM，增加了实用 LOID 进行认证，还增加了其他 OAM 扩展。

> CTC 2.1 也叫 《中国电信 EPON 设备技术要求 V2.1》

现在要满足这些要求的硬件可以说是非常非常少了。

目前最大众的 epon onu 有几类：

- ODI XPON STICK (DFP-34x-2c2) 支持 EPON/GPON 自动识别，1G/2.5G 速率。
- 海信 10G EPON ONU With Mac (LTF7263BH+) 支持 EPON，10G 速率。
- 还有一些不知名厂商也出了 XPON stick (不敢买)

我只能选择相对便宜的 ODI XPON Stick

我使用的网卡是 Intel X520-SR1 使用的芯片是 82599 系列，在 linux 中的驱动是 ixgbe：

```sh
$ sudo lshw -C network
  *-network
       description: Ethernet interface
       product: 82599ES 10-Gigabit SFI/SFP+ Network Connection
       vendor: Intel Corporation
```

> 这里踩了个坑： ODI 的猫棒和 BCM57810 网卡配合无法正常使用， 模块信息能够获取到但 `Link detected: no` 正在排坑中...
> 后来才换成了 intel 的网卡

要先配置 ODI stick ，根据说明，stick 在启动完成后会在`192.168.1.1`提供 web 界面用于配置。

把 ODI stick 插入 sfp 接口后可以看到 SFP 模块信息：

```sh
$ sudo ethtool -m enp1s0
    Identifier                                : 0x03 (SFP)
    Extended identifier                       : 0x04 (GBIC/SFP defined by 2-wire interface ID)
    Connector                                 : 0x01 (SC)
    Transceiver codes                         : 0x00 0x00 0x00 0x02 0x22 0x00 0x01 0x00 0x00
    Transceiver type                          : Ethernet: 1000BASE-LX
    Transceiver type                          : FC: intermediate distance (I)
    Transceiver type                          : FC: Longwave laser (LC)
    Transceiver type                          : FC: Single Mode (SM)
    Encoding                                  : 0x01 (8B/10B)
    BR, Nominal                               : 1300MBd
    Rate identifier                           : 0x00 (unspecified)
    Length (SMF,km)                           : 20km
    Length (SMF)                              : 20000m
    Length (50um)                             : 0m
    Length (62.5um)                           : 0m
    Length (Copper)                           : 0m
    Length (OM3)                              : 0m
    Laser wavelength                          : 1310nm
    Vendor name                               : ODI
    Vendor OUI                                : 00:00:00
    Vendor PN                                 : DFP-34X-2C2
    Vendor rev                                :
    Option values                             : 0x00 0x1a
    Option                                    : RX_LOS implemented
    Option                                    : TX_FAULT implemented
    Option                                    : TX_DISABLE implemented
    BR margin, max                            : 0%
    BR margin, min                            : 0%
    Vendor SN                                 : XPON22110901
    Date code                                 : 221129
```

可以看到 ODI 模块能够正常识别，这个模块支持 SFF-8472,但是识别出来只支持到 SFF-8079 看不到光功率电流等信息. 不知道哪里有问题，不过不影响。

除了能够看到模块信息，link 要能够正常识别才能进行网络操作:

```sh
$ sudo ethtool enp1s0
Settings for enp1s0:
    Supported ports: [ FIBRE ]
    Supported link modes:   1000baseT/Full
    Supported pause frame use: Symmetric
    Supports auto-negotiation: Yes
    Supported FEC modes: Not reported
    Advertised link modes:  1000baseT/Full
    Advertised pause frame use: Symmetric
    Advertised auto-negotiation: Yes
    Advertised FEC modes: Not reported
    Speed: 1000Mb/s
    Duplex: Full
    Auto-negotiation: on
    Port: FIBRE
    PHYAD: 0
    Transceiver: internal
    Supports Wake-on: d
    Wake-on: d
          Current message level: 0x00000007 (7)
                                  drv probe link
    Link detected: yes
```

这里可以看到自动协商到了 `1000BaseT/Full` 并且 `Link detected: yes`

配置 EPon stick，要能够访问到 enp1s0 下的 odi 模块，要设置 enp1s0 地址到同一网段,然后就能访问啦。

```sh
$ sudo ip addr add 192.168.1.10/24 dev enp1s0
$ curl 192.168.1.1
<HTML><HEAD><TITLE>302 Moved Temporarily</TITLE></HEAD>
<BODY>
<H1>302 Moved</H1>The document has moved
<A HREF="/admin/login.asp">here</A>.
</BODY></HTML>
```

里面要配置的主要有：

- LOID & password 用于 epon oam 认证
- SN 设备序列号，这个要和光猫一致，理论上说电信入库了的设备号才能正常注册，没试过不设置能不能 epon 注册上。
- MAC 地址，有部分运营商不验证 mac 地址
- vlan 号，vlan 号有几个 internet,iptv，sip
- vlan 模式，这里 vlan 有两类，一类是保持原样，猫棒不处理 vlan，一种是所有都加上 vlan 标识。

获取上面这些信息要进入光猫 admin 后台，不同光猫方式不同。

由于上网和 iptv 走不同的 vlan，要想兼容 iptv 只能在主路由拨号时设置 vlan 而猫棒设置 vlan 保持原样即可。

这个时候把光线插入猫棒，然后重启，一般情况下就能正常注册 epon 了。

## pppoe wan setup

netplan 不支持设置 pppoe，因其后端 networkd 也不支持设置 pppoe 。
参见[add pppoe support to systemd-networkd·Issue481](https://github.com/systemd/systemd/issues/481),
这里面有许多参考价值比较高的 comment，建议全文阅读。

那就需要使用 ppp 进行 pppoe 配置，安装 ppp

```sh
sudo apt-get install ppp
```

推荐查看官方文档: [PPP github](https://github.com/ppp-project/ppp)或者`man pppd` 以了解如何使用。
其中官方文档对 pppoe 提供了详细说明 [README.pppoe](https://github.com/paulusmack/ppp/blob/master/README.pppoe)

配置 vlan 网卡，ubuntu 使用 netplan 更方便：

```yaml
# /etc/netplan/07-dsl-config.yaml
network:
  ethernets:
    enp1s0:
      addresses:
        - 192.168.1.10/24
  vlans:
    telecom.net:
      id: 1295
      link: enp1s0
  version: 2
```

> 成都电信的 pppoe vlan 号为 `1295`

ppp 在这张 vlan 1295 的网卡 `telecom.net` 上才能够正常进行 pppoe 拨号

要让 ppp 开机启动，需要用到 systemd 帮忙管理，参考 [issuecomment-1007374063](https://github.com/systemd/systemd/issues/481#issuecomment-1007374063) 编写 service 文件：

```toml
# /etc/systemd/system/ppp@.service
[Unit]
Description=PPP connection for %I
Documentation=man:pppd(8)
BindsTo=sys-devices-virtual-net-%i.device
After=sys-devices-virtual-net-%i.device

[Service]
Type=forking
ExecStart=/usr/bin/pon %i linkname %I updetach
ExecReload=kill -HUP $MAINPID
ExecStop=/usr/bin/poff %i
Restart=always
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/run/ /etc/ppp/
ProtectKernelTunables=yes
ProtectControlGroups=yes
SystemCallFilter=~@mount
SystemCallArchitectures=native
LockPersonality=yes

[Install]
WantedBy=sys-devices-virtual-net-%i.device
```

有了上面的 service template 根据其编写 ppp peers file:

编写 pppoe config `/etc/ppp/peers/eno1`

```conf
; /etc/ppp/peers/eno1
$ cat /etc/ppp/peers/telecom.net
plugin rp-pppoe.so
ifname ppp-telecom
nic-telecom.net
noauth # required no pap/chap
user <account>
password <password>
noipdefault
usepeerdns
replacedefaultroute
defaultroute
defaultroute6
persist
+ipv6
ipv6cp-use-ipaddr
```

> 这里有小坑，pppoe 服务器在这里不使用 chap/pap 直接使用密码进行认证,要设置 `noauth` 又要设置 `password` .

如果无法正常拨号，可以增加 `debug` 选项，然后 journalctl 看日志来排查问题。

如果 pppoe server 要求 chap/pap 可以把密码设置到 `/etc/ppp/chap-secrets` 或 `/etc/ppp/pap-secrets` 中

启动 ppp@.service ：

```sh
sudo systemctl daemon-load
sudo systemctl enable ppp@telecom.net.service
sudo systemctl start ppp@telecom.net.service
sudo systemctl status ppp@telecom.net.service
```

如果一切正常就可以看到一个新的 ppp 网卡并且获取到了 IP 地址。

```sh
$ ip a show  ppp-telecom
13: ppp-telecom: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1492 qdisc fq_codel state UNKNOWN group default qlen 3
    link/ppp
    inet xxx.xxx.158.9 peer xxx.xxx.158.1/32 scope global ppp-telecom
       valid_lft forever preferred_lft forever
```

ppp 不仅获取到了 ipv4 地址，还获取到了服务商的 dns 地址，但是在 ubuntu 中，启用了 `systemd-resolved` 则不会自动更新 dns。
ppp 还自动创建并更新了 `/etc/ppp/resolv.conf` 文件，这里面包含了 ppp 获取到的 dns。

要让 `systemd-resolved` 设置 dns，要使用 `resolvectl` 命令手动设置,好在 ppp 还提供了 hook 可以使用，那就在 ip-up 的 hook 中更新 dns

编写 hook：

```sh
#!/bin/sh

#/etc/ppp/ip-up.d/0010-systemd-resolved

# this variable is only set if the usepeerdns pppd option is being used
[ "$USEPEERDNS" ] || exit 0

# exit if systemd-resolved is not running
[ -e /run/systemd/system ] || systemctl is-active --quiet systemd-resolved.service || exit 0

if [ "${DNS1}" ]; then
  if [ "${DNS2}" ]; then
    /usr/bin/resolvectl dns "${IFNAME}" "${DNS1}" "${DNS2}"
  else
    /usr/bin/resolvectl dns "${IFNAME}" "${DNS1}"
  fi
fi

exit 0
```

至此 pppoe ipv4 配置完成。

## ipv6 wan setup

为了响应 《推进互联网协议第六版（IPv6）规模部署行动计划》和《关于加快推进互联网协议第六版（IPv6）规模部署和应用工作的通知》 ，家庭网关也要推进 ipv6 部署。

电信提供了 IPv6 支持，终端用户可以在 ppp 上获取到 ipv6 地址,
并且电信对端也支持 SLAAC（Stateless Address Autoconfiguration） 无需启用 dhcp6 client 。

可以使用 rdisc6 检查上游 RA 内容是否支持无状态配置:

```sh
$ rdisc6 ppp-telecom -1
Soliciting ff02::2 (ff02::2) on ppp-telecom...

Hop limit                 :           64 (      0x40)
Stateful address conf.    :           No
Stateful other conf.      :           No
Mobile home agent         :           No
Router preference         :       medium
Neighbor discovery proxy  :           No
Router lifetime           :         1800 (0x00000708) seconds
Reachable time            :  unspecified (0x00000000)
Retransmit time           :  unspecified (0x00000000)
 Source link-layer address: CC:1A:FA:E8:2A:00
 MTU                      :         1492 bytes (valid)
 Recursive DNS server     : 240e:56:4000:8000::69
 Recursive DNS server     : 240e:56:4000::218
  DNS servers lifetime    :     infinite (0xffffffff)
 Prefix                   : 240e:398:e12:6a1::/64
  On-link                 :          Yes
  Autonomous address conf.:          Yes
  Valid time              :      2592000 (0x00278d00) seconds
  Pref. time              :       604800 (0x00093a80) seconds
 from fe80::ce1a:faff:fee8:2a00
```

主要关注两个 flag `Stateful address conf: No`,`Stateful other conf: No` 这两个 flags 说明支持无状态配置，无需使用 dhcpv6 即可配置 ipv6.
并且 RA options 中返回了 dns options 和 prefix options,这些信息足够配置 IPv6 了。

> 严格一点，还需要确认 prefix option 中 `on link` 和 `autonomous` flag 也为 yes 才行。

在 systemd-networkd 上只需要开启 ppp link 的 accept ra 选项即可获取到 ipv6 地址以及 dns:

```toml
# /etc/systemd/network/50-ppp-dhcpv6.network
[Match]
Type = ppp

[Network]
DHCP = no
IPv6AcceptRA = yes

[IPv6AcceptRA]
#DHCPv6Client=always # 这里 networkd 不支持 slaac 前缀代理，需要增加这个才能正常使用 prefixDelegation
```

正常情况下:

```sh
13: ppp-telecom: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1492 qdisc fq_codel state UNKNOWN group default qlen 3
    link/ppp
    inet xxx.xxx.158.9 peer xxx.xxx.158.1/32 scope global ppp-telecom
       valid_lft forever preferred_lft forever
    inet6 240e:398:e12:3535:200:ff:fe00:0/64 scope global dynamic mngtmpaddr noprefixroute
       valid_lft 2591590sec preferred_lft 604390sec
    inet6 fe80::92e2:ba14:6a8b:91b4 peer fe80::ce1a:faff:fee8:2a00/128 scope link
       valid_lft forever preferred_lft forever
```

如果获取到以 `240e:` 开头的 ipv6 地址即为成功, ip 6 路由也会自动配置（由 ppp 提供）：

```sh
$ ip -6 r
...
240e:398:e12:3535::/64 dev ppp-telecom proto ra metric 1024 expires 2591403sec pref medium
default dev ppp-telecom metric 1024 pref medium
...
$ resolvectl dns ppp-telecom
Link 15 (ppp-telecom): 61.139.2.69 218.6.200.139 240e:56:4000:8000::69 240e:56:4000::218
```

可以找一个 ipv6 服务器测试一下:

```sh
$ curl 6.ipw.cn
240e:398:e12:3535:200:ff:fe00:0
$ curl test.ipw.cn # 测试ipv6优先
240e:398:e12:3535:200:ff:fe00:0
```

## ddns setup

pppoe 由于每次获取到的公网地址随机，因此需要使用 ddns 来动态解析以获取 IP 地址。以后服务器的服务可以基于该 dns 进行使用。

ddns 也是一个很大的话题了，其中以花生壳和 dnspod 最为熟知。多年前的 dnspod 服务（现已经被腾讯云收购,[Dnspod API 文档](https://www.dnspod.cn/docs/index.html) 依旧可用但是也快被合并进腾讯云 API 了。

本人使用的是阿里云 云解析，要更新解析就需要用阿里云的 API，可以将该脚本放置在 `/etc/ppp/up.d/` 下，一旦 ppp 成功即运行脚本更新 dns。

这里使用作者编写的 [cnfatal/alidnsctl](https://github.com/cnfatal/alidnsctl) 命令行工具。

```sh
$ cat /etc/ppp/ip-up.d/20-ddns
#!/bin/sh -e

export ACCESS_KEY_ID=<access key id>
export ACCESS_KEY_SECRET=<access key secret>

alidnsctl set router.example.com ${IPLOCAL}
```

这里记得要给脚本 `/etc/ppp/ip-up.d/20-ddns` 加上可执行权限才能被正确执行。

## lan setup

为了让有线和无线都在一个网络中，需要一个网桥将两个网卡连接在一起，这样网桥内的设备均在一个二层网络内。
由于无线网络走了独立的 ap 设备，需要把连接到 ap 的网口也加进网桥，板载的无线网卡暂时就没用使用到了。

dhcp 服务器可以使用：

1. [systemd-networkd.service(8)](https://manpages.ubuntu.com/manpages/jammy/man8/systemd-networkd.service.8.html) 提供的 dhcpserver 功能，因其是 ubuntu 预置软件无需额外安装。
1. [isc-dhcp-server](https://www.isc.org/dhcp/),也称为 [dhcpd(8)](https://manpages.ubuntu.com/manpages/jammy/en/man8/dhcpd.8.html)。

那当然是选择一站式的 nwtworkd 啊

```yaml
# /etc/netplan/10-bridge-config.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp2s0:
      optional: true
    eno1:
      optional: true
  bridges:
    br0:
      interfaces:
        - eno1
        - enp2s0
      addresses:
        - 172.16.0.1/16
```

根据[netplan(5)](https://manpages.ubuntu.com/manpages/jammy/man5/netplan.5.html)，netplan 会根据自己的配置 yaml 在`/run/systemd/network`下生成.network 和 .netdev 文件用于给 netword 提供网络配置。

```txt
       During early boot, the netplan “network renderer” runs which reads
       /{lib,etc,run}/netplan/*.yaml and writes configuration to /run  to  hand  off  control  of
       devices to the specified networking daemon.
```

生成的文件在这里：

```sh
ls /run/systemd/network/
10-netplan-br0.netdev   10-netplan-eno1.link
```

netplan 还不支持设置 dhcp server，要在 br0 上开启 dhcp server 要手动配置 .network

根据[systemd.network(5)](https://manpages.ubuntu.com/manpages/jammy/man5/systemd.network.5.html)中说明，可以通过使用 drop-in 目录的方式对已有的 network 文件进行补充配置而不会对原有 network 配置产生影响。

```txt
Along with the network file foo.network, a "drop-in" directory foo.network.d/ may exist.
All files with the suffix ".conf" from this directory will be merged in the alphanumeric
order and parsed after the main file itself has been parsed. This is useful to alter or
add configuration settings, without having to modify the main configuration file. Each
drop-in file must have appropriate section headers.

In addition to /etc/systemd/network, drop-in ".d" directories can be placed in
/lib/systemd/network or /run/systemd/network directories. Drop-in files in /etc/ take
precedence over those in /run/ which in turn take precedence over those in /lib/. Drop-in
files under any of these directories take precedence over the main network file wherever
located.
```

为了对这个配置进行 patch ，创建 drop in 配置文件 `/etc/systemd/network/10-netplan-br0.network.d/09-user-br0.conf` ：

```toml
[Match]
Name=br0

[Network]
DHCPServer=yes # 开启 dhcp 4 服务器
```

> 更多支持的详细配置可以看 [systemd.network.5](https://manpages.ubuntu.com/manpages/jammy/man5/systemd.network.5.html)

## IPv6 Lan Setup

在 LAN 网络中，我们也可以增加对 ipv6 的支持，让内网设备也能获取到独立的 ipv6 地址，享受 ipv6 冲浪。也就是在上述配置中配置：

```toml
[Network]
IPv6SendRA=yes # 开启 dhcp 6 RA
DHCPv6PrefixDelegation=yes # 支持 ipv6 前缀代理, 即将运营商发给的 ipv6 前缀代理到内网
```

需要注意的是，在默认的以太网中，所有节点的 MTU 都是默认值 1500，在 PPPoe 的链路下，MTU 最大为 1492。

在 IPv4 中，如果节点向路由器发送了超过路由器上级 MTU 的 IP 包，路由器会进行分片传输；

在 IPv6 中，中间路由器不对超过 MTU 的数据包进行分片传输，仅进行转发，IP 分片仅发生在端到端，这意味着终端 MTU 必须设置为 PMTU(Path MTU)。

> ipv6 这一方式使路由转发更为单纯，分片这种事，交给传输层就可以了，IP层使用简单的硬件转发就足够了。

要想所有内网的设备都能够正常使用 IPv6，需要将所有设备都设置上正确的 MTU，在 Linux base 的设备上，仅需要设置 dhcp 的 option 26 即可。
设备会根据 dhcp 中的 mtu 自动调整网卡 MTU；还有一种方式为，在 IPv6 Router Advertise 中设置 MTU Option. 但是如果终端设备不能正确的自动配置 MTU，那就需要手动设置了。

MAC OS 就是一个例外，虽然设置了 MTU 自动配置，但是依旧不能自动配置 MTU，具体细节还没有深入了解，只能先手动设置 MTU。

在配置内网 ipv6 的途中，非常艰辛，也在 networkd 上踩坑了很多，不得已要对 systemd 进行修改才能满足需求：

- dhcp server 在使用 `UplinkInterface=:auto` 时(默认值)，如果 br0 在 ppp 前配置完成，则此时的推断出来的 uplink 为空，内网设备无法获取到 dns 。虽然可以配置静态 dns 或者在 ppp 配置完成后执行 `networkctl reconfigure br0` 解决这个问题，但我还是想动态使用运营商的配置(程序狗的坚持)。在[networkd-dhcp-server.c#L109-L111](https://github.com/cnfatal/systemd/blob/9851b9ac349ca66ae26911ae20c425163fc26d54/src/network/networkd-dhcp-server.c#L109-L111)中被修复.
- 在自动推断 uplink 时，ppp 生成的默认路由 `default dev ppp-telecom scope link` 不满足 netwotkd 推断条件 [networkd-route.c#L803-L831](https://github.com/cnfatal/systemd/blob/9851b9ac349ca66ae26911ae20c425163fc26d54/src/network/networkd-route.c#L803-L831) 中的 link global 和 gateway 地址不为空的条件，导致无法推断出正确的 uplink。不过这个问题应当由 ppp 来改善。
- ipv6 prefix delegation 时，rdnss 不能被代理，导致内网 RA 不能通告 dns 服务器，只能使用 ipv4 dns 解析。在[networkd-ndisc.c#L1057-L1065](https://github.com/cnfatal/systemd/blob/9851b9ac349ca66ae26911ae20c425163fc26d54/src/network/networkd-ndisc.c#L1057-L1065) 中被修复。

如果有需要的同学，可以编译我的 fork [systemd](https://github.com/cnfatal/systemd.git) .

## nat setup

IPv6 直接开启 ip forward 内网正常上网；
对于 IPv4 来说，现在已经能够内网有线设备接入并能获取到内部 IP 地址，但是目前还不能上网。
需要配置 nat 规则，将从从 br0 的访问外网的流量通过 NAT MASQURADE 后发往 wan 才能上网。
一般可以使用 iptables 进行规则配置，但 ubuntu 默认使用来 ufw 作为防火墙，而非 iptables service，也支持 iptables 的设置，操作更简洁并且支持持久化。

在现代内核中，iptables 命令实际上已经切换为了 nftables,为了过渡到需要这样的适配。更多: [netfilter](https://www.netfilter.org/)

我们可以使用 ufw 进行配置,参考 ufw 配置[ufw(8)](https://manpages.ubuntu.com/manpages/jammy/man8/ufw.8.html)。
启用 ufw 防火墙，作为一台运行在公网上的服务器， 必须有防火墙，以防止各种恶意攻击(也不能防住所有)。

```sh
sudo ufw enable
```

设置转发：

如果要使用路由规则和策略，必须先设置 IP 转发，ufw 支持设置内核配置 sysctl 。
一般情况下，开启 IP 转发的内核配置会配置到 `/etc/sysctl.d/`下面，既然 ufw 支持设置，自然可以配置到 `/etc/ufw/sysctl.conf` 中。

```txt
In addition to routing rules and policy, you must also setup IP forwarding.  This  may  be
done by setting the following in /etc/ufw/sysctl.conf:

    net/ipv4/ip_forward=1
    net/ipv6/conf/default/forwarding=1
    net/ipv6/conf/all/forwarding=1
```

对使用 ufw 配置 NAT，在[ufw-framework(8)](https://manpages.ubuntu.com/manpages/jammy/en/man8/ufw-framework.8.html)中 example 节有配置示例。

```sh
   IP Masquerading
    To  allow  IP  masquerading for computers from the 10.0.0.0/8 network on eth1 to share the
    single IP address on eth0:

    Edit /etc/ufw/sysctl.conf to have:
            net.ipv4.ip_forward=1

    Add to the end of /etc/ufw/before.rules, after the *filter section:
            *nat
            :POSTROUTING ACCEPT [0:0]
            -A POSTROUTING -s 10.0.0.0/8 -o eth0 -j MASQUERADE
            COMMIT

    If your firewall is using IPv6 tunnels or 6to4 and is also doing NAT, then you should  not
    usually  masquerade  protocol  '41'  (ipv6)  packets.  For  example, instead of the above,
    /etc/ufw/before.rules can be adjusted to have:
            *nat
            :POSTROUTING ACCEPT [0:0]
            -A POSTROUTING -s 10.0.0.0/8 ! --protocol 41 -o eth0 -j MASQUERADE
            COMMIT

    Add the ufw route to allow the traffic:
            ufw route allow in on eth1 out on eth0 from 10.0.0.0/8
```

按照 ufw 的说法，ufw 仅修改 filter 表，而有关 NAT 的操作需要设置 nat 表就只能手动设置。

```txt
    Important: ufw only uses the *filter table by default. You may add any other  tables  such
    as  *nat,  *raw and *mangle as desired. For each table a corresponding COMMIT statement is
    required.
```

ufw 还包含了 iptables 的备份和恢复:

```txt
    ufw  is  in  part  a  front-end  for   iptables-restore,   with   its   rules   saved   in
    /etc/ufw/before.rules,  /etc/ufw/after.rules  and  /etc/ufw/user.rules. Administrators can
    customize before.rules and after.rules as  desired  using  the  standard  iptables-restore
    syntax.  Rules  are  evaluated  as  follows:  before.rules  first,  user.rules  next,  and
    after.rules last. IPv6 rules are evaluated in the same way, with  the  rules  files  named
    before6.rules,  user6.rules and after6.rules. Please note that ufw status only shows rules
    added with ufw and not the rules found in the /etc/ufw rules files.
```

开始配置 NAT，在 `/etc/ufw/before.rules` 文件末尾增加下列内容

```txt
*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -s 172.16.0.0/16 -o ppp-telecom -j MASQUERADE
COMMIT
```

```sh
sudo ufw reload
```

对于 ufw，默认的策略是不允许 `incoming` 和 `routed`，对应 iptables filter 表策略为 `INPUT DROP` 和 `FORWARD DROP`。

```sh
$ sudo ufw status verbose
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), deny (routed)
$ sudo iptables -t filter -S
-P INPUT DROP
-P FORWARD DROP
-P OUTPUT ACCEPT
```

可以将默认策略 routed 更改为 allow 以运行流量转发，即允许 NAT 流量从 br0 转发至 eno1 从而实现外网上网。

```sh
sudo ufw default allow routed
```

或者使用更严格的控制规则而非更改默认策略

```sh
sudo ufw route allow in from 172.16.0.0/16 on br0 out on ppp-telecom
```

此外，由于默认策略`INPUT DROP`，进入 br0 的数据包也会被拦截，所以需要允许数据包进入 br0。

**这里不能或者不建议将`incoming`策略设置为`allow`，这样会将你的电脑完全暴露在公网中。**

```sh
sudo ufw allow in on br0 from 172.16.0.0/16 to any
```

除此之外，ufw 和 iptables 能够根据不同的规则实现诸如 “内网隔离” “流量限制” “禁止上网” 流量审计” 等高级功能。

## wlan setup

有线已经设置完成，开始设置无线。netplan 支持 NetworkManager 为 provider 的 ap station 模式。
但目前 systemd-network 不支持。所以无法使用 netplan 配置。

```txt
Note that systemd-networkd does not natively support wifi, so you need [wpasupplicant](https://w1.fi/wpa_supplicant/) installed if you let the networkd renderer handle wifi.
```

这里选择 [hostapd](https://w1.fi/hostapd/) 来配置无线，也可以选择 create_ap 以及其他的工具。

安装 hostapd

```sh
sudo apt install hostapd
```

hostapd 会在 `/etc/default/hostapd` 生成文件,`/etc/default`是一个约定的目录，用于软件安装后的默认配置。

```sh
$ cat /etc/default/hostapd
# Defaults for hostapd initscript
#
# WARNING: The DAEMON_CONF setting has been deprecated and will be removed
#          in future package releases.
#
# See /usr/share/doc/hostapd/README.Debian for information about alternative
# methods of managing hostapd.
#
# Uncomment and set DAEMON_CONF to the absolute path of a hostapd configuration
# file and hostapd will be started during system boot. An example configuration
# file can be found at /usr/share/doc/hostapd/examples/hostapd.conf.gz
#
#DAEMON_CONF=""

# Additional daemon options to be appended to hostapd command:-
#  -d   show more debug messages (-dd for even more)
#  -K   include key data in debug messages
#  -t   include timestamps in some debug messages
#
# Note that -B (daemon mode) and -P (pidfile) options are automatically
# configured by the init.d script and must not be added to DAEMON_OPTS.
#
#DAEMON_OPTS=""
```

> 可以不用对`#DAEMON_CONF=""`取消注释，hostapd 使用默认配置文件在路径`/etc/hostapd/hostapd.cond`下

根据`/usr/share/doc/hostapd/README.Debian`的内容

```sh
An example hostapd.conf may be used as a template but _must_ be edited
to suit your local configuration. An example is located at:
  /usr/share/doc/hostapd/examples/hostapd.conf.gz

To use the example as a template:
  # zcat /usr/share/doc/hostapd/examples/hostapd.conf.gz > \
   /etc/hostapd/hostapd.conf
  # $EDITOR /etc/hostapd/hostapd.conf

If you're running systemd, you need to unmask the hostapd unit by running:

    systemctl unmask hostapd
```

在`/usr/share/doc/hostapd/examples/`下能够找到一些配置文件示例。

```sh
$ ll /usr/share/doc/hostapd/examples/
total 136
drwxr-xr-x 1 root root    182 Apr 21 07:31 ./
drwxr-xr-x 1 root root    206 Apr 21 07:31 ../
-rw-r--r-- 1 root root    276 Aug  7  2019 hostapd.accept
-rw-r--r-- 1 root root 113611 Aug  7  2019 hostapd.conf
-rw-r--r-- 1 root root    144 Aug  7  2019 hostapd.deny
-rw-r--r-- 1 root root   4368 Aug  7  2019 hostapd.eap_user
-rw-r--r-- 1 root root    142 Aug  7  2019 hostapd.radius_clients
-rw-r--r-- 1 root root    834 Aug  7  2019 hostapd.wpa_psk
```

将配置文件复制一份至作为默认配置。

```sh
sudo cp /usr/share/doc/hostapd/examples/hostapd.conf /etc/hostapd/hostapd.conf
```

然后根据当前情况进行编辑，hostapd.conf 文件中包含了大部分的可配置项目和示例，可以阅读相关的内容进行配置，这里仅做最简单的配置。

```conf
interface=wlp3s0
bridge=br0
driver=nl80211
ssid=test
hw_mode=g
channel=11
```

开启 hostapd 的 systemd

```sh
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl start hostapd
```

至此，可以搜索到一个开发的 wifi ssid 为 test ，一般情况下连上去如果能够正常获取到 IP 地址并且可以使用外网。

关于设置 wpa/wpa2 热点加密，自行查看`hostapd.conf`剩下的内容，根据提示进行设置，这里不给出示例。

额外的，所使用的无线硬件设备是一个双频段的`Intel Corporation Dual Band Wireless-AC 3168NGW`，但是由于 intel 的 LAR 策略，无法在 5GHz 下开启热点，仅能连接热点，暂时没有很好的解决办法，暂时使用 2.4G 频段进行设置。

```sh
$ lspci
...
03:00.0 Network controller: Intel Corporation Dual Band Wireless-AC 3168NGW [Stone Peak] (rev 10)
$ iw list
Wiphy phy0
...
Frequencies:
   * 5180 MHz [36] (22.0 dBm) (no IR)
   * 5200 MHz [40] (22.0 dBm) (no IR)
   * 5220 MHz [44] (22.0 dBm) (no IR)
   * 5240 MHz [48] (22.0 dBm) (no IR)
   * 5260 MHz [52] (22.0 dBm) (no IR, radar detection)
   * 5280 MHz [56] (22.0 dBm) (no IR, radar detection)
   * 5300 MHz [60] (22.0 dBm) (no IR, radar detection)
   * 5320 MHz [64] (22.0 dBm) (no IR, radar detection)
   * 5500 MHz [100] (22.0 dBm) (no IR, radar detection)
   * 5520 MHz [104] (22.0 dBm) (no IR, radar detection)
   * 5540 MHz [108] (22.0 dBm) (no IR, radar detection)
   * 5560 MHz [112] (22.0 dBm) (no IR, radar detection)
   * 5580 MHz [116] (22.0 dBm) (no IR, radar detection)
   * 5600 MHz [120] (22.0 dBm) (no IR, radar detection)
   * 5620 MHz [124] (22.0 dBm) (no IR, radar detection)
   * 5640 MHz [128] (22.0 dBm) (no IR, radar detection)
   * 5660 MHz [132] (22.0 dBm) (no IR, radar detection)
   * 5680 MHz [136] (22.0 dBm) (no IR, radar detection)
   * 5700 MHz [140] (22.0 dBm) (no IR, radar detection)
   * 5720 MHz [144] (22.0 dBm) (no IR, radar detection)
   * 5745 MHz [149] (22.0 dBm) (no IR)
   * 5765 MHz [153] (22.0 dBm) (no IR)
   * 5785 MHz [157] (22.0 dBm) (no IR)
   * 5805 MHz [161] (22.0 dBm) (no IR)
   * 5825 MHz [165] (22.0 dBm) (no IR)
...
```

`no IR`是 "no initiate radiation" 不要引发辐射, 当 “no IR” 和 “radar detection” 同时出现时，意味着无线网卡仅能在 DFS 下使用。

LAR = Location Aware Regulatory
DRS = Dynamic Regulatory Solution

Dynamic Frequency Selection (DFS) 动态频率选择（DFS）是一项 可使 WLAN 使用通常为雷达保留的 5 GHz 频率的功能。

更多信息参考[crda(8)](https://linux.die.net/man/8/crda)

## iptv setiup

后续更新
