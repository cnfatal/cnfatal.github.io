# openelb

[openelb](https://github.com/kubesphere/openelb)

oepnelb 是 qingcloud 开源的 loadbalancer 方案。
与 metallb 相同，支持 arp 和 bgp 两种方式。也均支持 ECMP 等价路由进行负载均衡。

- openelb arp 方式的核心实现直接使用了 metallb 中的源码。
- 在 BGP 实现上有不同，openelb 没有自己实现 BGP 协议，而是使用了 GoBGP 库实现。
- openelb 在配置上更云原生，使用了 CRD 方式。

更多的对比：openelb 官方也有描述：
[compared_with_metallb](https://github.com/kubesphere/openelb/blob/master/doc/zh/compared_with_metallb.md)
