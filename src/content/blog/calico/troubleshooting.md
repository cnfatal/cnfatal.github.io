---
published: '2022-04-22'
updated: '2026-10-20'
tags: ['container']
---

# calico 问题排查

Calico 的故障大多落在同一组位置上：组件没起来、BGP 没建立、路由没同步、数据面规则不对、策略挡住了。下面这套顺序基本是官方诊断文档的简化版，从下往上排，每一步都能排除掉一类问题。

> 本文以官方推荐的部署方式为准：Tigera Operator，组件运行在 `calico-system` 命名空间。下面的命令、命名空间和组件名称都按这个模式写，其他安装方式请先确认对应的组件和命名空间再套用。

## 1. 先确认故障范围

动手看组件之前，先用四个维度把问题框住：

| 场景 | 通了说明什么 |
|---|---|
| 同节点 Pod ↔ Pod | CNI 插件、veth、iptables 基本正常 |
| 跨节点 Pod ↔ Pod | BGP / 路由 / 隧道正常 |
| Pod ↔ 外网 | IPPool 的 `natOutgoing`、节点出网正常 |
| 节点 ↔ 节点 | 底层网络和 179 端口正常 |

官方文档里有一句很好用的判断：**同节点通、出网通、跨节点不通，基本可以锁定 BGP 配置问题**。

## 2. 组件是否健康

```sh
kubectl get nodes
kubectl get pods -n calico-system -o wide
kubectl get tigerastatus          # operator 安装时看整体状态
```

`calico-node` 是 DaemonSet，每个节点都应该有一个 `1/1 Running` 的实例。哪个节点上没有，问题就在那个节点。

看日志：

```sh
kubectl logs -n calico-system <calico-node-pod> -c calico-node
kubectl logs -n calico-system <calico-node-pod> -c calico-node --previous   # 容器重启过
```

需要更详细的日志时，调高 `LogSeverityScreen`（对应 `calico-node` 的环境变量），默认是 `Info`。

各组件职责对照，方便判断该看谁的日志：

| 组件 | 职责 |
|---|---|
| Felix | 编程路由和 iptables 规则、执行网络策略、上报端点状态 |
| BIRD | 跑 BGP，和对端节点交换路由 |
| confd | 监听 datastore 变化，生成 BIRD / Felix 的配置文件 |
| Typha | 缓存 datastore 数据，减少 Felix 对 API Server 的压力 |
| kube-controllers | 同步 Kubernetes 资源（Node、NetworkPolicy、Service 等） |

## 3. BGP 会话

```sh
sudo calicoctl node status
```

正常时每个对端都应该是 `Established`：

```text
Calico process is running.

IPv4 BGP status
+---------------+---------------+-------+----------+-------------+
| PEER ADDRESS  |   PEER TYPE   | STATE |  SINCE   |    INFO     |
+---------------+---------------+-------+----------+-------------+
| 192.168.1.242 | node-to-node  | up    | 09:04:39 | Established |
| 192.168.1.243 | node-to-node  | up    | 09:04:40 | Established |
+---------------+---------------+-------+----------+-------------+
```

注意两点：

- 列表里**不包含自身**，只列对端
- 上面的 `PEER TYPE` 在旧版本里显示为 `node-to-node mesh`

如果这里是 `Active` / `Connect`，按顺序查：

1. 两台主机能不能互相 `ping` 通
2. 防火墙是否放行 **TCP 179**
3. 是否有已经下线但 Node 资源还在的节点（会一直重试连接）
4. `calico-node` 是否因为 BGP 未建立而处于 NotReady：

```text
Error: calico/node is not ready: BIRD is not ready: BGP not established with 10.0.0.1
```

这个报错在官方文档里的解释就是「某个 peer 不可达」，要么网络不通，要么有残留节点没清理。

新版本也可以直接用 `CalicoNodeStatus` 资源看 BGP 状态，不必登录每台机器。

## 4. 节点路由

BGP 建立之后，对端的 Pod 网段应该以 `proto bird` 的形式出现在本机路由表里：

```sh
$ ip route
default via 192.168.1.1 dev eth0 proto static
172.16.32.192/26 via 192.168.1.249 dev eth0 proto bird
172.16.37.128/26 via 192.168.1.243 dev eth0 proto bird
172.16.152.64/26 via 192.168.1.248 dev eth0 proto bird
```

`ip r | grep bird` 是更快的过滤方式。使用 IPIP / VXLAN 时，下一跳的出口设备会是 `tunl0` / `vxlan.calico`：

```text
192.168.66.128/26 via 10.0.0.12 dev tunl0 proto bird onlink
```

如果没有这些路由，先看 BIRD 自己的路由表（能确认是没学到，还是学到了没下发）：

```sh
kubectl exec -it -n calico-system <calico-node-pod> -- birdcl show route
```

再看 IPPool 的封装模式是否和预期一致：

```sh
kubectl get ippools default-ipv4-ippool -o yaml
# 关注 ipipMode / vxlanMode
```

跨网段时如果两者都是 `Never`，而底层网络又不知道 Pod 网段怎么走，跨节点必然不通——这种情况要么加路由，要么改成 `CrossSubnet`。

## 5. CNI 配置和 IPAM

Pod 起不来、卡在 `ContainerCreating`，先看节点上的 CNI 配置：

```sh
cat /etc/cni/net.d/10-calico.conflist
```

IPAM 相关的异常通常在 `calico-node` 日志里，也可以直接看分配情况：

```sh
calicoctl ipam show
calicoctl get ippools -o wide
```

`calicoctl version` 的输出要和集群里运行的版本一致，版本不匹配时 `calicoctl` 的很多查询结果不可信。

## 6. 数据面

确认路由没问题，但包还是丢，就在数据面看：

```sh
sudo iptables-save | grep -i cali
sudo conntrack -L | grep <pod-ip>
sudo tcpdump -i cali<xxxxxxxx> icmp
```

常见的两类非 Calico 自身问题：

- **conntrack 表满**：表现为 iptables 性能骤降，连接随机失败。加大表容量：
  ```sh
  sysctl -w net.netfilter.nf_conntrack_max=1000000
  ```
- **NetworkManager 干扰**：它会操作 `cali*`、`tunl*`、`vxlan.calico` 这些接口的路由。按官方建议加一个配置文件：
  ```conf
  # /etc/NetworkManager/conf.d/calico.conf
  [keyfile]
  unmanaged-devices=interface-name:cali*;interface-name:tunl*;interface-name:vxlan.calico;interface-name:vxlan-v6.calico;interface-name:wireguard.cali;interface-name:wg-v6.cali
  ```

## 7. 网络策略

Calico 的策略最终也会落到 iptables，所以「策略挡住」和「网络不通」在现象上很难区分。先看有哪些策略：

```sh
kubectl get networkpolicy --all-namespaces
calicoctl get networkpolicy --all-namespaces -o wide
calicoctl get globalnetworkpolicy -o wide
```

`-o wide` 会显示 `ORDER` 和 `SELECTOR`，重点看两件事：

- selector 是否真的选中了出问题的 Pod
- order 是否被更高优先级的 deny 策略拦截

临时验证可以用一个 allow-all 策略（**只在测试环境**）：

```sh
$ calicoctl get globalNetworkPolicy -oyaml
apiVersion: projectcalico.org/v3
items:
- apiVersion: projectcalico.org/v3
  kind: GlobalNetworkPolicy
  metadata:
    name: allow-all
  spec:
    egress:
    - action: Allow
      destination: {}
      source: {}
    ingress:
    - action: Allow
      destination: {}
      source: {}
    selector: all()
    types:
    - Ingress
    - Egress
```

如果加上就通、删掉就不通，问题就定位到策略了。

如果怀疑是 Felix 生成的 iptables 规则本身残留，可以用官方脚本 [remove-calico-policy.sh](https://github.com/projectcalico/calico/blob/master/hack/remove-calico-policy/remove-calico-policy.sh) 清掉规则等它重建。这一步极少用——Calico 若真有配置问题，重建出来的规则还是错的。

## 8. 收集诊断包

走到这一步还没结论，就把现场打包：

```sh
sudo calicoctl node diags
```

它会收集路由、接口、iptables、netstat 等信息，输出一个 tar.gz。提 issue 或者找人帮忙时附上这个文件。

注意 `sudo` 默认不传递环境变量，`calicoctl` 依赖 `DATASTORE_TYPE`、`KUBECONFIG` 之类的变量时要加 `-E`：

```sh
sudo -E calicoctl node diags
```

## 案例：集群间 pod 不通

一次典型的跨节点不通，按上面的顺序走下来是这样：

1. `calicoctl node status` 发现对端不是 `Established`

   ```sh
   $ sudo calicoctl node status
   Calico process is running.

   IPv4 BGP status
   +---------------+-------------------+-------+----------+-------------+
   | PEER ADDRESS  |     PEER TYPE     | STATE |  SINCE   |    INFO     |
   +---------------+-------------------+-------+----------+-------------+
   | 192.168.1.242 | node-to-node mesh | up    | 09:04:39 | Established |
   | 192.168.1.243 | node-to-node mesh | up    | 09:04:40 | Established |
   | 192.168.1.244 | node-to-node mesh | up    | 09:04:49 | Established |
   | 192.168.1.248 | node-to-node mesh | up    | 09:05:21 | Established |
   | 192.168.1.249 | node-to-node mesh | up    | 09:04:48 | Established |
   +---------------+-------------------+-------+----------+-------------+

   INFO: BIRDv6 process: 'bird6' is not running.
   ```

2. 到状态异常的那台主机上看路由 `ip route`，缺少 `proto bird` 的条目，说明路由没同步过来

3. 确认该节点上的 `calico-node` Pod 正常，并进容器看 BIRD 自己的路由表（BIRD 在 `calico-node` 容器内运行）：

   ```sh
   kubectl get pods -n calico-system -o wide | grep <node-name>
   kubectl exec -it -n calico-system <calico-node-pod> -- birdcl show route
   ```

4. 检查主机防火墙，至少要放行 **179/tcp**，或临时停掉防火墙验证

5. 看 `calico-node` 日志里 Felix 的报错（Felix 负责把节点注册进集群、维护本机 iptables 规则）：

   ```sh
   kubectl logs -n calico-system <calico-node-pod> -c calico-node | grep -i felix
   ```

6. 检查网络策略是否误拦（见「网络策略」一节）

7. 以上都正常才考虑清理 iptables 规则重建

## 案例：pod 内部无法访问外网

1. 先确认是不是只有出网有问题——如果 Pod 之间也不通，按上一个案例的流程走

2. 检查 IPPool 是否开启 `natOutgoing: true`，它决定 Pod 流量出节点时是否做 SNAT：

   ```sh
   $ calicoctl get ipp newben-pool -oyaml
   apiVersion: projectcalico.org/v3
   kind: IPPool
   metadata:
     name: newben-pool
   spec:
     blockSize: 26
     cidr: 172.16.0.0/16
     ipipMode: Never
     natOutgoing: true
     nodeSelector: all()
     vxlanMode: Never
   ```

   未开启时导出修改再应用：

   ```sh
   calicoctl get ipp newben-pool -oyaml > ipp.yaml
   # 编辑 natOutgoing: true
   calicoctl apply -f ipp.yaml
   ```

   如果 apply 失败，可以尝试删除后重建（注意这会短暂影响该网段的新 Pod 分配）。

3. 检查容器和主机的 DNS 配置，`/etc/resolv.conf` 里的 nameserver 是否可达

## 参考

- [Troubleshooting and diagnostics](https://docs.tigera.io/calico/latest/operations/troubleshoot/troubleshooting)
- [Troubleshooting commands](https://docs.tigera.io/calico/latest/operations/troubleshoot/commands)
- [Component logs](https://docs.tigera.io/calico/latest/operations/troubleshoot/component-logs)
