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

当前创新性讲解 Composition 为 252.5 秒（7575 帧），保持原有 49 段旁白文案，
并将“安全内生”设为第七部分、置于最后总结部分之前。2026-08-10 按下述固定火山
TTS 参数重新生成全片旁白后，正常语速实测需要比审片时间轴多 2.6 秒，因此只延长
必要场景和字幕时点，不对任何单句变速。旧 WAV 已按原哈希自动备份；已有 7022 帧
voiced 工作包仍是独立冻结的历史母版，不应与本版时间轴混用。

### 火山引擎统一旁白

本版 49 段创新性讲解字幕已获得明确的火山引擎 TTS 生成授权，授权范围、当前字幕
canonical JSON SHA-256、模型、音色、语速、响度和统一情绪提示固定记录在
`render-props/innovation-tts-authorization.json`。生成器拒绝处理授权、字幕或时间轴
不一致的输入，也不会自动改写文案、语速、音色或情绪参数。

先只探测第 1 段，确认账号授权、模型资源和音色均可用：

```powershell
npm.cmd run narration:innovation:probe
```

探测只生成并校验单段缓存，不发布正式 `final-mix.wav`。确认探测通过后，再串行
生成全片：

```powershell
npm.cmd run narration:innovation:generate
```

安全包装脚本会以隐藏输入方式读取凭据，只在当前子进程中设置
`VOLCENGINE_TTS_API_KEY`，并在结束时移除环境变量、释放显式分配的非托管凭据
缓冲区。PowerShell 运行期仍可能短暂创建无法保证立即物理清零的托管字符串；
API Key 不写入源码、授权文件、manifest、审计报告或日志。不要把凭据直接写进
命令行、PowerShell 历史、`.env` 或 `package.json`，也不要在不可信的共享主机
上执行生成流程。

生成可断点续跑；再次执行时会复用参数指纹、字幕哈希和文件哈希均一致的缓存。
离线复核缓存、manifest、分段音频指标及正式 WAV：

```powershell
npm.cmd run narration:innovation:verify
```

默认正式输出位于仓库外的
`../../video-assets/render-inputs/innovation-explainer/audio/final-mix.wav`；
可用 `VIDEO_ASSETS_DIR` 改变 `video-assets` 根目录。覆盖已有正式音频前会先备份。
分段 PCM、24 kHz 母版、manifest、审计报告、备份及最终 WAV 都属于 Git
忽略的本地媒体工作包；只提交生成脚本、授权元数据和配置，绝不提交音频或渲染
产物。

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
