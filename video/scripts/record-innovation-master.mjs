import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  computeInnovationSourceFingerprint,
  INNOVATION_H264_METADATA_FILTER,
  INNOVATION_VIDEO_STREAM_HASH_POLICY,
  sha256CanonicalJson,
  sha256NormalizedText,
} from "./innovation-master-config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const renderPropsPath = path.join(
  projectRoot,
  "render-props/innovation-final.json",
);
const timelinePath = path.join(
  projectRoot,
  "src/videos/innovation-explainer/data/timeline.json",
);
const assetRoot = path.resolve(
  projectRoot,
  process.env.VIDEO_ASSETS_DIR || "../../video-assets",
);
const pictureMasterPath = path.join(
  assetRoot,
  "innovation-explainer/renders/paper-tracker-innovation-explainer-opening-restructure-2k-raw.mp4",
);
const ffmpegPath = path.join(
  projectRoot,
  "node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe",
);
const ffprobePath = path.join(
  projectRoot,
  "node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe",
);

const fail = (message) => {
  throw new Error(message);
};

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
const sha256File = (filePath) => sha256(fs.readFileSync(filePath));

const scrubbedEnvironment = () => {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      key.toUpperCase() === "VOLCENGINE_TTS_API_KEY" ||
      key.toUpperCase() === "SSLKEYLOGFILE"
    ) {
      delete environment[key];
    }
  }
  return environment;
};

const run = (command, args, description, maxBuffer = 16 * 1024 * 1024) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: scrubbedEnvironment(),
    maxBuffer,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`${description} failed with exit code ${result.status}.`);
  }
  return result.stdout;
};

const writeJsonAtomic = (filePath, value) => {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    try {
      fs.renameSync(temporary, filePath);
    } catch (error) {
      if (
        error?.code !== "EEXIST" &&
        error?.code !== "EPERM" &&
        error?.code !== "ENOTEMPTY"
      ) {
        throw error;
      }
      fs.rmSync(filePath, { force: true });
      fs.renameSync(temporary, filePath);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
};

for (const [label, filePath] of [
  ["render props", renderPropsPath],
  ["timeline", timelinePath],
  ["picture master", pictureMasterPath],
  ["FFmpeg", ffmpegPath],
  ["FFprobe", ffprobePath],
]) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    fail(`Innovation ${label} is missing: ${filePath}`);
  }
}

const renderProps = JSON.parse(fs.readFileSync(renderPropsPath, "utf8"));
const previousMastering = renderProps.mastering;
if (
  ![1, 2].includes(previousMastering?.schemaVersion) ||
  !Array.isArray(previousMastering.sourceFingerprintRoots) ||
  previousMastering.sourceFingerprintRoots.length === 0
) {
  fail("Innovation render props have no reusable mastering policy.");
}
const compositionProps = { ...renderProps };
delete compositionProps.mastering;
const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
if (
  timeline.fps !== 30 ||
  !Number.isInteger(timeline.durationInFrames) ||
  timeline.durationInFrames < 1
) {
  fail("Innovation timeline is not a positive 30 fps frame sequence.");
}

const probe = JSON.parse(
  run(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,nb_frames",
      "-of",
      "json",
      pictureMasterPath,
    ],
    "Picture-master probe",
  ).toString("utf8"),
);
const video = probe.streams?.find((stream) => stream.codec_type === "video");
const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
if (
  audio ||
  video?.codec_name !== "h264" ||
  Number(video.width) !== 2560 ||
  Number(video.height) !== 1440 ||
  video.pix_fmt !== "yuv420p" ||
  video.r_frame_rate !== "30/1" ||
  Number(video.nb_frames) !== timeline.durationInFrames
) {
  fail(
    "Picture master is not the current silent 2560x1440/30 fps H.264 render.",
  );
}

const fingerprint = computeInnovationSourceFingerprint(
  projectRoot,
  previousMastering.sourceFingerprintRoots,
);
const videoStream = run(
  ffmpegPath,
  [
    "-v",
    "error",
    "-i",
    pictureMasterPath,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-bsf:v",
    INNOVATION_H264_METADATA_FILTER,
    "-f",
    "h264",
    "pipe:1",
  ],
  "Picture-master video-stream extraction",
  256 * 1024 * 1024,
);

const mastering = {
  schemaVersion: 2,
  outputDurationInFrames: timeline.durationInFrames,
  renderPropsSha256: sha256CanonicalJson(compositionProps),
  sourceTimeline: path
    .relative(projectRoot, timelinePath)
    .replaceAll("\\", "/"),
  sourceTimelineSha256: sha256NormalizedText(timelinePath),
  sourceFingerprintRoots: previousMastering.sourceFingerprintRoots,
  sourceFingerprintSha256: fingerprint.sha256,
  pictureMasterSha256: sha256File(pictureMasterPath),
  videoStreamSha256: sha256(videoStream),
  videoStreamHashPolicy: INNOVATION_VIDEO_STREAM_HASH_POLICY,
};

writeJsonAtomic(renderPropsPath, { ...compositionProps, mastering });
console.log(
  JSON.stringify(
    {
      status: "recorded",
      durationInFrames: mastering.outputDurationInFrames,
      pictureMasterSha256: mastering.pictureMasterSha256,
      videoStreamSha256: mastering.videoStreamSha256,
      sourceFingerprintSha256: mastering.sourceFingerprintSha256,
    },
    null,
    2,
  ),
);
