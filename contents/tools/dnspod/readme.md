# dnspod

由于家里面的路由器外网 IP 会在重新拨号的时候变动，为了能够稳定的利用这个公网地址。

openwrt 原生的包里面有 ddns 功能，但是没有 dnspod 供应商支持。自定义的供应商设置不支持 POST 方式并且需要改动 ddns 的文件来配置。

将脚本配合 cron 或者 network-dispatcher hook 完成 dns 更新。

| dependencies | version |
| ------------ | ------- |
| curl         | -       |
| jq           | -       |
| cron         | -       |
| sh           | -       |
