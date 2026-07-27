# Paper Tracker Remotion 视频工程

`video/` 保存 Paper Tracker 两个介绍视频的 Remotion 源码、渲染脚本和验证入口：

- `PaperTrackerInnovationExplainer`：系统创新性介绍。
- `PaperTrackerWorkflowExplainer`：系统工作流程介绍。

两套 Composition 共用 `src/shared/`，业务场景分别位于：

```text
src/videos/innovation-explainer/
src/videos/workflow-explainer/
```

## 安装与检查

```powershell
npm.cmd ci
npm.cmd run assets:verify
npm.cmd run check
```

`assets:verify` 是本地严格门禁：会读取仓库外的
`video-assets/render-inputs`，检查素材存在性和 PCM 时长。GitHub CI 使用
`assets:verify:source`，只检查仓库内的时间轴、字幕、场景语义和素材路径声明；
它不会证明外部录屏、截图或音频母版存在或正确。

预览：

```powershell
npm.cmd run studio
```

## 创新介绍视频

画面审片：

```powershell
npm.cmd run render:innovation:stills
npm.cmd run render:innovation:review
```

当前正式音频生产只有一个无版本号入口：

```powershell
npm.cmd run render:innovation:voiced
npm.cmd run verify:innovation:voiced
```

该入口使用 `output/innovation-final/` 中锁定的画面、人声和配乐源，一次生成：

```text
output/paper-tracker-innovation-explainer-voiced-bgm.mp4
output/paper-tracker-innovation-explainer-voiced-no-bgm.mp4
```

两个成片使用完全相同的 2560×1440、30 fps、7022 帧 H.264/BT.709 画面码流以及同一份旁白母版。带配乐版使用 Scott Buckley 的 `Machinery of the Stars`，旁白区间自动 duck；无配乐版直接封装锁定的人声 PCM。两者都只进行一次 320 kbps AAC 编码。

`output/innovation-final/natural-final-audit-synced-bgm.json` 记录源文件哈希、PCM 指标、许可信息和两个成片的验证结果。

上述 `output/innovation-final/` 及成片均属于外部大文件工作包并被 Git
忽略，干净 checkout 不能仅凭仓库源码重新生成 voiced 成片。工作包必须通过
受控渠道单独取得，并满足脚本中记录的 SHA-256。`innovation-final.json`
记录输出帧数、源码时间轴哈希和跨平台规范化的源码指纹；finalizer 与 verifier
会拒绝使用与当前 Remotion 源码不匹配的旧母版。该指纹从当前版本开始防止继续
漂移，但不能追溯证明历史二进制最初由哪个 Git commit 渲染。

当前 205 秒 V2-10 Composition 仍处于静音审片阶段，外部
`innovation-explainer/audio/final-mix.wav` 尚未与该时间轴同步。获得明确
TTS 授权并更新音频前，`render:innovation` 的正式配音入口应保持锁定；已有
7022 帧 voiced 工作包是独立冻结的历史母版，不代表对当前审片文案的授权。

## 工作流程视频

```powershell
npm.cmd run render:workflow:stills
npm.cmd run render:workflow
```

## 通用渲染

```powershell
npm.cmd run render:innovation
npm.cmd run render:workflow
npm.cmd run render:all
```

Remotion 的 public 根目录由 `remotion.config.ts` 指向外部 `video-assets/render-inputs`。可通过 `VIDEO_ASSETS_DIR` 指定其他素材目录：

```powershell
$env:VIDEO_ASSETS_DIR = "D:\path\to\video-assets"
```

Studio、lint、类型检查和源码级素材声明校验可以在 Node.js 22+ 的各平台运行。
当前渲染封装使用 PowerShell、`npx.cmd` 和 Windows 的 `NUL` 设备，因此
`render:*` 命令仅支持 Windows；macOS/Linux 如需渲染，应直接调用 Remotion
CLI，或先补充等价的跨平台封装。
