# istio 容器云产品集成

## 摘要

将 istio 集成至容器云产品。使得容器云上的用户能够受益于 istio 提供的服务治理等特性。

## istio 部署

istio 需要在“添加集群”时一并安装。

需要往 install-operator 中增加 istio 安装。

⭐ 在 istio 安装中需要额外配置的：

- 开启 istio cni。
- 开启 istio dns proxy。
- 开启 链路追踪，需要配置链路追踪的服务器 jaeger tracing。
- 设置默认 istio gateway 并开启注入，设置注入模板为 gateway。
- 引入 grafana istio dashboard。ID 为： 7639 11829 7636 7630 7645。
- 配置 prometheus 采集 istio 注入的 pod metrics,引入 istio 相关 RecordRule。

## istio gateway 部署

虽然 istio gateway 可以通过 istio operator CR 完成增减。但这种方式不适合容器云。

在容器云中，需要将 istio gateway 与 “容器服务->运行时->网关”集成。

“添加网关”时创建 istio gateway 类型网关。

创建完成后后端控制器根据 CR 描述创建 gateway 部署和 Gateway 资源。

Gateway 资源由 “网关配置” 控制

## 启用 istio 注入

参考[Automatic Sidecar Injection](https://istio.io/latest/docs/ops/configuration/mesh/injection-concepts/)

在应用编排中能够控制应用是否启用 istio。istio 注入使用 annotation 完成，可以注解至 namespace,deployment，pod。

对于容器云，需要在应用编排中进行更改，以控制 istio 注入。提供两种方式：

- 对整个空间设置注入。需要在 “环境资源” 中设置该环境是否开启 istio 注入。针对 namespace 过滤是通过 k8s admission control 的 namespaceselector 实现。需要加在 label 上。

  ```yml
  metadata:
    labels:
      istio-injection: enabled
  ```

- 对 pods 注入。需要在 “应用编排” 中对 workload 增加 istio 注入开关。针对 pods 的注入是由 istio inject webhook 完成，加在 annotation 上。
  由于我们没有直接创建 pod，所以需要加在 podTemplate 上。

  ```yaml
  spec:
    template:
      metadata:
        annotations:
          sidecar.istio.io/inject: "true"
  ```

⭐ 上述操作中的第二项可以仅前端处理，第一项需要后端配合设置或者不增加该功能。

istio 还需要对 service 中的 port 以及 pod 中的 port 名称有约定,[requirements](https://istio.io/latest/docs/ops/deployment/requirements/)。

[conversion.go#L47](https://github.com/istio/istio/blob/release-1.11/pkg/config/kube/conversion.go#L47)

即需要保证 service 中的 port name 或者 appProtocol(k8s 1.18+ with ServiceAppProtocol gate) 设置为正确的协议名称。

> spec.ports[0].appProtocol: Forbidden: This field can be enabled with the ServiceAppProtocol feature gate

```yml
kind: Service
metadata:
  name: myservice
spec:
  ports:
    - number: 3306
      name: database
      appProtocol: mysql
    - number: 80
      name: http-web
      appProtocol: http
```

由于默认的 ServiceAppProtocol gate 处于 false 状态，我们使用 port.name 。

支持的名称参考：[protocol-selection](https://istio.io/latest/docs/ops/configuration/traffic-management/protocol-selection/)

⭐ 需要前端在编排 service 时，port name 设置为选择框。仅允许如下选项：

- http
- http2
- https
- tcp
- tls
- grpc
- grpc-web
- mongo
- mysql
- redis
- udp

## 灰度发布

灰度发布使用 istio 需要涉及 CR 有 `GateWay` `VirtualService` `DestinationRule`

一个示例：

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: bookinfo-gateway
spec:
  selector:
    istio: ingressgateway # use istio default controller
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "*"
---
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: reviews
spec:
  hosts:
    - reviews
  http:
    - route:
        - destination:
            host: reviews
            subset: v1
          weight: 90
        - destination:
            host: reviews
            subset: v2
          weight: 10
---
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: reviews
spec:
  host: reviews
  trafficPolicy:
    loadBalancer:
      simple: RANDOM
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

在容器云中若使用灰度发布功能时，需要：

- 外部流量被配置通过 istio gateway 。这里的“配置”是“网关配置”。
- 提供两组已经部署运行的"应用编排"应用。

灰度发布建立于现有 “应用编排” 功能之上。

灰度发布流程根据 VirtualService 上 spec.route 上设置的目的地大于 1 时存在。此时在应用详情内增加的“灰度发布”tab 页面可以看到灰度比例，发布进度等。

灰度发布流程：

- 要求应用编排必须满足：
  - 必须存在 service deployment
  - 必须存在 istio VirtualService，destinationrule 资源（如果没有，则进行提示，确保当前应用有 istio version）
- 在“应用列表”页面“部署应用”，增加“开始灰度发布”勾选。在用户选择应用镜像 tag 并确认使用灰度发布后，开始灰度发布流程。
- 确认灰度发布后:
  - 将复制一份当前应用的 deployment 并命名为 <name>-<version> 并增加 label version 以标志为新版本。
  - 将增加一条针对该 version 的 DestinationRule
  - 将增加一条 Virtual Service 设置 route.destination 设置为新版本 destinationRule 并设置权重为 0。
- 在 “应用详情”页面中能够调整新旧版本权重，“放弃发布”，“发布完成”操作。
  - “放弃发布”，会删除所有开始灰度发布后创建的资源
  - “确认发布后”，会删除所有历史版本的 deployment destinationrule，virtualservice

> 相比于更改已经存在的资源(destinationrule,virtualservice)，新建资源/删除资源比修改更好操作。

应用编排需要增加对微服务的路由(virtualservice)编排，仅编排当前应用的路由。
应用编排需要增加对微服务的网关(gateway)资源编排，确定当前路由的网关。

### 对现有功能的影响

- 由于灰度发布会多次更改编排中的文件并发布至 argo cd，一次灰度发布流程会使 argo cd 中的版本记录多个版本。

## 可观测

⭐ istio 借助 kiali 实现网格可视化，容器云将嵌入 kiali 页面。

## 短域名 (service 别名)

短域名，也就是对现有的 service 增加一个对应的 serviceentry，serviceentry 使用该 service IP，仅名称有差异。类似 DNS CNAME。

⭐ 对于使用 istio 的服务，仅需要为其增加对应的 serviceentry 即可。需要编写对应的控制器。增加短域名的方式可以使用现有的方式。

> 可能有个改进点，别名使用的是 STRICT_DNS 而非 EDS。
> 由于持有两份的服务配置，可能会增加 sidecar 内存占用，可以考虑修改 istio service 注册源码，直接替换 servicename.namespace 至 servicename.custom.

## 跨集群通信

[network-models](https://istio.io/latest/docs/ops/deployment/deployment-models/#network-models)

跨集群通信均通过外部网关中转，假设不同集群之间均为独立网络。

TODO:

### 外部网关

TODO:
