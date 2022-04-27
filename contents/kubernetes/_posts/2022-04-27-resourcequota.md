---
title: 为 kubernetes 设置 GPU 资源限制
keywords:
  - kubernetes
  - resourcequota
  - 资源限制
---

资源配额，通过 ResourceQuota 对象来定义，对每个命名空间的资源消耗总量提供限制。
它可以限制命名空间中某种类型的对象的总数目上限，也可以限制命令空间中的 Pod 可以使用的计算资源的总上限。

资源配额的工作方式如下：

当命名空间存在一个或多个 ResourceQuota 对象时，资源配额视为开启。
当用户在命名空间下创建资源（如 Pod、Service 等）时，
配额系统会跟踪集群的资源使用情况，
以确保使用的资源用量不超过 ResourceQuota 中定义的硬性资源限额。
如果资源创建或者更新请求违反了配额约束，那么该请求会报错，并在消息中给出违反的约束。

需要注意的是：

如果命名空间下的计算资源 （如 cpu 和 memory）的配额被启用，则必须为 Pod 设定 resource.request 和 request.limit，
否则配额系统将拒绝 Pod 的创建。
如果要避免这种情况，可使用 [LimitRanger](https://kubernetes.io/docs/tasks/administer-cluster/manage-resources/cpu-constraint-namespace/)
来为 Pod 设置 resource 默认值。

在受支持的 Kubernetes 版本中，resourceQuota 和 limitRanger 都是默认开启的。

## limitRange

在开启资源限制之前，需要先设置 limitRanger 以避免对正在使用用户的资源请求造成影响。

支持的资源类型目前只有三种：

```go
// LimitType is a type of object that is limited. It can be Pod, Container, PersistentVolumeClaim or
// a fully qualified resource name.
type LimitType string

const (
    // Limit that applies to all pods in a namespace
    LimitTypePod LimitType = "Pod"
    // Limit that applies to all containers in a namespace
    LimitTypeContainer LimitType = "Container"
    // Limit that applies to all persistent volume claims in a namespace
    LimitTypePersistentVolumeClaim LimitType = "PersistentVolumeClaim"
)
```

limitRanger 可以对资源默认值/最大值/最小值进行设置。

```go
// LimitRangeItem defines a min/max usage limit for any resource that matches on kind.
type LimitRangeItem struct {
    // Type of resource that this limit applies to.
    Type LimitType `json:"type" protobuf:"bytes,1,opt,name=type,casttype=LimitType"`
    // Max usage constraints on this kind by resource name.
    // +optional
    Max ResourceList `json:"max,omitempty" protobuf:"bytes,2,rep,name=max,casttype=ResourceList,castkey=ResourceName"`
    // Min usage constraints on this kind by resource name.
    // +optional
    Min ResourceList `json:"min,omitempty" protobuf:"bytes,3,rep,name=min,casttype=ResourceList,castkey=ResourceName"`
    // Default resource requirement limit value by resource name if resource limit is omitted.
    // +optional
    Default ResourceList `json:"default,omitempty" protobuf:"bytes,4,rep,name=default,casttype=ResourceList,castkey=ResourceName"`
    // DefaultRequest is the default resource requirement request value by resource name if resource request is omitted.
    // +optional
    DefaultRequest ResourceList `json:"defaultRequest,omitempty" protobuf:"bytes,5,rep,name=defaultRequest,casttype=ResourceList,castkey=ResourceName"`
    // MaxLimitRequestRatio if specified, the named resource must have a request and limit that are both non-zero where limit divided by request is less than or equal to the enumerated value; this represents the max burst for the named resource.
    // +optional
    MaxLimitRequestRatio ResourceList `json:"maxLimitRequestRatio,omitempty" protobuf:"bytes,6,rep,name=maxLimitRequestRatio,casttype=ResourceList,castkey=ResourceName"`
}
```

一个示例：

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default
  namespace: example
spec:
  limits:
    - default:
        cpu: 500m
        memory: 1Gi
      defaultRequest:
        cpu: 10m
        memory: 10Mi
      max:
        cpu: "24"
        memory: 48Gi
      min:
        cpu: "0"
        memory: "0"
      type: Container
    - max:
        storage: 1Ti
      min:
        storage: "0"
      type: PersistentVolumeClaim
    - max:
        cpu: "48"
        memory: 64Gi
      min:
        cpu: "0"
        memory: "0"
      type: Pod
```

对于 自定义计算资源 类型，以 GPU 为例，可以：

```diff
spec:
  limits:
    - default:
+       nvidia.com/gpu: 0
      defaultRequest:
+       nvidia.com/gpu: 0
      max:
+       nvidia.com/gpu: 2
      min:
+       nvidia.com/gpu: 0
      type: Container
```

## resourceQuota

resourceQuota 可以对命名空间下的资源进行限制。定义为:

```go
// ResourceList is a set of (resource name, quantity) pairs.
type ResourceList map[ResourceName]resource.Quantity

// ResourceQuotaSpec defines the desired hard limits to enforce for Quota.
type ResourceQuotaSpec struct {
    // hard is the set of desired hard limits for each named resource.
    // More info: https://kubernetes.io/docs/concepts/policy/resource-quotas/
    // +optional
    Hard ResourceList `json:"hard,omitempty" protobuf:"bytes,1,rep,name=hard,casttype=ResourceList,castkey=ResourceName"`
    // A collection of filters that must match each object tracked by a quota.
    // If not specified, the quota matches all objects.
    // +optional
    Scopes []ResourceQuotaScope `json:"scopes,omitempty" protobuf:"bytes,2,rep,name=scopes,casttype=ResourceQuotaScope"`
    // scopeSelector is also a collection of filters like scopes that must match each object tracked by a quota
    // but expressed using ScopeSelectorOperator in combination with possible values.
    // For a resource to match, both scopes AND scopeSelector (if specified in spec), must be matched.
    // +optional
    ScopeSelector *ScopeSelector `json:"scopeSelector,omitempty" protobuf:"bytes,3,opt,name=scopeSelector"`
}
```

一个简单的资源限制配置长这样：

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: default
  namespace: example
spec:
  hard:
    count/deployments.apps: "512"
    count/pods: "100"
    count/statefulsets.apps: "512"
    limits.cpu: "2"
    limits.memory: 2Gi
    requests.cpu: "2"
    cpu: "2" # 这里的 cpu 是 requests.cpu 的简写,推荐使用全称，语义更强。
    requests.memory: 2Gi
    requests.storage: 5Gi
```

> 在 1.17 及其以上版本中，还支持 [基于优先级类（PriorityClass）来设置资源配额](https://kubernetes.io/zh/docs/concepts/policy/resource-quotas/#%E5%9F%BA%E4%BA%8E%E4%BC%98%E5%85%88%E7%BA%A7%E7%B1%BB-priorityclass-%E6%9D%A5%E8%AE%BE%E7%BD%AE%E8%B5%84%E6%BA%90%E9%85%8D%E9%A2%9D)

对于自定义资源也可以进行限制可以使用 `count/<resource>.<group>` 来进行限制。注意没有 version。
例如，要对 `example.com` API 组中的自定义资源 `widgets` 设置配额，可以使用 `count/widgets.example.com`。

```diff
apiVersion: v1
kind: ResourceQuota
spec:
  hard:
+   count/widgets.example.com: 2
```

如果要对 自定义计算资源 nvdia GPU 使用进行限制，可以设置为：

```diff
apiVersion: v1
kind: ResourceQuota
spec:
  hard:
+   requests.nvidia.com/gpu: 2
+   limits.nvidia.com/gpu: 2
```
