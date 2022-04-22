# 使用

## 开启注入

istio 可以设置自动对命名空间进行注入：

参考[Automatic Sidecar Injection](https://istio.io/latest/docs/ops/configuration/me·sh/injection-concepts/)

```sh
kubectl label namespace default istio-injection=enabled
```

创建一个服务：

```sh
kubectl create deployment --image=cloudidc/echo echo --port=80
kubectl expose deployment echo
```

查询生成的 pod，除了原服务的 container 外，还增加了一个 initContainer "istio-init" 用于更改 iptables 规则，一个 sidecar Container "istio-proxy" 用于流量代理。

## 资源介绍

### Gateway

[networking/gateway](https://istio.io/latest/docs/reference/config/networking/gateway/)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: http-gateway
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
    - port:
        number: 443
        name: https
        protocol: HTTPS
      hosts:
        - "*"
      tls:
        mode: SIMPLE
        caCertificates: /etc/istio/ingressgateway-ca-certs/ca.crt
        serverCertificate: /etc/istio/ingressgateway-certs/tls.crt
        privateKey: /etc/istio/ingressgateway-certs/tls.key
        httpsRedirect: false
```

gateway 资源会在已经部署的 istio-ingress 上设置对应的配置。上述资源为例，会打开端口 80 且配置为 http 协议，并针对所有 HOST 生效。

gateway 是 istio 中的“网关”，所有外部流量均从这里进入/离开 istio，GateWay 资源类似在网关机器上打开了端口。

由于 istio 可以部署多个 istio-ingress，可以通过 label-selector 选择 GateWay 在哪个 ingress 上打开。
默认的 ingress 上配置了 autoscale 策略，支持横向扩展。

除了支持 http(s) 协议外，GateWay 一共支持 HTTP|HTTPS|GRPC|HTTP2|MONGO|TCP|TLS 等协议。

使用 istioctl 以及 operator 部署的 ingress 默认会挂载一些证书：

- `/etc/istio/ingressgateway-ca-certs` secret `istio-ingressgateway-ca-certs`（optional）
- `/etc/istio/ingressgateway-certs` secret `ingressgateway-certs`（optional）

我们可以在 GateWay 中使用这些证书。由于是 optional 的 secret 且默认未被创建，若需要使用则需要先创建同名 secret。
一般情况下会使用由公信机构签发的证书，但测试时也可以借助 certmanager 来创建：

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: istio-ingressgateway-certs
  namespace: istio-system
spec:
  secretName: istio-ingressgateway-certs
  dnsNames:
    - "*"
  isCA: true
  issuerRef:
    name: selfsigned-issuer
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: selfsigned-issuer
  namespace: istio-system
spec:
  selfSigned: {}
```

### VirtualService

[Virtual Service](https://istio.io/latest/docs/reference/config/networking/virtual-service/)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: echo
spec:
  hosts:
    - "*"
  gateways:
    - http-gateway
  http:
    - match:
        - uri:
            exact: /echo
        - uri:
            prefix: /apis/v1
      route:
        - destination:
            host: echo
            port:
              number: 80
```

### Destination Rule

一个简单的路由可以不需要 Destination Rule,也就无法使用灰度/蓝绿发布功能。

[Destination Rule](https://istio.io/latest/docs/reference/config/networking/destination-rule/)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: echo
spec:
  host: echo
```
