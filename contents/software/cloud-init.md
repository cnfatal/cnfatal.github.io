# cloud-init

cloud-init 提供了一套在云环境下的操作系统初始化流程，这套流程专注于云服务器系统的首次运行配置，无需手动在服务器内进行配置。

## meta-data

## user-data

## 示例

```yaml
#cloud-config

# Enable password authentication with the SSH daemon
ssh_pwauth: true

# Hostname
hostname: ubuntu-001

# On first boot, set the (default) ubuntu user's password to "ubuntu" and
# expire user passwords
chpasswd:
  expire: false
  list:
    - ubuntu:password
    - root:password
runcmd:
  - sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/g' /etc/ssh/sshd_config
  - service ssh restart
```

network-config:

```yaml
# This file contains a netplan-compatible configuration which cloud-init
# will apply on first-boot. Please refer to the cloud-init documentation and
# the netplan reference for full details:
#
# https://cloudinit.readthedocs.io/
# https://netplan.io/reference
#

version: 2
ethernets:
  eth0:
    optional: true
    addresses:
      - 192.168.2.31/16
    gateway4: 192.168.0.1
    nameservers:
      addresses:
        - 61.139.2.69
        - 223.5.5.5
```
