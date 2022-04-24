---
title: zfs cheatsheet
---

## basic

```sh
$ zfs list

$ zfs list -t snapshot # list snapshots

$ zfs list rpool/ROOT/ubuntu_ex5snj/var/lib/docker # list a dataset
NAME                                      USED  AVAIL     REFER  MOUNTPOINT
rpool/ROOT/ubuntu_ex5snj/var/lib/docker  51.0G  85.3G     5.64G  /var/lib/docker


$ sudo zfs create rpool/ROOT/ubuntu_ex5snj/var/lib/containerd # contaienrd storage
$ sudo zfs create rpool/ROOT/ubuntu_ex5snj/var/lib/containerd/io.containerd.snapshotter.v1.zfs # contaienrd zfs driver

$ sudo zfs create rpool/ROOT/ubuntu_ex5snj/var/lib/containers # open containers zfs sriver parent
$ sudo zfs create rpool/ROOT/ubuntu_ex5snj/var/lib/containers/storage # open containers zfs sriver
$ sudo zfs create -o mountpoint=/var/lib/containers/storage rpool/ROOT/ubuntu_ex5snj/var/lib/containers/storage # same with above


/$ zfs list rpool/ROOT/ubuntu_ex5snj/var/lib/docker -r # list a dataset with children
NAME                                                                                                            USED  AVAIL     REFER  MOUNTPOINT
rpool/ROOT/ubuntu_ex5snj/var/lib/docker                                                                        51.0G  85.3G     5.64G  /var/lib/docker
rpool/ROOT/ubuntu_ex5snj/var/lib/docker/05fcf90bbe921b8299a75492e2b2bdcc5130eb0f9a63bf390325620d3f23edc6        220K  85.3G      140M  legacy
rpool/ROOT/ubuntu_ex5snj/var/lib/docker/0d78181831343daaee7b609a586d94918ab24d3fb7cfb6999c9020755bcf37d5       1.52M  85.3G      322M  legacy

$ zfs destroy -r <zfs-path> # Recursively destroy all children.
$ zfs destroy -r -R <zfs-path>  # Recursively destroy all dependents, including cloned file systems outside the target hierarchy.
$ zfs list rpool/ROOT/ubuntu_ex5snj/var/lib/containers -r -o name -H | xargs -n1 sudo zfs destroy -r #
```

## auto-zsys

ZSys daemon and client for zfs systems written in Go,it auto snapshot on system changes.

zsys has a config file:

```sh
$ cat /etc/zsys.conf
history:
  # Keep at least n history entry per unit of time if enough of them are present
  # The order condition the bucket start and end dates (from most recent to oldest)
  gcstartafter: 1
  keeplast: 5 # Minimum number of recent states to keep.
  #    - name:             Abitrary name of the bucket
  #      buckets:          Number of buckets over the interval
  #      bucketlength:     Length of each bucket in days
  #      samplesperbucket: Number of datasets to keep in each bucket
  gcrules:
    - name: PreviousDay
      buckets: 1
      bucketlength: 1
      samplesperbucket: 3
    - name: PreviousWeek
      buckets: 5
      bucketlength: 1
      samplesperbucket: 1
    - name: PreviousMonth
      buckets: 4
      bucketlength: 7
      samplesperbucket: 1
general:
  # Minimal free space required before taking a snapshot
  minfreepoolspace: 20
  # Daemon timeout in seconds
  timeout: 120
```

zsys has a command tools `zsysctl`

```sh
$ zsysctl show # show snapshot details
Name:           rpool/ROOT/ubuntu_ex5snj
ZSys:           true
Last Used:      current
History:
  - Name:       rpool/ROOT/ubuntu_ex5snj@autozsys_fovr0f
    Created on: 2022-04-19 06:51:25
  - Name:       rpool/ROOT/ubuntu_ex5snj@autozsys_rrwss9
    Created on: 2022-04-18 17:02:25
  - Name:       rpool/ROOT/ubuntu_ex5snj@autozsys_c83eo6
    Created on: 2022-04-18 16:17:35
  - Name:       rpool/ROOT/ubuntu_ex5snj@autozsys_smk3m0
    Created on: 2022-04-18 16:16:04
  - Name:       rpool/ROOT/ubuntu_ex5snj@autozsys_rk5361
    Created on: 2022-04-18 16:07:19
Users:
  - Name:    root
    History:
     - rpool/USERDATA/root_ff8efa@autozsys_fovr0f (2022-04-19 06:51:28)
     - rpool/USERDATA/root_ff8efa@autozsys_rrwss9 (2022-04-18 17:02:27)
     - rpool/USERDATA/root_ff8efa@autozsys_c83eo6 (2022-04-18 16:17:35)
     - rpool/USERDATA/root_ff8efa@autozsys_smk3m0 (2022-04-18 16:16:05)
     - rpool/USERDATA/root_ff8efa@autozsys_rk5361 (2022-04-18 16:07:20)
  - Name:    user
    History:
     - rpool/USERDATA/user_ff8efa@autozsys_j3sl6d (2022-04-22 11:06:34)
     - rpool/USERDATA/user_ff8efa@autozsys_orpji5 (2022-04-20 16:09:45)
     - rpool/USERDATA/user_ff8efa@autozsys_htp8hi (2022-04-19 18:02:34)
     - rpool/USERDATA/user_ff8efa@autozsys_gn9xwp (2022-04-19 14:59:34)
     - rpool/USERDATA/user_ff8efa@autozsys_y3x8bz (2022-04-19 13:58:34)
     - rpool/USERDATA/user_ff8efa@autozsys_fovr0f (2022-04-19 06:51:28)
     - rpool/USERDATA/user_ff8efa@autozsys_rrwss9 (2022-04-18 17:02:27)
     - rpool/USERDATA/user_ff8efa@autozsys_c83eo6 (2022-04-18 16:17:35)
     - rpool/USERDATA/user_ff8efa@autozsys_smk3m0 (2022-04-18 16:16:05)
     - rpool/USERDATA/user_ff8efa@autozsys_rk5361 (2022-04-18 16:07:19)
```
