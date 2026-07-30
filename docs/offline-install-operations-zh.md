# Paper Tracker Windows 离线安装与运维

本文面向已经拿到“带种子数据的离线包”的 Windows 运维人员。以下示例把完整离线包放在
`D:\PaperTracker\bundle`。安装器会把运行时配置写到离线包同级的
`D:\PaperTracker\runtime\offline.env`，不会把密钥写回可分发的离线包。

推荐目录结构：

```text
D:\PaperTracker\
├── bundle\                         # 完整离线包，只读保存
├── runtime\
│   └── offline.env                 # 安装器创建，含运行时密钥
└── backups\                        # 人工指定的业务数据备份目录
```

## 1. 敏感数据警告

带种子数据的离线包不是普通安装介质。包内的 `data\seed-data.tar.gz` 和
`src\...`（原 `data-import` 目录的完整副本）包含数据库、论文附件、账户及认证相关数据、审计记录，
并包含用于解密既有配置的密钥来源文件。安装后生成的 `runtime\offline.env`、日常备份和
恢复前安全备份同样属于敏感数据。

- 不要把离线包、`offline.env` 或备份上传到网盘、代码仓库、工单或聊天工具。
- 只把介质交给被授权的运维人员，并使用受控磁盘和主机账户保存。
- 不要在终端、截图或日志中打印 `ENCRYPTION_KEY`、`JWT_SECRET_KEY` 或令牌值。
- 介质报废和备份清理应遵循本单位的敏感数据销毁制度。

## 2. 构建带种子数据的离线包（交付方）

在联网构建机的仓库根目录执行以下命令；两个来源目录必须同时显式传入：

```powershell
$dataImport = "D:\exports\data-import"
$seedExport = "D:\exports\data-import\paper-tracker-export-20260730"

powershell -ExecutionPolicy Bypass -File .\deploy\windows\Build-OfflineBundle.ps1 `
  -OutputDirectory D:\transfer\paper-tracker-seeded-bundle `
  -ImageTag 2026-07-30 `
  -SeedExportDirectory $seedExport `
  -DataImportDirectory $dataImport
```

`SeedExportDirectory` 必须位于 `DataImportDirectory` 内，不能指向它的外部或与它并列。
前者是用于生成最小种子归档的单次 backend 导出；构建器还会把后者的**全部内容原样复制**
到包内 `src\`。这意味着 `DataImportDirectory` 中与本次导出并列的其他目录、附件、账号
数据、密码哈希、会话、审计记录和密钥也会进入交付包。构建前应把所需输入放进单独目录并逐项
复核，构建后则必须把整个包作为敏感账户数据保管。

不要手工向包根目录复制运行中的 `offline.env`。构建器会从已验证的导出中生成仅含
`ENCRYPTION_KEY` 的 `data\import-encryption.env`，manifest 的 `secretSource` 只指向
这个安装专用文件；原始 `.env` 仍仅作为用户要求的完整 `src\` 副本保存。

构建器会在 NTFS 上把 staging 和最终目录的 ACL 收紧为当前用户、SYSTEM 与 Administrators，
但 ACL 不能可靠跨 FAT/exFAT、普通 U 盘复制或其他 Windows 主机保留。转移介质应使用
BitLocker 或等价的全盘/归档加密。`bundle-manifest.json.sha256` 和包内 SHA-256 清单只用于
发现传输损坏；它们与文件位于同一介质，不能证明介质未被恶意替换。必须从可信交付方取得包，
并通过独立渠道核对最终 manifest SHA-256。

## 3. 启动并检查 Docker Desktop

从 Windows 开始菜单启动 Docker Desktop，等待托盘图标显示引擎已经运行。Docker
Desktop 必须使用 Linux 容器。打开 PowerShell，执行：

```powershell
docker desktop start --timeout 180
docker info --format "{{.OSType}}"
docker compose version
```

`docker desktop start` 会等待引擎启动；`docker info` 必须返回 `linux`，最后一条命令必须
正常显示 Compose 版本。若 Docker Desktop
刚安装、刚启用 WSL2，或安装程序提示重启/返回 `3010`，请先重启 Windows，再继续安装。

## 4. 首次安装

首次安装只能用于尚未创建目标 Compose 项目和数据卷的主机。不要用它覆盖或升级现有部署。

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Install-Offline.ps1
```

安装器会按以下顺序执行：

1. 校验 `bundle-manifest.json`、种子归档、种子元数据和来源路径。
2. 确认目标 Compose 项目没有容器、目标数据卷尚不存在；发现任一既有对象即拒绝继续。
3. 校验并导入三个离线镜像，不执行在线拉取。
4. 从 manifest 指定的 `secretSource` 只导入解密既有配置所必需的加密密钥，在同级
   `runtime\offline.env` 中生成新的 JWT 签名密钥和内部服务令牌，并把公开注册固定为关闭。
5. 使用 `docker compose create --no-build --pull never` 创建但不启动容器和数据卷。
6. 把已校验的种子归档恢复到新数据卷，然后启动服务并等待健康检查。

成功后只通过以下本机地址访问：

```text
http://127.0.0.1:8080/
```

种子数据已经包含账户，因此安装器不会开放公开注册。构建器会从安装用数据库副本中清空全部
`user_sessions`，安装时还会轮换 JWT 签名密钥；源系统签发的 access/refresh 会话在新离线
部署中均失效。
这里的“失效”只针对新离线部署，不会远程注销仍在运行的源系统；`src\` 中的原始完整副本也
仍保留原记录。请使用随种子数据交付的既有账户在离线部署上重新登录。

若安装失败，错误消息会指出失败阶段。安装器会尽量停止本次安装中部分启动的服务，但不会自动
删除已经创建的容器、数据卷、恢复数据、运行时环境文件或恢复前安全备份。只有失败发生在生成
`runtime\offline.env` 之前，且目标容器/卷均不存在时，才可修正原因后直接重跑。一旦已经产生
运行时文件、容器或数据卷，请先保留现场并诊断，不要为了重跑安装而删除数据。

## 5. 日常启动

先启动 Docker Desktop 并确认 Linux 引擎可用，然后执行：

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Start-Offline.ps1 `
  -EnvFile D:\PaperTracker\runtime\offline.env
```

脚本只使用本地镜像，以 `--no-build --pull never` 启动服务并等待健康检查。
manifest 含 `seed` 时，`Start-Offline.ps1`、`Stop-Offline.ps1` 和
`Status-Offline.ps1` 默认一致读取离线包同级的 `runtime\offline.env`；不含 seed 的
普通空白包仍默认使用包内 `offline.env`。三个运维脚本都可通过 `-EnvFile` 指向**已经存在且
经过验证**的运行时文件；对 seeded bundle，`Start-Offline.ps1` 绝不会为缺失路径生成替代密钥，
必须先由 `Install-Offline.ps1` 完成首次安装。

## 6. 查看状态

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Status-Offline.ps1
```

默认读取离线包同级的 `runtime\offline.env`，显示 Compose 项目、数据卷、所有容器的运行/
健康状态，并检查 loopback 网关是否可访问。也可以显式传入：

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Status-Offline.ps1 `
  -EnvFile D:\PaperTracker\runtime\offline.env
```

Docker Desktop 未运行时，状态脚本会明确报错，而不是把引擎不可达误报为“服务已停止”。

## 7. 停止 Paper Tracker

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Stop-Offline.ps1
```

该命令停止全部 Paper Tracker 容器，但保留容器、网络、镜像和命名数据卷。下次使用
`Start-Offline.ps1` 即可继续运行。需要使用非默认运行时文件时，传入
`-EnvFile <路径>`。

## 8. 完全退出 Docker Desktop

`Stop-Offline.ps1` 只停止 Paper Tracker，不会退出 Docker Desktop。需要完全关闭 Docker
时：

1. 先运行 `Stop-Offline.ps1`，确认应用容器已经停止。
2. 执行 `docker desktop stop --timeout 180`；也可以右键 Windows 通知区域中的 Docker
   鲸鱼图标，选择 **Quit Docker Desktop**（退出 Docker Desktop）。
3. 等待托盘图标消失。此时再次执行 `docker info` 应报告 Docker 引擎不可达。

不要在应用仍写入数据时直接结束 Docker/WSL 进程或强制关机。下次使用时，先重新启动 Docker
Desktop并确认引擎返回 `linux`，再运行 `Start-Offline.ps1`。

## 9. 备份

创建一致性备份：

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Backup-OfflineData.ps1 `
  -EnvFile D:\PaperTracker\runtime\offline.env `
  -BackupDirectory D:\PaperTracker\backups
```

备份脚本会临时停止请求入口和唯一的 backend 写入者，生成
`paper-tracker-data-*.tar.gz` 及同名 `.sha256`，然后只恢复备份前正在运行的服务。请把归档
和 `.sha256` 一起保存，并按敏感账户数据管理。

备份完成后，核对输出路径和 SHA-256 文件，定期在隔离的测试部署上演练恢复。不要只验证文件
存在。

## 10. 恢复

恢复会替换目标数据卷中的业务数据。先确认归档和 `.sha256` 来自可信备份，并确认
`-EnvFile` 指向正确部署：

```powershell
Set-Location D:\PaperTracker\bundle

powershell -ExecutionPolicy Bypass `
  -File .\deploy\windows\Restore-OfflineData.ps1 `
  -EnvFile D:\PaperTracker\runtime\offline.env `
  -ArchivePath D:\PaperTracker\backups\paper-tracker-data-YYYYMMDD-HHMMSS-xxxxxxxx.tar.gz
```

交互式确认不要跳过。脚本会先校验来源 SHA-256，停止写入者，创建并验证一份强制的
`pre-restore` 安全备份，然后事务式替换数据；最后只恢复操作前正在运行的服务。自动化场景
只有在调用方已经完成等价的人工作业确认时才可显式使用 `-Force`。

恢复完成后运行 `Status-Offline.ps1`，登录并抽查账户、论文、附件和关键配置。

## 11. 严禁破坏数据卷

不要对本部署执行以下命令或等价操作：

```powershell
docker compose down -v
docker volume rm paper-tracker-offline-data
docker volume prune
docker system prune --volumes
```

`down -v` 和带卷的 prune 会删除承载全部业务数据的命名卷；普通 prune 也可能删除离线环境
无法重新下载的镜像。日常停机只使用 `Stop-Offline.ps1`，不要使用任何 prune 命令。

若出现安装中断、容器异常或卷标签不匹配，先保留现有卷和备份，再收集以下只读信息：

```powershell
docker volume ls
docker container ls --all --filter "label=com.docker.compose.project=paper-tracker-offline"
```

未经备份和明确审批，不要删除、重建、重命名或手工挂载修改现有数据卷。
