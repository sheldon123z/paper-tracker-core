import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const assetRoot = path.resolve(
  process.env.VIDEO_ASSETS_DIR ||
    path.join(projectRoot, "..", "..", "video-assets"),
);
const renderInputRoot = path.join(assetRoot, "render-inputs");

const sharedRecordings = [
  "shared/recordings/01-dashboard-overview.mp4",
  "shared/recordings/02-import-open.mp4",
  "shared/recordings/03-import-analyzing.mp4",
  "shared/recordings/04-import-review.mp4",
  "shared/recordings/05-import-result.mp4",
  "shared/recordings/06-library-scope.mp4",
  "shared/recordings/07-library-search.mp4",
  "shared/recordings/08-2-paper-analyze.mp4",
  "shared/recordings/08-paper-reading.mp4",
  "shared/recordings/09-assistant-query.mp4",
  "shared/recordings/10-assistant-result.mp4",
  "shared/recordings/12-workflow-templates_running.mp4",
  "shared/recordings/14-workflow-result.mp4",
  "shared/recordings/15-access-control.mp4",
];

const sharedStills = [
  "shared/stills/department-library.png",
  "shared/stills/final-report.png",
  "shared/stills/local-model-status.png",
  "shared/stills/public-library.png",
];

const assetsByVideo = {
  innovation: [
    "innovation-explainer/audio/final-mix.wav",
    "shared/stills/department-library.png",
    "shared/stills/public-library.png",
    "shared/recordings/03-import-analyzing.mp4",
    "shared/recordings/04-import-review.mp4",
    "innovation-explainer/recordings/high-altitude-workflow-running.mp4",
    "innovation-explainer/recordings/high-altitude-workflow-result.mp4",
    "shared/recordings/15-access-control.mp4",
  ],
  workflow: [
    "workflow-explainer/audio/final-mix.wav",
    ...sharedStills,
    ...sharedRecordings,
  ],
};

const audioByVideo = {
  innovation: {
    path: "innovation-explainer/audio/final-mix.wav",
    timeline: "src/videos/innovation-explainer/data/timeline.json",
  },
  workflow: {
    path: "workflow-explainer/audio/final-mix.wav",
    timeline: "src/videos/workflow-explainer/data/timeline.json",
  },
};

const args = process.argv.slice(2);
const reviewMode = args.includes("--review");
const sourceOnly = args.includes("--source-only");
const normalizedArgs = args.filter(
  (arg) => arg !== "--review" && arg !== "--source-only",
);
const videoFlagIndex = normalizedArgs.indexOf("--video");
const selectedVideo =
  videoFlagIndex === -1 ? null : (normalizedArgs[videoFlagIndex + 1] ?? null);

if (
  (videoFlagIndex !== -1 && !selectedVideo) ||
  (selectedVideo && !(selectedVideo in assetsByVideo)) ||
  normalizedArgs.length !== (selectedVideo ? 2 : 0) ||
  (reviewMode && selectedVideo !== "innovation")
) {
  console.error(
    "Usage: node scripts/verify-assets.mjs [--video innovation|workflow] [--review] [--source-only]",
  );
  process.exit(1);
}

const selectedVideos = selectedVideo
  ? [selectedVideo]
  : Object.keys(assetsByVideo);
const requiredAssets = [
  ...new Set(selectedVideos.flatMap((video) => assetsByVideo[video])),
].filter((relativePath) => !reviewMode || !relativePath.endsWith(".wav"));

const missing = sourceOnly
  ? requiredAssets
  : requiredAssets.filter((relativePath) => {
      const filePath = path.join(renderInputRoot, relativePath);
      if (!fs.existsSync(filePath)) {
        return true;
      }
      const stats = fs.statSync(filePath);
      return !stats.isFile() || stats.size === 0;
    });

if (missing.length > 0 && !sourceOnly) {
  console.error(`Video render input root: ${renderInputRoot}`);
  for (const relativePath of missing) {
    console.error(`Missing: ${relativePath}`);
  }
  process.exit(1);
}

const readPcmWave = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("not a RIFF/WAVE file");
  }

  let format = null;
  let dataBytes = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > buffer.length) {
      throw new Error(`truncated ${chunkId} chunk`);
    }

    if (chunkId === "fmt " && chunkSize >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!format || dataBytes === null) {
    throw new Error("missing fmt or data chunk");
  }
  if (format.blockAlign < 1 || dataBytes % format.blockAlign !== 0) {
    throw new Error("invalid PCM block alignment");
  }

  return { ...format, samples: dataBytes / format.blockAlign };
};

for (const video of reviewMode ? [] : selectedVideos) {
  const requirement = audioByVideo[video];
  const audioPath = path.join(renderInputRoot, requirement.path);
  if (sourceOnly) {
    continue;
  }
  const timeline = JSON.parse(
    fs.readFileSync(path.join(projectRoot, requirement.timeline), "utf8"),
  );
  const expectedSamples = (timeline.durationInFrames * 48000) / timeline.fps;
  if (!Number.isInteger(expectedSamples) || expectedSamples < 1) {
    console.error(`Invalid timeline PCM duration: ${requirement.timeline}`);
    process.exit(1);
  }
  let wave;
  try {
    wave = readPcmWave(audioPath);
  } catch (error) {
    console.error(`Invalid clean mix: ${requirement.path}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const valid =
    wave.audioFormat === 1 &&
    wave.channels === 2 &&
    wave.sampleRate === 48000 &&
    wave.bitsPerSample === 16 &&
    wave.samples === expectedSamples;
  if (!valid) {
    console.error(`Invalid clean mix: ${requirement.path}`);
    console.error(
      `Expected PCM s16le, 48000 Hz, stereo, ${expectedSamples} samples; ` +
        `received format=${wave.audioFormat}, ${wave.bitsPerSample}-bit, ${wave.sampleRate} Hz, ` +
        `${wave.channels} channels, ${wave.samples} samples.`,
    );
    process.exit(1);
  }
}

const validateInnovationReviewData = () => {
  const timelinePath = path.join(
    projectRoot,
    "src/videos/innovation-explainer/data/timeline.json",
  );
  const captionsPath = path.join(
    projectRoot,
    "src/videos/innovation-explainer/data/captions.json",
  );
  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));

  if (timeline.fps !== 30 || timeline.durationInFrames !== 7497) {
    throw new Error(
      `Innovation voiced timeline must be exactly 7497 frames at 30 fps; ` +
        `received ${timeline.durationInFrames} frames at ${timeline.fps} fps.`,
    );
  }

  const expectedSceneOrder = [
    "scene-intro",
    "scene-06",
    "scene-00",
    "scene-01",
    "scene-02",
    "scene-04",
    "scene-architecture",
    "scene-03",
    "scene-07",
    "scene-outro",
  ];
  const actualSceneOrder = timeline.scenes.map((scene) => scene.id);
  if (
    actualSceneOrder.length !== expectedSceneOrder.length ||
    actualSceneOrder.some(
      (sceneId, index) => sceneId !== expectedSceneOrder[index],
    )
  ) {
    throw new Error(
      `Innovation review scene order must put security-by-design first: ` +
        `${expectedSceneOrder.join(" -> ")}.`,
    );
  }

  let nextStartFrame = 0;
  for (const scene of timeline.scenes) {
    if (scene.startFrame !== nextStartFrame || scene.durationInFrames < 1) {
      throw new Error(`Non-contiguous innovation scene timing: ${scene.id}.`);
    }
    nextStartFrame += scene.durationInFrames;
  }
  if (nextStartFrame !== timeline.durationInFrames) {
    throw new Error(
      `Innovation scene frames end at ${nextStartFrame}, expected ${timeline.durationInFrames}.`,
    );
  }

  const durationMs = (timeline.durationInFrames / timeline.fps) * 1000;
  let previousEndMs = 0;
  if (captions.length > 50) {
    throw new Error(
      `Innovation review captions must stay at or below 50 cues; received ${captions.length}.`,
    );
  }
  for (const [index, caption] of captions.entries()) {
    const captionDuration = caption.endMs - caption.startMs;
    const validCaption =
      typeof caption.text === "string" &&
      caption.text.trim().length > 0 &&
      caption.text.length <= 40 &&
      Number.isFinite(caption.startMs) &&
      Number.isFinite(caption.endMs) &&
      caption.startMs >= previousEndMs &&
      caption.endMs <= durationMs &&
      captionDuration >= 2500 &&
      captionDuration <= 7000 &&
      caption.timestampMs === null &&
      caption.confidence === null;
    if (!validCaption) {
      throw new Error(`Invalid innovation review caption at index ${index}.`);
    }
    previousEndMs = caption.endMs;
  }

  for (const scene of timeline.scenes) {
    const sceneStartMs = (scene.startFrame / timeline.fps) * 1000;
    const sceneEndMs =
      ((scene.startFrame + scene.durationInFrames) / timeline.fps) * 1000;
    const sceneCaptions = captions.filter(
      (caption) =>
        caption.startMs >= sceneStartMs && caption.endMs <= sceneEndMs,
    );
    if (sceneCaptions.length === 0) {
      throw new Error(`Innovation review scene has no captions: ${scene.id}.`);
    }
  }

  return captions.length;
};

const validateInnovationEvidenceSources = () => {
  const expectedMediaSources = new Map([
    [
      "S02KnowledgeAssets.tsx",
      [
        "shared/recordings/03-import-analyzing.mp4",
        "shared/recordings/04-import-review.mp4",
        "shared/stills/public-library.png",
        "shared/stills/department-library.png",
      ],
    ],
    [
      "S04ResearchAgentCore.tsx",
      [
        "innovation-explainer/recordings/high-altitude-workflow-running.mp4",
        "innovation-explainer/recordings/high-altitude-workflow-result.mp4",
      ],
    ],
    [
      "S03EvidenceSynthesis.tsx",
      ["innovation-explainer/recordings/high-altitude-workflow-result.mp4"],
    ],
    ["S06SafeGovernance.tsx", ["shared/recordings/15-access-control.mp4"]],
  ]);
  const sceneRoot = path.join(
    projectRoot,
    "src/videos/innovation-explainer/scenes",
  );
  const mediaPattern =
    /(?:shared|innovation-explainer)\/(?:recordings|stills)\/[^"'`)\s]+/g;

  for (const [sceneFile, expectedSources] of expectedMediaSources) {
    const sceneSource = fs.readFileSync(
      path.join(sceneRoot, sceneFile),
      "utf8",
    );
    const mediaSources = new Set(sceneSource.match(mediaPattern) ?? []);
    const expected = new Set(expectedSources);
    const missing = [...expected].filter((source) => !mediaSources.has(source));
    const unexpected = [...mediaSources].filter(
      (source) => !expected.has(source),
    );
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(
        `Innovation review scene ${sceneFile} has mismatched evidence sources. ` +
          `Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`,
      );
    }
  }
};

const validateInnovationEvidenceSemantics = () => {
  const sceneRoot = path.join(
    projectRoot,
    "src/videos/innovation-explainer/scenes",
  );
  const rules = [
    {
      file: "S02KnowledgeAssets.tsx",
      required: [
        /PROCESS SCHEMATIC · 流程示意/,
        /真实服务页面/,
        /03-import-analyzing\.mp4/,
        /04-import-review\.mp4/,
        /public-library\.png/,
        /department-library\.png/,
      ],
      forbidden: [],
    },
    {
      file: "S04ResearchAgentCore.tsx",
      required: [
        /研究智能体正在按流程执行/,
        /任务拆解/,
        /报告合成/,
        /报告生成完成/,
        /高海拔地区电力设备选型/,
        /high-altitude-workflow-running\.mp4/,
        /high-altitude-workflow-result\.mp4/,
        /专家在环/,
      ],
      forbidden: [/HUMAN-IN-THE-LOOP/, /CompletedReportCanvas/],
    },
    {
      file: "S05AgentArchitecture.tsx",
      required: [
        /Agentic Workflow/,
        /LangGraph/,
        /Supervisor/,
        /Tool Use/,
        /const toolReveal = revealValue\(frame, TOOL_USE_REVEAL_FRAME\)/,
        /opacity: toolReveal/,
        /Checkpoint/,
        /AG-UI/,
      ],
      forbidden: [],
    },
    {
      file: "S03EvidenceSynthesis.tsx",
      required: [
        /技术路线/,
        /结论差异/,
        /约束与空白/,
        /结构化综述初稿/,
        /高海拔地区电力设备选型/,
        /high-altitude-workflow-result\.mp4/,
        /真实工作流页面/,
      ],
      forbidden: [
        /ServiceReportCanvas/,
        /REPORT_SECTIONS/,
        /10-assistant-result\.mp4/,
        /final-report\.png/,
      ],
    },
    {
      file: "S06SafeGovernance.tsx",
      required: [
        /目标部署架构/,
        /授权边界与资料域隔离/,
        /用户与智能体同一边界/,
        /部门资料域隔离/,
        /非本部门用户默认不可见/,
        /未经授权不得访问、调用或流转/,
        /部门与账号/,
        /会话与审计/,
        /AI 调用与使用统计/,
      ],
      forbidden: [/PageFocusHighlights/, /GOVERNANCE_FOCUS/],
    },
  ];

  for (const { file, required, forbidden } of rules) {
    const source = fs.readFileSync(path.join(sceneRoot, file), "utf8");
    for (const pattern of required) {
      if (!pattern.test(source)) {
        throw new Error(
          `Innovation review scene ${file} is missing semantic evidence: ${pattern}.`,
        );
      }
    }
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        throw new Error(
          `Innovation review scene ${file} reintroduced a mismatched visual label: ${pattern}.`,
        );
      }
    }
  }
};

const validateInnovationMotionSemantics = () => {
  const sceneRoot = path.join(
    projectRoot,
    "src/videos/innovation-explainer/scenes",
  );
  const forbiddenDecorativeMotion = [
    {
      file: "S02KnowledgeAssets.tsx",
      patterns: [/\bfocusLeft\b/, /\bscopePathProgress\b/],
    },
    {
      file: "S03EvidenceSynthesis.tsx",
      patterns: [
        /\bscanTop\b/,
        /\bscanOpacity\b/,
        /width:\s*`\$\{progress\s*\*\s*100\}%`/,
      ],
    },
    {
      file: "S04ResearchAgentCore.tsx",
      patterns: [/TRACE_PROGRESS_/, /width:\s*`\$\{progress\s*\*\s*100\}%`/],
    },
    {
      file: "S05AgentArchitecture.tsx",
      patterns: [/width:\s*`\$\{progress\s*\*\s*100\}%`/],
    },
  ];

  for (const { file, patterns } of forbiddenDecorativeMotion) {
    const source = fs.readFileSync(path.join(sceneRoot, file), "utf8");
    for (const pattern of patterns) {
      if (pattern.test(source)) {
        throw new Error(
          `Innovation review scene ${file} reintroduced decorative progress motion: ${pattern}.`,
        );
      }
    }
  }
};

const validateInnovationSubtitleLayout = () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "src/shared/components/SubtitleTrack.tsx"),
    "utf8",
  );
  const required = [
    /splitBalancedSubtitle/,
    /whiteSpace:\s*"nowrap"/,
    /wordBreak:\s*"keep-all"/,
  ];

  for (const pattern of required) {
    if (!pattern.test(source)) {
      throw new Error(
        `Innovation review subtitle layout is missing orphan-line protection: ${pattern}.`,
      );
    }
  }
};

const validateInnovationServicePositioning = () => {
  const innovationRoot = path.join(
    projectRoot,
    "src/videos/innovation-explainer",
  );
  const sceneRoot = path.join(innovationRoot, "scenes");
  const sourcePaths = [
    path.join(innovationRoot, "brand.ts"),
    path.join(innovationRoot, "data/scenes.ts"),
    path.join(innovationRoot, "data/captions.json"),
    ...fs
      .readdirSync(sceneRoot)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => path.join(sceneRoot, file)),
  ];
  const sources = sourcePaths.map((sourcePath) => ({
    sourcePath,
    source: fs.readFileSync(sourcePath, "utf8"),
  }));
  const forbiddenTerms = [/国家电网/u, /平台/u, /软件/u, /系统/u];

  for (const { sourcePath, source } of sources) {
    for (const pattern of forbiddenTerms) {
      if (pattern.test(source)) {
        throw new Error(
          `Innovation service copy contains forbidden positioning in ${path.relative(projectRoot, sourcePath)}: ${pattern}.`,
        );
      }
    }
  }

  const combinedSource = sources.map(({ source }) => source).join("\n");
  const requiredTerms = [
    /专业领域大模型智能文献检索与知识服务/u,
    /重大工程技术/u,
    /知识服务/u,
  ];
  for (const pattern of requiredTerms) {
    if (!pattern.test(combinedSource)) {
      throw new Error(
        `Innovation service copy is missing required positioning: ${pattern}.`,
      );
    }
  }
};

const validateTimelineStructure = (video) => {
  const timelineRelativePath = audioByVideo[video].timeline;
  const timelinePath = path.join(projectRoot, timelineRelativePath);
  const captionsPath = path.join(path.dirname(timelinePath), "captions.json");
  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));

  if (
    !Number.isInteger(timeline.fps) ||
    timeline.fps < 1 ||
    !Number.isInteger(timeline.durationInFrames) ||
    timeline.durationInFrames < 1 ||
    !Array.isArray(timeline.scenes) ||
    timeline.scenes.length === 0 ||
    !Array.isArray(captions)
  ) {
    throw new Error(`Invalid ${video} timeline or captions JSON.`);
  }

  const sceneIds = new Set();
  let nextStartFrame = 0;
  for (const scene of timeline.scenes) {
    if (
      typeof scene.id !== "string" ||
      scene.id.length === 0 ||
      sceneIds.has(scene.id) ||
      !Number.isInteger(scene.startFrame) ||
      !Number.isInteger(scene.durationInFrames) ||
      scene.startFrame !== nextStartFrame ||
      scene.durationInFrames < 1
    ) {
      throw new Error(`Invalid or non-contiguous ${video} scene: ${scene.id}.`);
    }
    sceneIds.add(scene.id);
    nextStartFrame += scene.durationInFrames;
  }
  if (nextStartFrame !== timeline.durationInFrames) {
    throw new Error(
      `${video} scenes end at ${nextStartFrame}; expected ${timeline.durationInFrames}.`,
    );
  }

  const durationMs = (timeline.durationInFrames / timeline.fps) * 1000;
  let previousEndMs = 0;
  for (const [index, caption] of captions.entries()) {
    if (
      typeof caption.text !== "string" ||
      caption.text.trim().length === 0 ||
      !Number.isFinite(caption.startMs) ||
      !Number.isFinite(caption.endMs) ||
      caption.startMs < previousEndMs ||
      caption.endMs <= caption.startMs ||
      caption.endMs > durationMs + 1
    ) {
      throw new Error(`Invalid ${video} caption at index ${index}.`);
    }
    previousEndMs = caption.endMs;
  }

  for (const asset of assetsByVideo[video]) {
    if (
      path.isAbsolute(asset) ||
      asset.includes("\\") ||
      asset.split("/").includes("..")
    ) {
      throw new Error(`Unsafe ${video} asset declaration: ${asset}.`);
    }
  }
  return captions.length;
};

const sourceCaptionCounts = Object.fromEntries(
  selectedVideos.map((video) => [video, validateTimelineStructure(video)]),
);
let reviewCaptionCount = null;
if (selectedVideos.includes("innovation")) {
  validateInnovationServicePositioning();
}
if (selectedVideos.includes("innovation") && reviewMode) {
  validateInnovationEvidenceSources();
  validateInnovationEvidenceSemantics();
  validateInnovationMotionSemantics();
  validateInnovationSubtitleLayout();
  reviewCaptionCount = validateInnovationReviewData();
}

const scope = selectedVideo ?? "innovation + workflow";
if (sourceOnly) {
  console.log(
    `Verified source timelines, ${JSON.stringify(sourceCaptionCounts)}, and declared asset paths for ${scope}; external binaries were not inspected.`,
  );
} else {
  console.log(
    reviewMode
      ? `Verified ${requiredAssets.length} silent-review assets and ${reviewCaptionCount} captions for ${scope} in ${renderInputRoot}`
      : `Verified ${requiredAssets.length} render assets and clean PCM timing for ${scope} in ${renderInputRoot}`,
  );
}
