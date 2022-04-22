---
title: fluxcd/flagger 源码初探
---

flagger 主要围绕着资源 Canary 执行各种操作。

以[pkg/controller/controller.go](https://github.com/fluxcd/flagger/blob/cd75c5fa25e60261d888e4456a33a41841ec528a/pkg/controller/controller.go) 为核心逻辑入口。

其中包含了一个缓存，用于缓存集群中存在的 canary 资源。

运行时启动两部分：

1. 用于监听 canary 资源变化的 controller [syncHandler](https://github.com/fluxcd/flagger/blob/cd75c5fa25e60261d888e4456a33a41841ec528a/pkg/controller/controller.go#L237)负责 finalizer 和 cannery cache 维护。
1. 用于定时检查 canary 缓存并执行操作的 [scheduleCanaries](https://github.com/fluxcd/flagger/blob/d7b878f980f027a528ad4f75e89385ddec08d775/pkg/controller/scheduler.go#L92)

scheduleCanaries 会为每个缓存的 canary [运行一个 job](https://github.com/fluxcd/flagger/blob/d7b878f980f027a528ad4f75e89385ddec08d775/pkg/controller/scheduler.go#L110-L120)，并对不存在 canary 的 job 进行清理。

job 中会定时执行[advanceCanary](https://github.com/fluxcd/flagger/blob/d7b878f980f027a528ad4f75e89385ddec08d775/pkg/controller/scheduler.go#L157)

## advanceCanary

advanceCanary 控制着 canary 资源的主要生命周期。

当一个 Canary 被创建时：

1. 初始化

   1. [KubernetesRouter](https://github.com/fluxcd/flagger/blob/cd75c5fa25e60261d888e4456a33a41841ec528a/pkg/router/kubernetes.go#L24),分为初始化，执行以及清理三个阶段。其实现以[KubernetesDefaultRouter](https://github.com/fluxcd/flagger/blob/c36a13ccffefbda1502bf02e8cac2f1b3ca9d027/pkg/router/kubernetes_default.go#L39)为主。
      1. Finalize: 恢复 main service 至之前的配置。
   1. [Controller](https://github.com/fluxcd/flagger/blob/cd75c5fa25e60261d888e4456a33a41841ec528a/pkg/canary/controller.go#L23),用于控制 canary 各个阶段时需要进行的操作。有三个实现，depliyment，statefulset，service。
   1. [MeshRouter](https://github.com/fluxcd/flagger/blob/cd75c5fa25e60261d888e4456a33a41841ec528a/pkg/router/router.go#L24),用于控制 canary 中流量路由。

1. kubeRouter.Initialize()： 创建两个 service，%s-primary，%s-canary。
1. canaryController.Initialize()：创建 %s-primary deployment,如果 canary 正在初始化则副本数设置为 0.否则设置为目标副本数。
   1. 等待 %s-primary ready
   1. 调整 %s 副本数为 0
1. 如果 canary 设置了 hpa，则更新现有 hpa 的 target 为 deployment %s-primary 或者创建新的 hpa。
1. kubeRouter.Reconcile: 更新 main service %s 的 canary service Apex 的 labels。（一般不设置则跳过此步骤）
1. c.shouldAdvance： 检查是否需要进行灰度更新。
1. 根据 webhook 配置确认是否开始灰度。若否，则 return
1. GetRoutes：istio controller 从名称为 %s 的 virtualservice 获取两个服务 %s-primary and %s-canary 的权重
1. canaryController.IsCanaryReady(cd)：等待 %s deoloyment 为运行状态。
1. runPromotionTrafficShift： 将流量全部设置至服务 %s-primary。
1. canaryController.ScaleToZero：将 deployment 副本数调整为 0
1. c.nextStepWeight： 计算下一次的副本权重
1. c.runCanary：进行灰度权重调整
   1. meshRouter.SetRoutes： 调整 virtualservice 服务 %s-primary and %s-canary 的权重
1. 若调整完成

   1. canaryController.Promote：更新 deployment %s-primary 为 deployment %s，将 %s-primary labels 设置为 %s deployment 的 label
   1. canaryController.ScaleToZero：将 deployment %s 副本调整为 0

1. 若删除 canary
   1. 恢复 deployment %s 的副本数为原副本数
