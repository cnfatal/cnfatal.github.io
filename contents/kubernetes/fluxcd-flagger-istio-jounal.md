---
title: fluxcd/flagger istio 实验
---

[Istio Canary Deployments](https://docs.flagger.app/tutorials/istio-progressive-delivery)

安装 flagger：

```sh
kubectl -n istio-system apply -k kustomize/istio
```

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: public-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "*"
```

## 准备环境

创建实验 deployment

```sh
kubectl create ns test
kubectl label namespace test istio-injection=enabled
kubectl apply -k kustomize/podinfo
kubectl apply -k kustomize/tester
kubectl -n test expose deployment podinfo
```

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          22m
podinfo-689f645b78-ltd6l             2/2     Running   0          4m1s
podinfo-689f645b78-pqspp             2/2     Running   0          4m4s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           52m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           53m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                      AGE    SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP                       52m    app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP,9797/TCP,9999/TCP   5m7s   app=podinfo
+ kubectl -n test get -owide virtualservices.networking.istio.io
No resources found in test namespace.
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

## 创建 canary

```sh
$ kubectl apply -f ./podinfo-canary.yaml
canary.flagger.app/podinfo created
```

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          23m
podinfo-689f645b78-ltd6l             2/2     Running   0          4m41s
podinfo-689f645b78-pqspp             2/2     Running   0          4m44s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           53m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           54m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo
podinfo-primary      0/2     0            0           4s    podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                      AGE     SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP                       53m     app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP,9797/TCP,9999/TCP   5m47s   app=podinfo
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP                     10s     app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP                     7s      app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
No resources found in test namespace.
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

一段时间后：

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          24m
podinfo-primary-96b457488-ck2p9      2/2     Running   0          80s
podinfo-primary-96b457488-j7wmz      2/2     Running   0          83s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           54m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              0/0     0            0           55m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo
podinfo-primary      2/2     2            2           83s   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE    SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     54m    app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   7m6s   app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   89s    app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   86s    app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   29s
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    30s
podinfo-primary   podinfo-primary   30s
```

```yml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  creationTimestamp: "2021-09-14T10:22:56Z"
  generation: 1
  name: podinfo
  namespace: test
  ownerReferences:
    - apiVersion: flagger.app/v1beta1
      blockOwnerDeletion: true
      controller: true
      kind: Canary
      name: podinfo
      uid: 86f9829b-43f5-4110-a52e-73a4eb0e7491
  resourceVersion: "150312056"
  selfLink: /apis/networking.istio.io/v1beta1/namespaces/test/virtualservices/podinfo
  uid: ef7112c7-d710-4c00-b950-a7d58345190f
spec:
  gateways:
    - mesh
  hosts:
    - app.example.com
    - podinfo
  http:
    - retries:
        attempts: 3
        perTryTimeout: 1s
        retryOn: gateway-error,connect-failure,refused-stream
      route:
        - destination:
            host: podinfo-primary
          weight: 100
        - destination:
            host: podinfo-canary
          weight: 0
```

## 触发滚动更新

```sh
kubectl -n test set image deployment/podinfo podinfod=stefanprodan/podinfo:3.1.1
```

```sh
$ bash state.sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          64m
podinfo-primary-76ddbf58c9-8v86w     2/2     Running   0          5m31s
podinfo-primary-76ddbf58c9-xnklt     2/2     Running   0          5m28s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           94m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              0/0     0            0           95m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      2/2     2            2           41m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE   SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     94m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   47m   app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   41m   app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   41m   app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   40m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 100
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 0
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    40m
podinfo-primary   podinfo-primary   40m
```

```sh
  Normal   Synced  12s (x3 over 35m)  flagger  New revision detected! Scaling up podinfo.test
```

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          65m
podinfo-c8bdf98d5-j2kpb              2/2     Running   0          30s
podinfo-c8bdf98d5-vf2zk              2/2     Running   0          33s
podinfo-primary-76ddbf58c9-8v86w     2/2     Running   0          6m33s
podinfo-primary-76ddbf58c9-xnklt     2/2     Running   0          6m30s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           95m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           96m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      2/2     2            2           42m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE   SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     95m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   48m   app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   42m   app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   42m   app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   41m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 100
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 0
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    41m
podinfo-primary   podinfo-primary   41m
```

```sh
  Normal   Synced  6s (x2 over 10m)   flagger  Advance podinfo.test canary weight 20
```

```sh
$ bash state.sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          66m
podinfo-c8bdf98d5-j2kpb              2/2     Running   0          85s
podinfo-c8bdf98d5-vf2zk              2/2     Running   0          88s
podinfo-primary-76ddbf58c9-8v86w     2/2     Running   0          7m28s
podinfo-primary-76ddbf58c9-xnklt     2/2     Running   0          7m25s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           96m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           97m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      2/2     2            2           43m   podinfod     stefanprodan/podinfo:3.1.0                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE   SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     96m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   49m   app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   43m   app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   43m   app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   42m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 80
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 20
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    42m
podinfo-primary   podinfo-primary   42m
```

```sh
  Normal   Synced  4s (x2 over 10m)     flagger  Copying podinfo.test template spec to podinfo-primary.test
```

```sh
$ bash state.sh
+ kubectl -n test get po
NAME                                 READY   STATUS        RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running       0          69m
podinfo-c8bdf98d5-j2kpb              2/2     Running       0          4m3s
podinfo-c8bdf98d5-vf2zk              2/2     Running       0          4m6s
podinfo-primary-76ddbf58c9-8v86w     2/2     Running       0          10m
podinfo-primary-76ddbf58c9-xnklt     2/2     Terminating   0          10m
podinfo-primary-cc54ccd4b-8n9px      0/2     Init:0/1      0          6s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           99m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           99m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      1/2     0            1           46m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE   SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     99m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   51m   app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   46m   app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   46m   app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   45m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 40
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 60
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    45m
podinfo-primary   podinfo-primary   45m
```

```sh
$ bash state.sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          71m
podinfo-c8bdf98d5-j2kpb              2/2     Running   0          5m48s
podinfo-c8bdf98d5-vf2zk              2/2     Running   0          5m51s
podinfo-primary-cc54ccd4b-8n9px      2/2     Running   0          111s
podinfo-primary-cc54ccd4b-c6vzh      2/2     Running   0          108s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE    CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           101m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              2/2     2            2           101m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      2/2     2            2           47m    podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE    SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     101m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   53m    app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   47m    app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   47m    app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   46m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 100
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 0
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    46m
podinfo-primary   podinfo-primary   46m
```

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS    RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running   0          71m
podinfo-primary-cc54ccd4b-8n9px      2/2     Running   0          2m26s
podinfo-primary-cc54ccd4b-c6vzh      2/2     Running   0          2m23s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE    CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           101m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              0/0     0            0           102m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
podinfo-primary      2/2     2            2           48m    podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo-primary
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE    SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     101m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   54m    app=podinfo-primary
podinfo-canary       ClusterIP   10.99.225.12     <none>        9898/TCP   48m    app=podinfo
podinfo-primary      ClusterIP   10.108.175.166   <none>        9898/TCP   48m    app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME      GATEWAYS   HOSTS                       AGE
podinfo   [mesh]     [app.example.com podinfo]   47m
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
[
  {
    "destination": {
      "host": "podinfo-primary"
    },
    "weight": 100
  },
  {
    "destination": {
      "host": "podinfo-canary"
    },
    "weight": 0
  }
]
+ kubectl -n test get -owide destinationrules.networking.istio.io
NAME              HOST              AGE
podinfo-canary    podinfo-canary    47m
podinfo-primary   podinfo-primary   47m
```

## 删除 canary

```sh
$ kubectl -n test delete -f podinfo-canary.yaml
canary.flagger.app "podinfo" deleted
```

```sh
+ kubectl -n test get po
NAME                                 READY   STATUS        RESTARTS   AGE
flagger-loadtester-f4d6c5f55-4c7zb   2/2     Running       0          73m
podinfo-primary-cc54ccd4b-8n9px      0/2     Terminating   0          4m30s
podinfo-primary-cc54ccd4b-c6vzh      0/2     Terminating   0          4m27s
+ kubectl -n test get -owide deployments.apps
NAME                 READY   UP-TO-DATE   AVAILABLE   AGE    CONTAINERS   IMAGES                                     SELECTOR
flagger-loadtester   1/1     1            1           103m   loadtester   ghcr.io/fluxcd/flagger-loadtester:0.18.0   app=flagger-loadtester
podinfo              0/0     0            0           104m   podinfod     stefanprodan/podinfo:3.1.1                 app=podinfo
+ kubectl -n test get -owide svc
NAME                 TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE    SELECTOR
flagger-loadtester   ClusterIP   10.110.248.148   <none>        80/TCP     103m   app=flagger-loadtester
podinfo              ClusterIP   10.100.177.163   <none>        9898/TCP   56m    app=podinfo-primary
+ kubectl -n test get -owide virtualservices.networking.istio.io
No resources found in test namespace.
+ kubectl -n test get -ojson virtualservices.networking.istio.io podinfo
+ jq '.spec.http[0].route'
Error from server (NotFound): virtualservices.networking.istio.io "podinfo" not found
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

## 总结

1. 创建 canary
   1. 创建与原 deployement 相同的 deployment podinfo-primary（label=podinfo-primary）
   1. 创建 service podinfo-primary podinfo-canary
   1. 将 service（podinfo,podinfo-primary）流量指向 deployment podinfo-primary （更改 service label label=podinfo-primary）
   1. 将 service（podinfo-canary）流量指向 deployment podinfo （更改 service label label=podinfo）
   1. 创建 virtualservice 将流量设置为 podinfo-primary:100,podinfo-canary:0。
   1. 将原 deployment 副本数降低至 0
1. 触发更新（更改原 deployment spec）
   1. 将原 deployment （podinfo） 的副本数调整为目标副本数，等待 ready
   1. 逐步增加流向 service （podinfo-canary）的比例，直至 100.即所有流量流向 service podinfo-canary（ deployment podinfo ）。
   1. 将 deployment（podinfo-primary）spec 也设置为 deployment （podinfo），等待 ready。
   1. 由于 podinfo-primary 已经为新版，再次将流量从 service podinfo-canary 完全切换至 service podinfo-primary。
   1. 将 deployment podinfo 副本数降低至 0
1. 删除 canary
   1. 删除所有 flagger 生成的资源
      > 问题为，原来的 deployment 副本数为 0 没有被恢复，service label 没有被恢复
