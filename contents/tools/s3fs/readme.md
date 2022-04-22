# s3fs-docker

## reference

[s3fs-fuse](https://github.com/s3fs-fuse/s3fs-fuse)

## build

```bash
cd docker
docker build -t fatalc/f3fs:v1.85 .
```

## usage

| enviorment     | usage                    | example                     |
| -------------- | ------------------------ | --------------------------- |
| S3_ACCESS_KEY  | access key               |                             |
| S3_SECRET_KEY  | secret key               |
| S3_BUCKET_NAME | bucket                   | `bucket-foo`                |
| S3_BUCKET_PATH | path under bucket        | `/subpath`                  |
| MOUNT_POINT    | local mount point        | `/mnt/data`                 |
| S3_ENDPOINT    | s3 endpoint              | `https://region.s3.foo.bar` |
| S3_EXTRAVARS   | s3-fuse addtional params | `,curldbg`                  |

### docker

```sh
docker run -it --rm --name s3fs \
--device /dev/fuse --privileged \
-e S3_ENDPOINT=<endpoint url> \
-e S3_ACCESS_KEY=<access key> \
-e S3_SECRET_KEY=<secret key> \
-e S3_BUCKET_NAME=<bucket name> \
-e S3_BUCKET_PATH="/" \
-e S3_EXTRAVARS=",curldbg" \
-e MOUNT_POINT="/mnt/data" \
-v $PWD/data:/mnt/data \
fatalc/s3fs:v1.85
```

### kubernetes

Run with sidecar and `emptyDir`mount，sidecar provide s3fs filesystem sharing via emptyDir in POD .

See: [kubernetes.yaml](kubernetes.yaml)

> If using TLS protocol, ensure that the local time and server time are almost the same.
