# debug istio

debug istio 的方式，官方文档[diagnostic-tools](https://istio.io/latest/docs/ops/diagnostic-tools/)

主要关注 [Debugging Envoy and Istiod
](https://istio.io/latest/docs/ops/diagnostic-tools/proxy-cmd/)

## 配置验证

配置验证可以离线快速验证不符合 istio 约定的配置，支持 deploymwnt 和 service。

```sh
$ kubectl -n istio-demo get deployments.apps -oyaml | istioctl validate -f -
deployment "echo/istio-demo:" may not provide Istio metrics and telemetry without label "version". See https://istio.io/v1.11/docs/ops/deployment/requirements/
validation succeed

$ kubectl -n istio-demo get svc -oyaml | istioctl validate -f -
Error: 1 error occurred:
        * List//: service "echo/istio-demo/:" has an unnamed port. This is not recommended, See https://istio.io/v1.11/docs/ops/deployment/requirements/

```

## istiod 端

[ports-used-by-istio](https://istio.io/latest/docs/ops/deployment/requirements/#ports-used-by-istio)

在 istiod 中，监听以下端口：

| 端口           | 用途                   | 简介                                                                              |
| -------------- | ---------------------- | --------------------------------------------------------------------------------- |
| 127.0.0.1:9876 | istiod,controlz        | istiod 的控制和 debug 界面汇总 ,pprof                                             |
| :::15014       | pilot,debug,prometheus | pilot's self-monitoring information, istio debug server 和 monitor 使用同一个端点 |
| 0.0.0.0:15012  | istiod,GRPCS           | Discovery service secured gRPC address                                            |
| 0.0.0.0:15010  | istiod,GRPC            | Discovery service gRPC address                                                    |
| 0.0.0.0:15017  | istiod,HTTPS,webhook   | Injection and validation service HTTPS address                                    |
| 0.0.0.0:8080   | istiod,XDS server,HTTP | Discovery service HTTP address , debug server                                     |

### pilot-xds(debug)

打开 pilot debug 页面(html)：

```sh
kubectl -n istio-system  port-forward --address 0.0.0.0 istiod-57fcfb4b59-hs5vz  8080:15014
curl 127.0.0.1:8080/debug/
```

### pilot-discovery(controlz)

controlz 用于查看程序运行时堆栈，GC 本地 IP，commandline 配置等

打开 controz 页面：

```sh
kubectl -n istio-system  port-forward --address 0.0.0.0 istiod-57fcfb4b59-hs5vz  9876:8080
```

或者

```sh
istioctl -n istio-demo dashboard controlz echo-64d67d9f58-86f7p
```

## sidecar 端

[ports-used-by-istio](https://istio.io/latest/docs/ops/deployment/requirements/#ports-used-by-istio)

在 istio sidecar 注入的 pod 中，会增加以下监听端口：

| 端口            | 用途                                   | 简介                                                                             |
| --------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 127.0.0.1:15000 | envoy,admin interface                  | 可以看 envoy runtime 信息，`istioctl proxy-config` 从这里的 `/config_dump`取数据 |
| 0.0.0.0:15001   | envoy,virtualOutbound                  |
| 127.0.0.1:15004 | pilot-agent, PROXY_XDS_DEBUG_VIA_AGENT | pilot-agent 的 debug interface, 代理 请求并发送至 istiod XDS                     |
| 0.0.0.0:15006   | envoy,virtualInbound                   |
| ::15020         | pilot-agent,StatusServer               |
| 0.0.0.0:15021   | envoy,ENVOY_STATUS_PORT                |
| 127.0.0.1:15053 | envoy,DNS_PROXY_ADDR                   |
| 0.0.0.0:15090   | envoy,ENVOY_PROMETHEUS_PORT            |

```sh
kubectl -n istio-demo port-forward --address 0.0.0.0  echo-64b56cb86b-xq99n 8080:15000
```

### envoy(admin-interface)

envoy 提供管理端[Administration interface](https://www.envoyproxy.io/docs/envoy/latest/operations/admin) rest api 和页面，可以从该端点进行查看。

```sh
kubectl  -n istio-demo  port-forward --address 0.0.0.0 echo-64d67d9f58-86f7p  8080:15000
```

或者

```sh
istioctl -n istio-demo dashboard envoy echo-64d67d9f58-86f7p
```

### pilot-agent(xds-proxy)

打开[pilot-agent](https://istio.io/latest/docs/reference/commands/pilot-agent/#envvars) 的[debug interface](https://github.com/istio/istio/blob/96710172e1e47cee227e7e8dd591a318fdfe0326/pkg/istio-agent/xds_proxy.go#L830)

pilot-agent 监听 15004 端口作为 istio xds debug interface，接受数据并发送至 istiod

> 暂时不知道如何使用

### pilot-agent(status-server)

status server 提供 prometheus 端点，其监听端口为 15020

```sh
kubectl -n istio-demo port-forward --address 0.0.0.0  echo-64b56cb86b-xq99n 8080:15020
```

其提供如下 debug 路径：

- `/debug/ndsz`
- `/stats/prometheus`
- `/debug/pprof`
- `/quitquitquit`
- `/healthz/ready`
- `/app-health/`
