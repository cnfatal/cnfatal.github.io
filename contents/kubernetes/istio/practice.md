# istio 实践

## 应用版本标签

istio 在 deployment 上设置 label `version` 来代表该应用的版本。

而在我们的部署中没有 version label，我们使用镜像 tag 来确定版本。

## service port 名称

istio 对于 service spec.ports.name 做了约定，若包含 http 前缀则将该服务视为 http 协议的应用进行代理，grpc，mongo，mysql 等同理。

而目前的 service 命名没有遵循这个约定。导致若错误填写 service name 导致服务无法使用。

## 采集数据自定义 label

envoy metrics 暴露的端点缺失部分我们需要的自定义 label，需要增加。
