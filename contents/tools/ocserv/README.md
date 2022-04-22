# openconnect intranet penetration

使用 openconnect 加 ssh 端口转发实现内网穿透

## build

使用 openconnect 实现 vpn 服务, 该服务监听端口 443 。

```bash
cd docker
docker build -t library/ocserv:ubuntu .
```

默认用户密码： user/password

## usage

### 服务器端

```sh
docker run -it --name ocsrv -p 443:443 --privileged library/ocserv:ubuntu
```

使用当前 ocsrv 文件夹配置

```sh
docker run -it --name ocsrv -v ${PWD}/ocserv:/etc/ocserv/ -p 443:443 --privileged library/ocserv:ubuntu
```

设置 ssh 端口转发示例

使用 ssh remote forward 功能将公网主机(vpn.fatalc.cn)的端口(0.0.0.0:10800)转发至本地端口(127.0.0.1:443)。

```sh
ssh -f -N  -R 0.0.0.0:10800:127.0.0.1:443 root@vpn.fatalc.cn
```

新增用户

```sh
docker exec -it ocsrv ocpasswd [username]
```

### 客户端

```sh
sudo openconnect -u user vpn.fatalc.cn:10800 --servercert pin-sha256:Y2S6RQGyFyOsj4zx8Bqm/UUvjg843dGv8B0UR2lsj5w= << EOF
password
EOF
```

`--servercert` 参数值需要根据错误提示进行更新。
