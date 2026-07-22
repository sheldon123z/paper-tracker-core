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
    "shared/stills/final-report.png",
    "shared/stills/public-library.png",
    "shared/recordings/10-assistant-result.mp4",
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
const videoFlagIndex = args.indexOf("--video");
const selectedVideo =
  videoFlagIndex === -1 ? null : (args[videoFlagIndex + 1] ?? null);

if (
  (videoFlagIndex !== -1 && !selectedVideo) ||
  (selectedVideo && !(selectedVideo in assetsByVideo)) ||
  args.length !== (selectedVideo ? 2 : 0)
) {
  console.error(
    "Usage: node scripts/verify-assets.mjs [--video innovation|workflow]",
  );
  process.exit(1);
}

const selectedVideos = selectedVideo
  ? [selectedVideo]
  : Object.keys(assetsByVideo);
const requiredAssets = [
  ...new Set(selectedVideos.flatMap((video) => assetsByVideo[video])),
];

const missing = requiredAssets.filter((relativePath) => {
  const filePath = path.join(renderInputRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const stats = fs.statSync(filePath);
  return !stats.isFile() || stats.size === 0;
});

if (missing.length > 0) {
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

for (const video of selectedVideos) {
  const requirement = audioByVideo[video];
  const audioPath = path.join(renderInputRoot, requirement.path);
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

const scope = selectedVideo ?? "innovation + workflow";
console.log(
  `Verified ${requiredAssets.length} render assets and clean PCM timing for ${scope} in ${renderInputRoot}`,
);
