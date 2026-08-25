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

当前重构版 Composition 为 192.6 秒（5778 帧），共 37 条字幕。
开场在 26.833333 秒内完成“攻关背景 → 科研痛点 → 对应解决方法 → 软件界面落地”：

- `scene-intro` 复用原总起表述，交代重大工程技术攻关进入更复杂阶段，以及资料更庞杂、技术迭代更快的背景；
- 总起页前两句沿用既有 PCM，仅将实际发音间隔由约 1.47 秒收紧至约 0.60 秒，并同步提前第二句对应画面；
- 第 1 部分先依次聚焦“分散论文、个人积累、被动查找”；
- 第 2 部分沿用同一矩阵连续绘制连线、逐行点亮“领域知识资产、组织工程创新能力、智能体按流程推进”，避免场景闪切；
- 方法矩阵保持全亮，最后一句“按流程推进”自然收尾后直接切入软件界面，不再保留空白停顿；
- 第 26.833333 秒进入原论文导入、本地解析、OCR、去重和资料域界面，仍比历史版本提前约 28 秒；
- 后续研究智能体、跨文献成果和安全内容保持原局部时长；
- Agentic Architecture 的 Tool Use 段精确移除 32 帧全零 PCM，将相邻实际发音间隔收至约 0.58 秒；“检索、筛选、分析、报告合成”及 Supervisor 调度动画按真实词序同步，不重新 TTS；
- 重复的 `scene-07` 已删除，“安全内生”仍为第 7 部分并位于最终总结前。

画面审片：

```powershell
npm.cmd run render:innovation:stills
npm.cmd run render:innovation:review
```

运行完整静音审片命令时，输出为：

```text
output/paper-tracker-innovation-explainer-agentic-tool-sync-v10-silent-review.mp4
```

### 火山引擎统一旁白

本版只调用火山 TTS 生成新 cue 1–5；后续节奏调整均离线复用这些 PCM，不重复请求 TTS。模型、音色、语速、响度、统一情绪提示、
37 条字幕和 5778 帧时间轴的 canonical SHA-256 均记录在
`render-props/innovation-tts-authorization.json`。生成参数固定为
`seed-tts-2.0`、温暖阿虎 2.0、`speech_rate=0`、`loudness_rate=0`；不对任何
单句做时伸缩。

使用可见 PowerShell 的遮蔽提示一次生成 5 句开场：

```powershell
npm.cmd run narration:innovation:opening
```

安全包装器把输出限制在 Git 忽略的 `output/innovation-opening-tts/`，拒绝写入
canonical bundle 或用户已确认的 v3 bundle。API Key 只在当前子进程中短暂存在，
不会进入命令行、日志、仓库、manifest 或持久环境。不要把凭据写入 `.env`、
`package.json` 或 PowerShell 历史。

生成后，按帧拼接新开场和已确认 v3 旁白：

```powershell
npm.cmd run narration:innovation:opening:rebind
npm.cmd run narration:innovation:opening:assemble
npm.cmd run narration:innovation:opening:verify
```

本次把第三部分提前到第 805 帧时，只使用 `--offline` 重新绑定既有 5 条开场
PCM 的字幕/时间轴元数据，再重新组装混合 WAV；不会调用 TTS 接口。除审计删除的
32 帧全零 PCM 外，用户已确认的开场、正文和片尾口播样本均逐样本复用。

拼接器固定核验以下复用块，并在 24 kHz 单声道层逐样本复制：

```text
正文前段 PCM SHA-256: C537AB938FFC7107C5E3BE27E42D6292EB9E4DA7454B69B901AF3739C7B1CCFB
正文后段 PCM SHA-256: 9E818B965E0FBA83E536601F11197CBEC867DA3D9CF43A7CACC1B051D6BF62FF
移除的全零 PCM SHA-256: 16FA66A7DC98D93F2A4C5D20BAF5177F59C4C37FC62FACE65690C11C15FE6FF9
拼接后正文 PCM SHA-256: 92C306E32C928872F483AF08D1BA1487954C3767D53CBF7DE9400C7931288195
片尾 PCM SHA-256: FAB093499CDB049B50AD647E4306A70F029CD987A21B52D469A333E2828ABFF3
```

这样可保留用户已确认的 AG-UI 连续读法，并证明 Tool Use 调整只删除了 32 帧全零
PCM。随后只对完整 24 kHz 母版做一次 48 kHz 双声道转换；审计会重新计算新 5 句
的窗口、至少 200 ms 间隔、削波、两段正文切片、移除区间和片尾的源/目标哈希，
以及两个 WAV 的完整哈希。

输出位于：

```text
output/innovation-opening-restructure/innovation-opening-restructure-master-24k-mono.wav
output/innovation-opening-restructure/innovation-opening-restructure-final-mix.wav
output/innovation-opening-restructure/innovation-opening-restructure-audit.json
```

现有外部 `render-inputs/innovation-explainer/audio/final-mix.wav` 仍是历史音频，
不能作为本重构版权威。正式渲染必须显式使用已审计的新 WAV：

```powershell
npm.cmd run render:innovation:voiced
npm.cmd run verify:innovation:voiced
```

内部 `render-video.ps1` 的可选 `-NarrationPath` 会先调用 hybrid verifier，随后
渲染无声画面母版并以 H.264 码流复制方式封装 48 kHz AAC。输出使用独立文件名：

```text
video-assets/innovation-explainer/renders/paper-tracker-innovation-explainer-opening-restructure-2k-raw.mp4
video-assets/innovation-explainer/renders/paper-tracker-innovation-explainer-opening-restructure-2k.mp4
```

`verify-innovation-video.mjs` 会核验当前动态字幕数量、时间轴/授权/音频审计绑定、
5778 帧画面、2560×1440/30 fps H.264/BT.709、48 kHz 双声道 AAC、画面码流
不变性、完整音视频解码和解码后削波。`innovation-final.json` 只记录实际渲染后
得到的画面母版、视频码流和源码指纹，不能沿用历史 7022 帧锁定值。

开场 PCM、WAV、manifest、审计、截图及 MP4 均在 Git 忽略目录；只提交 Remotion
源码、字幕、时间轴、脚本和授权元数据，不提交生成媒体。

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

不带 `-NarrationPath` 的 `render:innovation` 保留历史 canonical 入口，并继续要求
canonical manifest、audit 和外部 WAV 与当前授权完全一致；本重构版应使用上面的
`render:innovation:voiced`。

Remotion 的 public 根目录由 `remotion.config.ts` 指向外部
`video-assets/render-inputs`。可通过 `VIDEO_ASSETS_DIR` 指定其他素材目录：

```powershell
$env:VIDEO_ASSETS_DIR = "D:\path\to\video-assets"
```

Studio、lint、类型检查和源码级素材声明校验可以在 Node.js 22+ 的各平台运行。
当前渲染封装使用 PowerShell、`npx.cmd` 和 Windows 的 `NUL` 设备，因此
`render:*` 命令仅支持 Windows；macOS/Linux 如需渲染，应直接调用 Remotion
CLI，或先补充等价的跨平台封装。
