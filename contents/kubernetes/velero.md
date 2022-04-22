---
title: velero 使用笔记
---

[velero](https://github.com/vmware-tanzu/velero) 是一个开源的 kubernetes 集群备份还原工具，基于 operator 模式开发。

## 资源

velero 有如下几种资源：

- backup-location（BackupStorageLocation）: 资源备份位置，通常为对象存储。
- snapshot-location（VolumeSnapshotLocation）: 卷备份位置，通常为块存储或者文件存储。
- backup（Backup）: 备份
- restore（Restore）: 还原
- schedule(Schedule): 定时备份

## 安装

```sh
velero install \
--namespace velero \
--image harbor.cloudminds.com/velero/velero:latest \
-—features EnableCSI \
-—plugins harbor.cloudminds.com/velero/velero-plugin-for-csi:latest,harbor.cloudminds.com/velero/velero-plugin-for-aws:latest \
--no-default-backup-location \
--use-volume-snapshots false \
--no-secret
```

创建 secret 文件

```conf
[default]
aws_access_key_id = minioadmin
aws_secret_access_key = minioadmin
```

创建 `backup storage locations`:

```sh
$ kubectl create secret -n velero generic --from-file config=credentials-velero  s3-crendential
secret/s3-crendential created
$ export S3_URL=http://10.12.32.2:32262
$ velero create backup-location \
--bucket velero \
--provider aws \
--config region=minio,s3ForcePathStyle="true",s3Url=${S3_URL} \
--credential s3-crendential=config \
--default \
s3-location
Backup storage location "s3-location" configured successfully.
$ velero create snapshot-location  --provider csi csi-location
Snapshot volume location "csi-location" configured successfully.
```

## 备份

```sh
$ velero backup create \
--include-namespaces default \
--include-resources persistentvolumeclaim,stetfulset,pod \
--snapshot-volumes \
--selector app=nginx \
--volume-snapshot-locations csi-location \
--storage-location s3-location \
nginx-backup

Backup request "nginx-backup" submitted successfully.
Run `velero backup describe nginx-backup` or `velero backup logs nginx-backup` for more details.
```

查看日志：

```sh
$ velero backup logs nginx-backup
...
time="2021-05-17T05:49:31Z" \
level=error msg="Error backing up item" \
backup=velero/nginx-backup \
error="error executing custom action (groupResource=persistentvolumeclaims, namespace=default, name=nginx-nginx-2): \
rpc error: code = Unknown \
desc = failed to get volumesnapshotclass for storageclass openebs-lvm: \
failed to get volumesnapshotclass for provisioner local.csi.openebs.io, \
ensure that the desired volumesnapshot class has the velero.io/csi-volumesnapshot-class label" \
error.file="/go/src/github.com/vmware-tanzu/velero/pkg/backup/item_backupper.go:331" \
error.function="github.com/vmware-tanzu/velero/pkg/backup.(*itemBackupper).executeActions" \
logSource="pkg/backup/backup.go:431" name=nginx-nginx-2
```

使用 CSI 作为 volume snapshot provider 是需要在 volumesnapshotclass 上增加 label `velero.io/csi-volumesnapshot-class`

文档[Container Storage Interface Snapshot Support in Velero](https://velero.io/docs/v1.6/csi/#installing-velero-with-csi-support)做了说明

## 还原

```sh
$ velero restore create \
--include-namespaces default \
--include-resources  persistentvolumeclaim \
--restore-volumes \
--from-backup nginx-backup \
--selector app=nginx\
nginx-restore
Restore request "nginx-restore" submitted successfully.
Run `velero restore describe nginx-restore` or `velero restore logs nginx-restore` for more details.
```
