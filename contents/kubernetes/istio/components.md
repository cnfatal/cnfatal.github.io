# 组件

![arch](https://istio.io/latest/zh/docs/ops/deployment/architecture/arch.svg)

> [architecture](https://istio.io/latest/docs/ops/deployment/architecture/)

istio 简单理解可以分为两个部件

- proxy(envoy)，用于数据平面。以 sidecar 方式部署。这些代理负责协调和控制微服务之间的所有网络通信。它们还收集和报告所有网格流量的监测数据。
- istiod，用于控制平面。其提供了服务发现、配置和证书管理功能。

通俗的来说，istiod 从多个 envoy sidecar 获取数据并进行聚合，并更新不同 envoy 的配置，使之配合以实现 mesh 功能。

envoy 以 sidecar 模式运行与每个 mesh pod 内，通过更改 iptables 规则拦截流量，通过 istiod 下发的配置将流量代理并发送到合适的地方。

在代理 pod 流量的过程中还会做一些监控，取样，熔断，路由等操作。

## proxy(envoy)

istio proxy 对 envoy 做了扩展。其功能可以认为与 envoy 相同。

要完整的了解 istio 我们必须要对其核心 envoy 进行认识：

envoy 有以下几个部分：

LDS: listener discovery service (监听器发现服务)

<https://www.envoyproxy.io/docs/envoy/latest/configuration/listeners/lds>

RDS: router discovery service (路由发现服务)

<https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_conn_man/rds>

EDS: endpoint discovery service(端点发现服务)

## istiod

istiod 由下列子组件组成：

- Pilot 负责在运行时配置代理(envoy) - Responsible for configuring the proxies at runtime.
- Citadel 负责证书签发和轮转.
- Galley 负责验证、提取、聚合、转换和分发 istio 内配置.
