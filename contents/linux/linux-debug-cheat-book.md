# linux debug

## fd leak

system fd usage :

```sh
$ cat /proc/sys/fs/file-max
$ cat /proc/sys/fs/file-nr
3008    0       9223372036854775807
# allocated  freed  limit
```

top 查看是否有超标使用内存或者 CPU 的进程,一般 FD 泄漏伴随着高用户内存占用。

查看 FD 使用最多的进程：

```sh
for pid in $(ps -e -o pid);do echo $(sudo ls /proc/${pid}/fd | wc -l) $pid;done | sort -n -r | head -n 20
```

查看进程使用的 FD(一般来说这一步会卡死，谨慎操作)

```sh
lsof -p <pid>
```

## memory leak
