---
title: 基于 ubuntu 配置家庭网关(软路由)
tags: [软路由, linux, ubuntu, 网关]
---

最近想设置一个自己的服务器,一方面合理利用现有宽带的公网 IP 资源，可以在服务器上运行一些常规的服务，一方面能够替换掉 TPlink 路由器实现更灵活的网关功能。

遂规划搭建一个软路由。

## 规划

当前服务器有两个有线网卡，`eno1` 和 `enp2s0`，一个 wifi 网卡 `wlp3s0`。

将 eno1 作为 WAN 口进行 pppoe 与服务商连接，enp2s0 作为有线 LAN 口对内网提供服务。wlp3s0 提供 2.4G/5G wifi 作为 WLAN 使用。

```sh
$ ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
2: enp2s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 70:85:c2:a9:d5:02 brd ff:ff:ff:ff:ff:ff
    inet6 fe80::7285:c2ff:fea9:d502/64 scope link
       valid_lft forever preferred_lft forever
3: eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 70:85:c2:a9:d5:00 brd ff:ff:ff:ff:ff:ff
    inet6 fe80::7285:c2ff:fea9:d500/64 scope link
       valid_lft forever preferred_lft forever
4: wlp3s0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
    link/ether 3c:6a:a7:a0:d6:10 brd ff:ff:ff:ff:ff:ff
```

## netplan setup

ubuntu server 默认使用 systemd-network 配合 netplan 进行网络管理。自身非常精简，仅提供了常用的功能。

此外 cloud-init 也是使用的 netplan 的配置格式进行配置的，所以先研究了一下 netplan 相关。

先看官方文档:[netplan reference](https://netplan.io/reference)

还可以看示例配置:[netplan examples](https://netplan.io/examples)

```yaml
#/etc/netplan/interfaces.yaml
network:
  version: 2
  ethernets:
    enp2s0:
      dhcp4: true
    eno1:
      dhcp4: true
```

## pppoe setup

netplan 不支持设置 pppoe，因其后端 networkd 也不支持设置 pppoe 。
参见[add pppoe support to systemd-networkd·Issue481](https://github.com/systemd/systemd/issues/481)，因 networkd 认为 pppoe 作为"老旧"的技术，且不再云环境中常用，所以在其路标上不计划该特性。（我觉得有道理，能够坚持在 cloud 方向做好）

转而使用 ppp 进行 pppoe 配置。安装 ppp

```sh
sudo apt-get install ppp
```

推荐查看官方文档: [PPP github](https://github.com/paulusmack/ppp)或者[gitweb on ozlabs.org](http://git.ozlabs.org/?p=ppp.git;a=summary)或者 `man pppd` 以了解如何使用。其中官方文档对 pppoe 提供了详细说明 [README.pppoe](https://github.com/paulusmack/ppp/blob/master/README.pppoe)

编写 pppoe config `/etc/ppp/peers/eno1`

```conf
plugin rp-pppoe.so nic-eno1
ifname ppp0
user "CDXXXXXXXX"
noipdefault
usepeerdns
defaultroute
persist
noauth
+ipv6 ipv6cp-use-ipaddr
```

配置 pap-secrets `/etc/ppp/pap-secrets`,为了某种安全考虑，ppp 将密码文件与配置文件分开存放，使用时会根据配置中的 `username` 在 secrets 中寻找对应的密码进行使用。

```sh
sudo sh -c 'echo "CDXXXXXXXX * XXXXXXXX" >> /etc/ppp/pap-secrets'
```

启动 pppoe：

```sh
sudo pon eno1
```

至此 pppoe 成功连接。

> pon 命令由 ppp 提供，其本质是一个 shell script 实现对 ppp 的操作封装，感兴趣的可以 `cat $(which pon)`看一下内容

但 ppp 没有提供自动连接的方式，需要手动调用 pon 命令来进行连接。
有两个方式可以完成自动拨号连接，一种是将 pon 等命令写为一个 service，在`systemd-network`启动后启动，进行拨号连接。
一种是借助 `network-dispatcher` 的 hook，该组件是类似于 ifupdown 的 hook，也提供了存放 hook 脚本的地方。

这里采用第二种方式，在 `/etc/networkd-dispatcher/carrier.d` 中编写脚本，在 eno1 端口有负载时进行 pppoe 连接，carrier hook 是在接入网线时被调用。

详细用法推荐查看官方文档: [networkd-dispatcher](https://gitlab.com/craftyguy/networkd-dispatcher)

编写 hook script `/etc/networkd-dispatcher/carrier.d/setup-pppoe.sh` 。

```sh
#!/bin/env sh

# interface to pppoe workload
INTERFACE=eno1

if [ "${IFACE}" = "${INTERFACE}" ] ; then
    echo "running pon ${INTERFACE}..."
    pon ${INTERFACE}
fi
```

之后插入网线 pppoe 会自动执行，断线后也会重连。

## ddns setup

pppoe 由于是家用的，每次获取到的公网地址随机，因此需要使用 ddns 来动态解析以获取 IP 地址。以后服务器的服务可以基于该 dns 进行使用。

ddns 使用的是多年前的 dnspod 服务（现已经被腾讯云收购,不过还可以正常使用），[Dnspod API 文档](https://www.dnspod.cn/docs/index.html)

同样的，使用到了 `networkd-dispatcher` hook 的方式来设置 ddns，每次 pppoe 完成后调用 ddns 脚本。

创建 hook script `/etc/networkd-dispatcher/routable.d/setup-ddns.sh`，可在我的 github 上[etc/openwrt](https://github.com/fatalc/etc/tree/master/openwrt)查看该 script 内容。

除此之外也可以将该脚本放置在 `/etc/ppp/up.d/` 这个 hook 点下面，一旦 ppp 成功也该脚本。

## gateway setup

回到计划， `enp2s0` 作为有线 LAN 口对内网提供服务。`wlp3s0` 提供 2.4G/5G wifi 作为 WLAN 使用。

为了让有线和无线都在一个网络中，需要一个网桥将两个网卡连接在一起，这样网桥内的设备均在一个二层网络内。

创建一个网桥 br0，将 enp2s0，wlp3s0 都桥接至网卡 ，对于这类的网络配置都可以使用 netplan 来进行配置。
这选择内网网段使用了 `172.16.0.0/16` 网关设置为 `172.16.0.1`。

```yaml
network:
  version: 2
  ethernets:
    eno1:
      dhcp4: true
    enp2s0: {}
    wlp3s0: {}
  bridges:
    br0:
      addresses:
        - 172.16.0.1/16
```

## dns server setup

上述完成后，接入网口 `enp2s0` 的设备能够访问到网关，所有流量都可进入网关。但对于家庭设备来说，还缺少一个 dhcp server 用来分配 IP 地址。

dhcp 服务器可以使用：

1. [systemd-networkd.service(8)](https://man7.org/linux/man-pages/man8/systemd-networkd.service.8.html) 提供的 dhcpserver 功能，因其是 ubuntu 预置软件无需额外安装。
1. [isc-dhcp-server](https://www.isc.org/dhcp/),也称为 [dhcpd(8)](https://linux.die.net/man/8/dhcpd)。

处于简洁考虑，使用预置 systemd-networkd 作为 dhcpserver，但是 netplan 并未提供 dhcpserver 的支持，得考虑直接配置 networkd。

根据[netplan(5)](http://manpages.ubuntu.com/manpages/cosmic/man5/netplan.5.html)，知道 netplan 会根据自己的配置 yaml 在`/run/systemd/network`下生成.network 和 .netdev 文件用于给 netword 提供网络配置。

```txt
       During early boot, the netplan “network renderer” runs which reads
       /{lib,etc,run}/netplan/*.yaml and writes configuration to /run  to  hand  off  control  of
       devices to the specified networking daemon.
```

根据[systemd.network(5)](https://man7.org/linux/man-pages/man5/systemd.network.5.html)中说明，可以通过使用 drop-in 目录的方式对已有的 network 文件进行补充配置而不会对主 network 配置产生影响。

```txt
       Along with the network file foo.network, a "drop-in" directory
       foo.network.d/ may exist. All files with the suffix ".conf" from
       this directory will be parsed after the file itself is parsed.
       This is useful to alter or add configuration settings, without
       having to modify the main configuration file. Each drop-in file
       must have appropriate section headers.

       In addition to /etc/systemd/network, drop-in ".d" directories can
       be placed in /usr/lib/systemd/network or /run/systemd/network
       directories. Drop-in files in /etc/ take precedence over those in
       /run/ which in turn take precedence over those in /usr/lib/.
       Drop-in files under any of these directories take precedence over
       the main network file wherever located.
```

可以自行查找`/run/systemd/network`下的配置并在`/etc/systemd/network`下配置同名的 drop in 配置进行扩展。

> 试过直接在 `/etc/systemd/network` 下配置 .network 文件，会覆盖 netplan 中生成的配置。所以只能使用 drop-in 方式配置。

`/etc/systemd/network/10-netplan-br0.network.d/09-user-br0.conf`

```conf
[Match]
Name=br0

[Network]
DHCPServer=yes

[DHCPServer]
```

## nat setup

现在已经能够内网有线设备接入并能获取到内部 IP 地址，但是目前还不能上网。

配置 nat 规则，将从从 br0 的访问外网的流量通过 NAT MASQURADE 伪装后通过 eno1 路由转发出去。

一般可以使用 iptables 进行规则配置，但 ubuntu 默认使用来 ufw 作为防火墙，而非 iptables service，也支持 iptables 的设置，操作更简洁并且支持持久化。

我们可以使用 ufw 进行配置,参考 ufw 配置[ufw(8)](http://manpages.ubuntu.com/manpages/groovy/man8/ufw.8.html)。

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

对使用 ufw 配置 NAT，在[ufw-framework(8)](http://manpages.ubuntu.com/manpages/groovy/man8/ufw-framework.8.html)中 example 节有配置示例。

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
-A POSTROUTING -s 172.16.0.0/16 -o enp2s0 -j MASQUERADE
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
sudo ufw route allow  in from 172.16.0.0/16 on br0 out on eno1
```

此外，由于默认策略`INPUT DROP`，进入 br0 的数据包也会被拦截，所以需要允许数据包进入 br0。

**这里不能或者不建议将`incoming`策略设置为`allow`，这样会将你的电脑完全暴露在公网中。**

```sh
sudo ufw allow in on br0 from 172.16.0.0/16 to any
```

除此之外，ufw 和 iptables 能够根据不同的规则实现诸如 “内网隔离” “流量限制” “禁止上网” 流量审计” 等高级功能。

## wlan setup

有线已经设置完成，开始设置无线。netplan 支持 NetworkManager 为 provider 的 ap 模式。但目前为 systemd-network，不支持设置 ap。

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

在`/usr/share/doc/hostapd/examples/`下能够找到一些配置文件示例，已经被解压，而非 `/usr/share/doc/hostapd/examples/hostapd.conf.gz`。

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
