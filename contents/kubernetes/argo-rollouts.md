---
title: argo-rollouts 浅析
---

蓝绿发布：

- 当前版本 v1 正常运行
- 将新版本 v2 所有副本全部准备完成后
- 切换负载均衡器所有流量指向 v2
- 如果一切正常，则删除 v1，完成更新
- 如果发生错误，则将所有流量切换回 v1，并停止本次更新。

灰度发布：

- 当前版本 v1 正常运行
- 准备新版本 v2 （少量副本），将流量部分（百分比）切至 v2
- 如果一切正常，则逐步增加流向 v2 版本的流量;直至全部流量切换至 v2，删除 v1 版本。
- 如果发生错误，则减少流向 v2 版本的流量或停止本次升级;

## rollouts

[argo rollouts](https://argoproj.github.io/argo-rollouts/architecture/)
定义了一种新的资源`Rollout`,旨在代替 Deployment 功能，通过控制不同版本 replicasets 副本数量来实现策略化更新。

其定义和 Deployment 极为相似，仅区别于`strategy`字段，可以理解为 Rollout 对 Deployment 的 strategy 功能进行了扩展。

```yaml
apiVersion: argoproj.io/v1alpha1 # Changed from apps/v1
kind: Rollout # Changed from Deployment
metadata:
  name: rollouts-demo
spec:
  selector:
    matchLabels:
      app: rollouts-demo
  template:
    metadata:
      labels:
        app: rollouts-demo
    spec:
      containers:
        - name: rollouts-demo
          image: argoproj/rollouts-demo:blue
          ports:
            - containerPort: 8080
  strategy:
    canary: # Changed from rollingUpdate or recreate
      steps:
        - setWeight: 20
        - pause: {}
```

> <https://argoproj.github.io/argo-rollouts/migrating/#convert-deployment-to-rollout>

argo rollout 支持从现有 Deployment 引用定义,以方便快速集成至 Rolllout。

> <https://argoproj.github.io/argo-rollouts/migrating/#reference-deployment-from-rollout>

与 Deployment 相同 Rollout 借用了 kubernetes 原生资源 Service 来完成版本更新。

在 argo rollout 中策略设置为蓝绿发布时：

- 对 Rollout 中 pod 定义进行修改以触发更新
- Rollout 创建新 Replicaset·
- 在新版本全部准备就绪后更新 Service 将所有流量切换至新 ReplicaSet。

在策略设置为灰度发布时：

- 在 Rollout 中灰度比例以及灰度调整间隔时间等
- 对 Rollout 中 pod 定义进行修改以触发更新
- Rollout 创建新 Replicaset，根据配置设置 Service 后端为不同权重的新旧副本数量比例。
- 按照策略继续执行灰度更新，直至完全更新。

除了上述的策略外，argo rollout 还提供了基于监控反馈的灰度更新等其他辅助功能。

## 实现方式

argo rollout 使用两类方式来完成灰度更新：

1. 应用级别流量分割，即在一个 service 下实现灰度。支持的后端有 istio。
1. 服务级别流量分割，使用两个不同的 services 实现灰度。支持 nginx ingres，istio。

有关于 argo rollout 与 istio,argo CD 共同使用的内容以及优劣在官方文档上已经有了清楚完备的描述了[traffic-management/istio](https://argoproj.github.io/argo-rollouts/features/traffic-management/istio/)

### 应用级别流量分割

[istio/#subset-level-traffic-splitting](https://argoproj.github.io/argo-rollouts/features/traffic-management/istio/#subset-level-traffic-splitting)

以 istio 为后端举例，rollout 在 subset 级别进行灰度发布时，会动态的修改 virtualservice 中对应的 subsets，不同的 subset 对应不同的版本。

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
spec:
  http:
    - name: primary # referenced in canary.trafficRouting.istio.virtualService.routes
      route:
        - destination:
            host: rollout-example
            subset: stable # referenced in canary.trafficRouting.istio.destinationRule.stableSubsetName
          weight: 100
        - destination:
            host: rollout-example
            subset: canary # referenced in canary.trafficRouting.istio.destinationRule.canarySubsetName
          weight: 0
---
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
spec:
  host: rollout-example
  subsets:
    - name: canary # referenced in canary.trafficRouting.istio.destinationRule.canarySubsetName
      labels: # labels will be injected with canary rollouts-pod-template-hash value
        app: rollout-example
    - name: stable # referenced in canary.trafficRouting.istio.destinationRule.stableSubsetName
      labels: # labels will be injected with stable rollouts-pod-template-hash value
        app: rollout-example
```

根据 rollout 版本创建 subset； 根据 rollout 中配置的比例调整 virtualservice 中 service subset 流量权重。

argo rollout 还提供了配置支持在 rollout 过程中进行 preview，即提供 preview service 对新版本进行访问以进行监控采样等工作。

### 服务级别流量分割

[istio/#host-level-traffic-splitting](https://argoproj.github.io/argo-rollouts/features/traffic-management/istio/#host-level-traffic-splitting)

[nginx/#integration-with-argo-rollouts](https://argoproj.github.io/argo-rollouts/features/traffic-management/nginx/#integration-with-argo-rollouts)

以 istio 为后端举例，rollout 在 service 级别进行灰度发布时，会动态修改 virtualservice 中对应的 service，不同的 service 对应不同版本。

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
spec:
  http:
    - name: primary # referenced in canary.trafficRouting.istio.virtualService.routes
      route:
        - destination:
            host: stable-svc # referenced in canary.stableService
          weight: 100
        - destination:
            host: canary-svc # referenced in canary.canaryService
          weight: 0
---
apiVersion: v1
kind: Service
metadata:
  name: canary-svc
spec:
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: rollouts-demo
    # This selector will be updated with the pod-template-hash of the canary ReplicaSet. e.g.:
    # rollouts-pod-template-hash: 7bf84f9696
---
apiVersion: v1
kind: Service
metadata:
  name: stable-svc
spec:
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: rollouts-demo
    # This selector will be updated with the pod-template-hash of the stable ReplicaSet. e.g.:
    # rollouts-pod-template-hash: 123746c88d
```

根据 rollout 中的版本修改 service 的 labelselector 以匹配不同版本的 endpoint，根据 rollout 中配置的比例调整 virtualservice 中 service 流量权重。

## 监控反馈的灰度发布

[analysis](https://argoproj.github.io/argo-rollouts/features/analysis/) 为 argo rollout 提供了高级特性。可以在灰度过程中根据 analysis 指标的成功或者失败以决定继续执行灰度发布还是终止该次发布。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
    - name: service-name
  metrics:
    - name: success-rate
      interval: 5m
      # NOTE: prometheus queries return results in the form of a vector.
      # So it is common to access the index 0 of the returned array to obtain the value
      successCondition: result[0] >= 0.95
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus.example.com:9090
          query: |
            sum(irate(
              istio_requests_total{reporter="source",destination_service=~"{{args.service-name}}",response_code!~"5.*"}[5m]
            )) / 
            sum(irate(
              istio_requests_total{reporter="source",destination_service=~"{{args.service-name}}"}[5m]
            ))
```

上述模板表示在灰度发布过程中，每 5Min 执行一次成功率分析，若分析结果 >= 0.95 则为成功，可以继续灰度发布。若失败，则主动终止 argo rollout 本次灰度发布。

## 参考

- [argo-rollouts/examples](https://github.com/argoproj/argo-rollouts/tree/master/examples)
- [Argo Rollouts Demo Application](https://github.com/argoproj/rollouts-demo)
