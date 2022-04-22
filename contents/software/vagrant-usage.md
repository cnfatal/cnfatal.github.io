# vagrant

Vagrant 是用于在单个工作流程中构建和管理虚拟机环境的工具。通过易于使用的工作流程并专注于自动化，Vagrant 缩短了开发环境的设置时间，提高了生产效率，并使“在我的机器上工作”成为过去的遗物。

Vagrant 是一个管理虚拟机实例的软件，下端支持 libvirt、LXC/LXD、VMWARE、virtualbox、hyperv 等。

[官方文档](https://www.vagrantup.com)

## boxes

vagrant 中的镜像称之为 box，可以使用命令`vagrant box`进行管理。也可以从官方的 box 仓库中进行寻找。

[Discover Vagrant Boxes](https://app.vagrantup.com/boxes/search)

```sh
# 下载一个 ubuntu focal libvirt镜像
vagrant box add  generic/ubuntu2004 --provider libvirt
```

但是对于国内环境来说,下载速度过于缓慢。

第一种方式，使用 http proxy，vagrant box add 会读取当前的环境变量用于 box 下载。

```sh
$ http_proxy=http://127.0.0.1:8889 https_proxy=http://127.0.0.1:8889 vagrant box add ubuntu/focal64
==> box: Loading metadata for box 'ubuntu/focal64'
    box: URL: https://vagrantcloud.com/ubuntu/focal64
==> box: Adding box 'ubuntu/focal64' (v20201210.0.0) for provider: virtualbox
    box: Downloading: https://vagrantcloud.com/ubuntu/boxes/focal64/versions/20201210.0.0/providers/virtualbox.box
==> box: Box download is resuming from prior download progress
    box: Download redirected to host: cloud-images.ubuntu.com
==> box: Successfully added box 'ubuntu/focal64' (v20201210.0.0) for 'virtualbox'!
```

第二种方式,使用其他源的 box。

ubuntu cloud images 也提供了 vagrant box，ubuntu cloud image 可以从国内的源进行下载了。

```sh
$ vagrant box add  https://mirrors.ustc.edu.cn/ubuntu-cloud-images/focal/current/focal-server-cloudimg-amd64-vagrant.box --name ubuntu/focal --provider virtualbox
==> box: Box file was not detected as metadata. Adding it directly...
==> box: Adding box 'ubuntu/focal' (v0) for provider: virtualbox
    box: Downloading: https://mirrors.ustc.edu.cn/ubuntu-cloud-images/focal/current/focal-server-cloudimg-amd64-vagrant.box
==> box: Successfully added box 'ubuntu/focal' (v0) for 'virtualbox'!
$ vagrant box list
ubuntu/focal (virtualbox, 0)
```

> 这里需要注意 `ubuntu/folcal64` box 为 ubuntu 官方的 box，但其仅支持 virtualbox 。
> 对于其他 provider，可以使用 `generic/ubuntu2004` 或者 `hashicorp/focal64` ,官方对此也有说明[Official Boxes](https://www.vagrantup.com/docs/boxes#official-boxes)

## Vagrantfile

可以使用 `vagrant init` 命令生成初始化的 `Vagrantfile`

vagrant 使用示例

```vagrantfile
# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/focal64"
  config.vm.hostname = "ubuntu-focal-#{SecureRandom.hex(3)}"
  config.vm.network "public_network", ip: "10.0.1.19",bridge: "en0: Wi-Fi (Wireless)"
  #config.vm.provision "file", source: "~/.ssh/id_rsa.pub", destination: "/tmp/authorized_keys"
  #config.vm.provision "shell", inline: "sudo cp /tmp/authorized_keys /root/.ssh/authorized_keys"
end
```

## 启动和使用

```sh
$ ls
Vagrantfile
$ vagrant up --provider libvirt
...
$ vagrant ssh
vagrant@ubuntu-focal-7d15d8:~$
```

## 高级配置

使用 Vagrantfile 的优势在于可以将整个虚拟机的配置写进该文件。有关网络、硬件、存储等配置，参考官方文档[Vagrantfile](https://www.vagrantup.com/docs/vagrantfile#vagrantfile)
