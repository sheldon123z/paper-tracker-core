# Paper Tracker Remotion 视频工程

`video/` 只保存 Remotion 源码、渲染脚本和依赖清单。录屏、截图、豆包 TTS 旁白、无损混音、成片与质检输出统一放在工作树外的 `E:\Program\Pycharm\paper-tracker\video-assets`。

## 两个视频

| 用途           | Composition ID                    | 源码目录                           | 设计时长           | 最终处理                                    |
| -------------- | --------------------------------- | ---------------------------------- | ------------------ | ------------------------------------------- |
| 系统创新性讲解 | `PaperTrackerInnovationExplainer` | `src/videos/innovation-explainer/` | 4738 帧，157.93 秒 | 原速输出                                    |
| 系统流程讲解   | `PaperTrackerWorkflowExplainer`   | `src/videos/workflow-explainer/`   | 3826 帧，127.53 秒 | 画面与音频统一按 `0.88x` 输出，约 144.93 秒 |

两者都使用 1920×1080、30 fps 的设计画布，并渲染为 2560×1440。最终封装直接使用外部无损 PCM 混音，只做一次 320 kbps AAC 编码。

## 代码结构

```text
video/
├── src/
│   ├── Root.tsx
│   ├── shared/                         # 两个视频共用的品牌、主题与基础组件
│   └── videos/
│       ├── innovation-explainer/       # 系统创新性讲解
│       └── workflow-explainer/         # 系统流程讲解
├── scripts/
│   ├── verify-assets.mjs               # 外部素材完整性检查
│   ├── render-stills.ps1               # 分场景抽帧质检
│   └── render-video.ps1                # 渲染、变速与最终音频封装
├── remotion.config.ts
└── package.json
```

## 外部素材结构

Remotion 的 public 根通过 `Config.setPublicDir()` 直接指向 `video-assets/render-inputs`，不再复制大文件到 `video/public`，也不会把 TTS 源文件、历史成片或 QA 输出带进每次打包。

```text
video-assets/
├── render-inputs/                    # Remotion 运行时唯一读取的目录
│   ├── shared/
│   │   ├── recordings/
│   │   └── stills/
│   ├── innovation-explainer/
│   │   └── audio/final-mix.wav
│   └── workflow-explainer/
│       └── audio/final-mix.wav
├── shared/
│   ├── demo-papers/
│   └── fonts/
├── innovation-explainer/
│   ├── audio/
│   │   └── narration/
│   ├── renders/
│   └── qa/
├── workflow-explainer/
│   ├── audio/
│   │   └── narration/
│   ├── reference/
│   ├── renders/
│   └── qa/
└── archive/                         # 旧混音、旧 QA 与历史生产脚本
```

默认资产路径是仓库族同级的 `video-assets`。需要使用其他位置时，在当前 PowerShell 会话中设置：

```powershell
$env:VIDEO_ASSETS_DIR = "D:\path\to\video-assets"
```

## 安装与检查

```powershell
npm.cmd install
npm.cmd run assets:verify
npm.cmd run lint
npm.cmd run build
```

预览：

```powershell
npm.cmd run studio
```

## 渲染

系统创新性讲解：

```powershell
npm.cmd run render:innovation:stills
npm.cmd run render:innovation
```

系统流程讲解：

```powershell
npm.cmd run render:workflow:stills
npm.cmd run render:workflow
```

正式成片分别输出到：

```text
video-assets/innovation-explainer/renders/paper-tracker-innovation-explainer-2k.mp4
video-assets/workflow-explainer/renders/paper-tracker-workflow-explainer-2k.mp4
```

可复用的豆包 TTS 分段旁白、时间信息和同步审计数据保留在各视频的 `audio/narration/` 中。旧素材生产脚本原样归档在 `video-assets/archive/legacy-media-production-scripts/`，仅用于追溯原始生成过程；它们仍使用旧目录约定，不是当前 Remotion 渲染入口。
