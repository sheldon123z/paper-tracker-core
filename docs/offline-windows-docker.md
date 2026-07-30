# Windows Docker 离线部署

本文说明如何在联网构建机生成完整离线包，再将其传入无外网的 Windows
机器运行。联网只发生在构建阶段；离线运行阶段使用预构建镜像，Compose
配置禁止拉取镜像。

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

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Build-OfflineBundle.ps1 `
  -OutputDirectory D:\transfer\paper-tracker-offline-bundle `
  -ImageTag 2026-07-30
```

脚本在线构建 backend、Copilot runtime 和 gateway 三个 Linux 镜像，导出镜像
归档，并为归档和部署文件生成 `bundle-manifest.json` SHA-256 清单。目标目录
已存在时脚本默认拒绝覆盖；只有已识别的旧离线包才能用 `-Force` 替换，旧包
会保留为带时间戳的备份。

将整个 `paper-tracker-offline-bundle` 目录复制到移动介质。不要把构建机上的
`offline.env` 放进离线包。

## 3. 在离线 Windows 导入并启动

把完整目录复制到离线机，例如 `D:\paper-tracker-offline-bundle`，然后：

```powershell
Set-Location D:\paper-tracker-offline-bundle

powershell -ExecutionPolicy Bypass -File .\deploy\windows\Import-OfflineBundle.ps1
powershell -ExecutionPolicy Bypass -File .\deploy\windows\New-OfflineEnv.ps1
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Start-Offline.ps1
```

导入脚本在加载镜像前验证清单、文件大小和 SHA-256；加载后的镜像 ID 也必须
与清单一致。失败时脚本会恢复导入前的镜像标签。环境脚本使用系统加密随机数
生成 Fernet、JWT 和服务令牌，并将 `offline.env` ACL 限制为当前用户、
SYSTEM 和 Administrators。升级离线包时只更新镜像 tag，不轮换现有密钥。

启动完成后只访问：

```text
http://127.0.0.1:8080/
```

只有 gateway 发布 `127.0.0.1:8080`；backend、Copilot runtime 和
model-proxy 均无宿主机发布端口。所有应用容器使用 `pull_policy: never`，
backend 只有一个 Uvicorn worker，数据保存在命名卷
`paper-tracker-offline-data` 的 `/app/backend/data`。

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

## 8. 本轮验证边界

2026-07-30 的实现机器上，Docker CLI 和 Compose 可用，但 Docker Desktop
Linux engine 的 `docker info` 请求返回 `dockerDesktopLinuxEngine` API 500。
因此本轮只完成 Compose 渲染、脚本语法/单元测试和配置不变量等静态验证，未能
在该机器上完成真实镜像构建、Nginx 启动或命名卷备份/恢复 smoke test。交付
前必须在 Docker daemon 正常的 Windows/WSL2 Linux-container 环境执行上面的
完整离线验收清单。
