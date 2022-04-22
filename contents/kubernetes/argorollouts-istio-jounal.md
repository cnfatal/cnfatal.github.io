# argo rollout istio 实验

[Istio](https://argoproj.github.io/argo-rollouts/features/traffic-management/istio/#istio)

## 准备环境

```yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rollouts-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rollouts-demo
  template:
    metadata:
      labels:
        app: rollouts-demo
        istio-injection: enabled
    spec:
      containers:
        - name: rollouts-demo
          image: argoproj/rollouts-demo:blue
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          resources:
            requests:
              memory: 32Mi
              cpu: 5m
---
apiVersion: v1
kind: Service
metadata:
  name: rollouts-demo-canary
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
  name: rollouts-demo
spec:
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: rollouts-demo
    # This selector will be updated with the pod-template-hash of the stable ReplicaSet. e.g.:
    # rollouts-pod-template-hash: 789746c88d
---
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: rollouts-demo
spec:
  gateways:
    - rollouts-demo-gateway
  hosts:
    - rollouts-demo.local
  http:
    - name: primary
      route:
        - destination:
            host: rollouts-demo
          weight: 100
        - destination:
            host: rollouts-demo-canary
          weight: 0
```

```sh
kubectl -n test create -f docs/getting-started/istio/services.yaml
kubectl -n test create -f docs/getting-started/istio/deployments.yaml
kubectl -n test create -f docs/getting-started/istio/virtualsvc.yaml
```

```sh
+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-7d6b9bd96b-bx58z   2/2     Running   0          39s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE   CONTAINERS      IMAGES                        SELECTOR
rollouts-demo-7d6b9bd96b   1         1         1       39s   rollouts-demo   argoproj/rollouts-demo:blue   app=rollouts-demo,pod-template-hash=7d6b9bd96b
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                        SELECTOR
rollouts-demo   1/1     1            1           39s   rollouts-demo   argoproj/rollouts-demo:blue   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    32s   app=rollouts-demo
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    35s   app=rollouts-demo
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   25s
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

## 创建 rollout

```yml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: rollouts-demo
spec:
  replicas: 1
  strategy:
    canary:
      canaryService: rollouts-demo-canary
      stableService: rollouts-demo
      trafficRouting:
        istio:
          virtualService:
            name: rollouts-demo
            routes:
              - primary # At least one route is required
      steps:
        - setWeight: 5
        - pause: { duration: 30s }
        - setWeight: 20
        - pause: { duration: 30s }
        - setWeight: 80
        - pause: { duration: 30s }
        - setWeight: 100
  workloadRef: # Reference an existing Deployment using workloadRef field
    apiVersion: apps/v1
    kind: Deployment
    name: rollouts-demo
```

```sh
kubectl -n test create -f docs/getting-started/istio/rollout.yaml
```

```sh
+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-5db7d7f9f7-lgp98   2/2     Running   0          36s
rollouts-demo-7d6b9bd96b-bx58z   2/2     Running   0          117s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE    CONTAINERS      IMAGES                        SELECTOR
rollouts-demo-5db7d7f9f7   1         1         1       36s    rollouts-demo   argoproj/rollouts-demo:blue   app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-7d6b9bd96b   1         1         1       117s   rollouts-demo   argoproj/rollouts-demo:blue   app=rollouts-demo,pod-template-hash=7d6b9bd96b
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE    CONTAINERS      IMAGES                        SELECTOR
rollouts-demo   1/1     1            1           117s   rollouts-demo   argoproj/rollouts-demo:blue   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE    SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    110s   app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    113s   app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   103s
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

```sh
  Normal  RolloutUpdated        4m43s  rollouts-controller  Rollout updated to revision 1
  Normal  NewReplicaSetCreated  4m43s  rollouts-controller  Created ReplicaSet rollouts-demo-5db7d7f9f7 (revision 1)
  Normal  ScalingReplicaSet     4m43s  rollouts-controller  Scaled up ReplicaSet rollouts-demo-5db7d7f9f7 (revision 1) from 0 to 1
  Normal  RolloutCompleted      4m43s  rollouts-controller  Rollout completed update to revision 1 (5db7d7f9f7): Initial deploy
  Normal  SwitchService         4m43s  rollouts-controller  Switched selector for service 'rollouts-demo' from '' to '5db7d7f9f7'
  Normal  SwitchService         4m15s  rollouts-controller  Switched selector for service 'rollouts-demo-canary' from '' to '5db7d7f9f7'
```

## 触发更新

```sh
kubectl -n test set image deployment  rollouts-demo rollouts-demo=argoproj/rollouts-demo:yellow
```

```sh
  Normal  RolloutUpdated        12s    rollouts-controller  Rollout updated to revision 2
  Normal  NewReplicaSetCreated  12s    rollouts-controller  Created ReplicaSet rollouts-demo-6db9944f45 (revision 2)
  Normal  ScalingReplicaSet     12s    rollouts-controller  Scaled up ReplicaSet rollouts-demo-6db9944f45 (revision 2) from 0 to 1

+ kubectl -n test get po
NAME                             READY   STATUS        RESTARTS   AGE
rollouts-demo-5db7d7f9f7-lgp98   2/2     Running       0          8m19s
rollouts-demo-6db9944f45-thtrj   2/2     Running       0          32s
rollouts-demo-7d6b9bd96b-bx58z   0/2     Terminating   0          9m40s
rollouts-demo-84bb999df4-5tbfq   2/2     Running       0          32s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE     CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   1         1         1       8m20s   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   1         1         1       33s     rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-7d6b9bd96b   0         0         0       9m41s   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-84bb999df4   1         1         1       33s     rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE     CONTAINERS      IMAGES                          SELECTOR
rollouts-demo   1/1     1            1           9m41s   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE     SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    9m34s   app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    9m37s   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   9m27s
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

```sh
  Normal  RolloutUpdated         84s    rollouts-controller  Rollout updated to revision 2
  Normal  NewReplicaSetCreated   84s    rollouts-controller  Created ReplicaSet rollouts-demo-6db9944f45 (revision 2)
  Normal  ScalingReplicaSet      84s    rollouts-controller  Scaled up ReplicaSet rollouts-demo-6db9944f45 (revision 2) from 0 to 1
  Normal  SwitchService          55s    rollouts-controller  Switched selector for service 'rollouts-demo-canary' from '5db7d7f9f7' to '6db9944f45'
  Normal  UpdatedVirtualService  49s    rollouts-controller  VirtualService `rollouts-demo` set to desiredWeight '5'
  Normal  RolloutStepCompleted   49s    rollouts-controller  Rollout step 1/2 completed (setWeight: 5)
  Normal  RolloutPaused          49s    rollouts-controller  Rollout is paused (CanaryPauseStep)

+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-5db7d7f9f7-lgp98   2/2     Running   0          8m47s
rollouts-demo-6db9944f45-thtrj   2/2     Running   0          60s
rollouts-demo-84bb999df4-5tbfq   2/2     Running   0          60s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE     CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   1         1         1       8m48s   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   1         1         1       61s     rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-7d6b9bd96b   0         0         0       10m     rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-84bb999df4   1         1         1       61s     rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo   1/1     1            1           10m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    10m   app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    10m   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   9m55s
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 95
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 5
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

```sh
  Normal  UpdatedVirtualService  4s                 rollouts-controller  VirtualService `rollouts-demo` set to desiredWeight '20'
  Normal  RolloutStepCompleted   4s                 rollouts-controller  Rollout step 3/7 completed (setWeight: 20)

...
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 80
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 20
    }
  ]
}

{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 20
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 80
    }
  ]
}
```

```sh
+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-5db7d7f9f7-lgp98   2/2     Running   0          30m
rollouts-demo-6db9944f45-thtrj   2/2     Running   0          22m
rollouts-demo-84bb999df4-5tbfq   2/2     Running   0          22m
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   1         1         1       30m   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   1         1         1       22m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-7d6b9bd96b   0         0         0       31m   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-84bb999df4   1         1         1       22m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo   1/1     1            1           31m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    31m   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    31m   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   31m
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.


  Normal  RolloutStepCompleted   2m9s                  rollouts-controller  Rollout step 7/7 completed (setWeight: 100)
  Normal  ScalingReplicaSet      99s                   rollouts-controller  Scaled down ReplicaSet rollouts-demo-5db7d7f9f7 (revision 1) from 1 to 0

+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   0         0         0       32m   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   1         1         1       24m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-7d6b9bd96b   0         0         0       33m   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-84bb999df4   1         1         1       24m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
```

## 再次触发更新

```sh
kubectl -n test set image deployment  rollouts-demo rollouts-demo=argoproj/rollouts-demo:red
```

```sh
+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-6db9944f45-mvvrn   2/2     Running   0          5m22s
rollouts-demo-7fd6cdb9f8-x66cs   1/2     Running   0          19s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE     CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   0         0         0       6m13s   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   1         1         1       5m22s   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-6fbb665b49   0         0         0       19s     rollouts-demo   argoproj/rollouts-demo:red      app=rollouts-demo,pod-template-hash=6fbb665b49
rollouts-demo-7d6b9bd96b   0         0         0       3d      rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-7fd6cdb9f8   1         1         0       19s     rollouts-demo   argoproj/rollouts-demo:red      app=rollouts-demo,rollouts-pod-template-hash=7fd6cdb9f8
rollouts-demo-84bb999df4   0         0         0       5m22s   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                       SELECTOR
rollouts-demo   0/0     0            0           3d    rollouts-demo   argoproj/rollouts-demo:red   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    3d    app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    3d    app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   3d
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 95
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 5
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

更新完成后

```sh
+ kubectl -n test get po
NAME                             READY   STATUS    RESTARTS   AGE
rollouts-demo-7fd6cdb9f8-x66cs   2/2     Running   0          2m44s
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE     CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-5db7d7f9f7   0         0         0       8m38s   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,rollouts-pod-template-hash=5db7d7f9f7
rollouts-demo-6db9944f45   0         0         0       7m47s   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,rollouts-pod-template-hash=6db9944f45
rollouts-demo-6fbb665b49   0         0         0       2m44s   rollouts-demo   argoproj/rollouts-demo:red      app=rollouts-demo,pod-template-hash=6fbb665b49
rollouts-demo-7d6b9bd96b   0         0         0       3d      rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-7fd6cdb9f8   1         1         1       2m44s   rollouts-demo   argoproj/rollouts-demo:red      app=rollouts-demo,rollouts-pod-template-hash=7fd6cdb9f8
rollouts-demo-84bb999df4   0         0         0       7m47s   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                       SELECTOR
rollouts-demo   0/0     0            0           3d    rollouts-demo   argoproj/rollouts-demo:red   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    3d    app=rollouts-demo,rollouts-pod-template-hash=7fd6cdb9f8
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    3d    app=rollouts-demo,rollouts-pod-template-hash=7fd6cdb9f8
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   3d
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

## 删除 rollout

```sh
kubectl -n test delete rollouts.argoproj.io  rollouts-demo
```

```sh
+ kubectl -n test get po
NAME                             READY   STATUS        RESTARTS   AGE
rollouts-demo-6db9944f45-thtrj   2/2     Terminating   0          27m
rollouts-demo-84bb999df4-5tbfq   2/2     Running       0          27m
+ kubectl -n test get -owide replicasets.apps
NAME                       DESIRED   CURRENT   READY   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo-7d6b9bd96b   0         0         0       36m   rollouts-demo   argoproj/rollouts-demo:blue     app=rollouts-demo,pod-template-hash=7d6b9bd96b
rollouts-demo-84bb999df4   1         1         1       27m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo,pod-template-hash=84bb999df4
+ kubectl -n test get -owide deployments.apps
NAME            READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS      IMAGES                          SELECTOR
rollouts-demo   1/1     1            1           36m   rollouts-demo   argoproj/rollouts-demo:yellow   app=rollouts-demo
+ kubectl -n test get -owide svc
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE   SELECTOR
rollouts-demo          ClusterIP   10.100.190.127   <none>        80/TCP    36m   app=rollouts-demo
rollouts-demo-canary   ClusterIP   10.111.4.13      <none>        80/TCP    36m   app=rollouts-demo
+ kubectl -n test get -owide virtualservices.networking.istio.io
NAME            GATEWAYS                  HOSTS                   AGE
rollouts-demo   [rollouts-demo-gateway]   [rollouts-demo.local]   36m
+ kubectl -n test get virtualservices.networking.istio.io rollouts-demo -ojson
+ jq .spec.http[0]
{
  "name": "primary",
  "route": [
    {
      "destination": {
        "host": "rollouts-demo"
      },
      "weight": 100
    },
    {
      "destination": {
        "host": "rollouts-demo-canary"
      },
      "weight": 0
    }
  ]
}
+ kubectl -n test get -owide destinationrules.networking.istio.io
No resources found in test namespace.
```

## 总结

1. 创建 rollout 后
   1. 将创建与当前 deployment 相同的 rs
   1. 并将当前 service 以及 canary service 流量全部切换（修改 service label）至 rs。
      > 此时的原 deployment 所有副本均不接受流量了。
1. 触发更新（更改原 deployment spec）
   1. 将创建新版本 rs v2
   1. 将 canary service 流量切换至 rs v2。(更改 service label)
   1. 逐步增加流向 canary service 的流量。（更改 virtualservice）
   1. 流量全部切换至 canary service 后(100%)
      > 在 argo rollout 的过程中，原来的 deployment 也在进行版本切换，但只是没有实际承载流量。
1. 完成更新
   1. 将原 service 指向新版本 rs(pod),此时 virtual service 中其流量比例为 0。(更改 service label)
   1. 将 service 流量比例调至 100%，canary service 降低至 0
1. 删除 rollout
   1. 恢复原 service label，将流量指向原来的 deployment pods。
   1. 删除 rs v2
      > 由于恢复了 service label，流量得以指向了与 argo 同时更新的新版本 deployment 的 pod，所以不会中断
