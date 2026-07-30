# Windows Docker 离线部署

本文说明如何在联网构建机生成完整离线包，再将其传入无外网的 Windows
机器运行。联网只发生在构建阶段；离线运行阶段使用预构建镜像，Compose
配置禁止拉取镜像。

> 如果 `bundle-manifest.json` 含有 `seed`，这是带账号和业务数据的完整安装包。
> 首次安装必须使用 `deploy\windows\Install-Offline.ps1`，并以
> `docs\offline-install-operations-zh.md` 为准；不要先手工启动空数据卷。

## 1. 前置条件

构建机和离线机都需要：

- 64 位 Windows、Docker Desktop 和 WSL2。
- Docker Desktop 切换到 **Linux containers**。
- PowerShell 5.1 或更高版本。

首次启用 WSL2、Virtual Machine Platform 或安装 Docker Desktop 后，如安装
程序提示重启或返回 `3010`，必须先重启 Windows，再继续验证。运行以下命令
应看到 `linux`：

```powershell
docker info --format "{{.OSType}}"
docker compose version
```

## 2. 在联网构建机生成离线包

生成不含账号和业务数据的空白离线包时，在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Build-OfflineBundle.ps1 `
  -OutputDirectory D:\transfer\paper-tracker-offline-bundle `
  -ImageTag 2026-07-30
```

生成带种子数据的完整安装包时，必须同时显式指定种子导出目录和它所属的
`data-import` 根目录：

```powershell
$dataImport = "D:\exports\data-import"
$seedExport = "D:\exports\data-import\paper-tracker-export-20260730"

powershell -ExecutionPolicy Bypass -File .\deploy\windows\Build-OfflineBundle.ps1 `
  -OutputDirectory D:\transfer\paper-tracker-seeded-bundle `
  -ImageTag 2026-07-30 `
  -SeedExportDirectory $seedExport `
  -DataImportDirectory $dataImport
```

`SeedExportDirectory` 必须是 `DataImportDirectory` 内的子目录，且包含受支持的
Paper Tracker backend 导出。构建器除了生成最小种子归档外，还会把
`DataImportDirectory` 的**全部内容原样复制**到离线包的 `src\`；同级的其他
导出、附件、账号数据、密码哈希、会话、审计记录和密钥文件也会一并进入包中。
因此应使用隔离且已经人工复核的 `data-import` 目录，并把整个种子包按最高敏感
级别保管。

脚本在线构建 backend、Copilot runtime 和 gateway 三个 Linux 镜像，导出镜像
归档，并为归档和部署文件生成 `bundle-manifest.json` SHA-256 清单。目标目录
已存在时脚本默认拒绝覆盖；只有已识别的旧离线包才能用 `-Force` 替换，旧包
会保留为带时间戳的备份。

系统包、Python 依赖、Node 依赖和前端产物都在这一阶段写入镜像，目标机不会
再执行 `apt`、`pip` 或 `npm` 安装。构建机需要直连国内镜像时，可在运行脚本
前设置 `PAPER_TRACKER_DEBIAN_MIRROR`、`PAPER_TRACKER_DEBIAN_SECURITY_MIRROR`
、`PAPER_TRACKER_PYPI_INDEX_URL` 和 `PAPER_TRACKER_NPM_REGISTRY`；未设置时
仍使用上游官方源。

将整个离线包目录复制到移动介质。不要另行把仓库或运行中部署的 `offline.env`
放进包根目录；构建器会生成仅含 `ENCRYPTION_KEY` 的安装专用
`data\import-encryption.env`，原始导出 `.env` 只保留在用户要求的完整 `src\` 副本中。
构建机上的 NTFS ACL 会限制为当前用户、SYSTEM 与 Administrators，但 ACL 不能可靠跨
FAT/exFAT、普通 U 盘复制或其他主机保留，因此转移介质必须使用 BitLocker 或等价加密。

`bundle-manifest.json.sha256` 和 manifest 内的 SHA-256 只能发现传输损坏，不能独立证明
介质真实性，因为攻击者可以同时替换文件和同介质校验值。只从可信交付方取得包，并通过独立
渠道核对最终 manifest SHA-256；需要抵抗恶意介质替换时，应另行采用组织可信根验证的 detached
signature。

## 3. 在离线 Windows 导入并启动

把完整目录复制到离线机，例如 `D:\paper-tracker-offline-bundle`，然后：

```powershell
Set-Location D:\paper-tracker-offline-bundle

powershell -ExecutionPolicy Bypass -File .\deploy\windows\Import-OfflineBundle.ps1
powershell -ExecutionPolicy Bypass -File .\deploy\windows\New-OfflineEnv.ps1
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Start-Offline.ps1
```

上述三条命令只适用于不含 `seed` 的空白离线包。带种子数据的包必须执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-Offline.ps1
```

空白包的 `Start-Offline.ps1`、`Stop-Offline.ps1` 和 `Status-Offline.ps1`
默认使用包内 `offline.env`；manifest 含 `seed` 时，三个脚本会一致使用离线包
同级的 `runtime\offline.env`，该文件由首次安装器创建。

导入脚本在加载镜像前验证清单、文件大小和 SHA-256；加载后的镜像 ID 也必须
与清单一致。失败时脚本会恢复导入前的镜像标签。环境脚本使用系统加密随机数
生成 Fernet、JWT 和服务令牌，并将 `offline.env` ACL 限制为当前用户、
SYSTEM 和 Administrators。升级离线包时只更新镜像 tag，不轮换现有密钥。

种子安装是不同的安全边界：构建器从安装用数据库副本中清空全部 `user_sessions`，
安装器只延续解密既有配置所必需的加密密钥，并生成新的 JWT 签名密钥和内部服务令牌。
源系统签发的 access/refresh 会话在**新离线部署中**都会失效，用户必须重新登录；这不会
远程注销仍运行的源系统，`src\` 原始副本也不作清理。安装器同时关闭公开注册。首次安装器
拒绝复用任何既有 runtime env，seeded `Start-Offline.ps1` 也绝不
为缺失的 env 生成替代密钥，避免旧 JWT 或随机加密密钥误配到已有数据卷。

启动完成后只访问：

```text
http://127.0.0.1:8080/
```

只有 gateway 发布 `127.0.0.1:8080`；backend、Copilot runtime 和
model-proxy 均无宿主机发布端口。所有应用容器使用 `pull_policy: never`，
backend 只有一个 Uvicorn worker，数据保存在命名卷
`paper-tracker-offline-data` 的 `/app/backend/data`。gateway 额外加入一个
关闭 IP masquerade 的独立入口 bridge，使 Docker Desktop 可以发布 loopback
端口，同时不为 gateway 提供出站 NAT。model-proxy 使用另一条关闭 IP
masquerade 的 bridge，只把请求转发到 `host.docker.internal` 上四个固定的
本地模型端口。

## 4. 首次注册后关闭注册

全新数据卷没有账号，`offline.env` 初始设置：

```dotenv
PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION=1
```

创建第一个本地管理员账号后，立即改为：

```dotenv
PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION=0
```

然后再次运行 `Start-Offline.ps1` 使配置生效。不要删除或重新生成
`ENCRYPTION_KEY`；它用于解密数据库中已保存的本地配置。刷新登录页后，
注册入口会通过后端运行时能力接口同步隐藏。

## 5. 本地模型

backend 位于无默认外部路由的 internal 网络，只能通过 model-proxy 访问
Windows 主机上的四个固定端口：

| 服务 | backend 中的地址 | Windows 端口 |
| --- | --- | ---: |
| Ollama | `http://model-proxy:11434` | 11434 |
| vLLM | `http://model-proxy:8000/v1` | 8000 |
| LM Studio | `http://model-proxy:1234/v1` | 1234 |
| llama.cpp | `http://model-proxy:30000/v1` | 30000 |

先启动所需的本地模型服务，并确保它能从 Docker Desktop 的
`host.docker.internal` 到达对应端口。无需使用的端口可以不启动服务。
model-proxy 不接受任意目标地址，并把上游重定向转换为 `502`，防止借重定向
绕过固定目标。离线配置默认不播种或联系任何云模型。

## 6. 备份与恢复

创建一致性备份：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Backup-OfflineData.ps1 `
  -BackupDirectory E:\paper-tracker-backups
```

脚本在持有该数据卷的互斥锁期间停止请求路径和唯一 backend writer，使用
backend UID/GID 归档命名卷，随后生成同名 `.sha256` 文件并恢复此前运行的
服务。

恢复前保留归档及其 `.sha256` 文件：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Restore-OfflineData.ps1 `
  -ArchivePath E:\paper-tracker-backups\paper-tracker-data-YYYYMMDD-HHMMSS-xxxxxxxx.tar.gz
```

恢复会先核对 SHA-256，并在 writer 停止后强制创建、校验和保留一份
`pre-restore` 安全备份，之后才事务性替换卷内容。交互确认不可跳过；自动化时
必须显式传 `-Force`。默认还会核对卷的项目/用途标签，只有人工确认旧卷身份后
才可使用 `-AllowMismatchedVolume` 覆盖此保护。

## 7. 离线验收清单

- `docker info --format "{{.OSType}}"` 返回 `linux`。
- 三个 `paper-tracker-*:<tag>` 镜像均已加载，启动过程没有 pull/build。
- `docker compose --env-file .\offline.env -f .\compose.offline.yml ps` 显示四个
  服务运行且健康。
- 浏览器可以通过 `http://127.0.0.1:8080/` 登录、读取论文并刷新 SPA 子路由。
- `docker compose ... port gateway 8080` 只显示 `127.0.0.1:8080`；backend、
  Copilot runtime 和 model-proxy 没有宿主机端口。
- `/api/` 请求到达 backend，`/api/copilotkit` 的流式请求可用。
- 配置的本地模型可通过对应固定端口完成一次真实推理；关闭模型服务后请求应
  在本机失败，不能转向云端。
- 创建一次备份并核对 `.sha256`；在测试数据卷完成一次恢复演练。
- 首个账号创建后注册已设为 `0` 并重启验证。

## 8. 本轮实机验证

2026-07-30 已在 Windows Docker Desktop 4.84.0、Linux Engine 29.6.2 和
Compose 5.3.1 上完成真实构建、镜像归档、清单校验、移除目标标签后的重新导入，
以及 `--no-build --pull never --wait` 启动。四个服务均为 healthy，宿主机只
发布 `127.0.0.1:8080`；backend 的 internal 网络公网探测失败，RSS 和调度 API
在离线模式下返回 404，登录/注册页面及 SPA 静态资源均可从 loopback 网关加载。
构建时已清空宿主代理环境，并通过显式配置的 Debian、PyPI 和 npm 直连镜像源
完成依赖层；目标部署阶段没有执行 `apt`、`pip` 或 `npm`。

Docker Desktop 4.84.0 的实测还表明，即使 bridge 关闭 IP masquerade，
gateway 和 model-proxy 仍可能经 Desktop 内部网络传输访问公网域名。因此该
选项只能作为减少普通出站 NAT 的纵深措施，不能当作 Windows 防火墙。两个
Nginx 容器没有非空代理环境、使用只读根文件系统且只运行固定配置；若部署要求
严格气隙，仍应让 Windows 主机断开外网或由主机防火墙实施组织级出站限制。

本机的 11434、8000、1234 和 30000 端口没有本地模型服务，因此真实模型推理
仍需在目标环境启动对应服务后验收。命名卷备份脚本和归档单元测试已通过，但
本轮没有对用户测试卷执行恢复演练，避免在首次功能测试前替换数据。
