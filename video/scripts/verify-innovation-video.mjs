import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  INNOVATION_H264_METADATA_FILTER,
  loadInnovationMasterConfig,
} from "./innovation-master-config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const assetRoot = path.resolve(
  projectRoot,
  process.env.VIDEO_ASSETS_DIR || "../../video-assets",
);
const renderDir = path.join(assetRoot, "innovation-explainer/renders");
const pictureMasterPath = path.join(
  renderDir,
  "paper-tracker-innovation-explainer-opening-restructure-2k-raw.mp4",
);
const finalVideoPath = path.join(
  renderDir,
  "paper-tracker-innovation-explainer-opening-restructure-2k.mp4",
);
const narrationPath = path.join(
  projectRoot,
  "output/innovation-opening-restructure/innovation-opening-restructure-final-mix.wav",
);
const narrationAuditPath = path.join(
  projectRoot,
  "output/innovation-opening-restructure/innovation-opening-restructure-audit.json",
);
const narrationVerifier = path.join(
  projectRoot,
  "scripts/assemble-innovation-hybrid-narration.mjs",
);
const captionsPath = path.join(
  projectRoot,
  "src/videos/innovation-explainer/data/captions.json",
);
const timelinePath = path.join(
  projectRoot,
  "src/videos/innovation-explainer/data/timeline.json",
);
const authorizationPath = path.join(
  projectRoot,
  "render-props/innovation-tts-authorization.json",
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

const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sanitizedEnvironment = () => {
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

const run = (command, args, description, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: sanitizedEnvironment(),
    encoding: options.encoding,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = options.capture
      ? String(result.stderr || result.stdout || "").trim()
      : "";
    fail(
      `${description} failed with exit code ${result.status}${detail ? `: ${detail}` : "."}`,
    );
  }
  return result.stdout;
};

for (const [label, filePath] of [
  ["picture master", pictureMasterPath],
  ["final video", finalVideoPath],
  ["hybrid narration", narrationPath],
  ["hybrid audit", narrationAuditPath],
  ["FFmpeg", ffmpegPath],
  ["FFprobe", ffprobePath],
]) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    fail(`Innovation ${label} is missing: ${filePath}`);
  }
}

const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
const authorization = JSON.parse(fs.readFileSync(authorizationPath, "utf8"));
const narrationAudit = JSON.parse(
  fs.readFileSync(narrationAuditPath, "utf8"),
);
const captionsSha256 = sha256(Buffer.from(canonicalJson(captions)));
const timelineSha256 = sha256(Buffer.from(canonicalJson(timeline)));
if (
  !Array.isArray(captions) ||
  captions.length === 0 ||
  authorization?.captions?.count !== captions.length ||
  authorization?.captionSha256 !== captionsSha256 ||
  authorization?.timeline?.sha256 !== timelineSha256 ||
  authorization?.generationStatus?.finalMixVerified !== true ||
  narrationAudit?.captions?.count !== captions.length ||
  narrationAudit?.captions?.sha256 !== captionsSha256 ||
  narrationAudit?.timeline?.sha256 !== timelineSha256 ||
  narrationAudit?.mastering?.noTimeStretching !== true
) {
  fail("Final-video inputs are not bound to the current captions and timeline.");
}

run(
  process.execPath,
  [narrationVerifier, "--verify", "--wav", narrationPath],
  "Hybrid narration verification",
);

const masterConfig = loadInnovationMasterConfig(projectRoot);
if (
  masterConfig.outputDurationInFrames !== timeline.durationInFrames ||
  masterConfig.sourceTimelineDurationInFrames !== timeline.durationInFrames
) {
  fail("Locked picture mastering metadata does not match the current timeline.");
}
if (sha256File(pictureMasterPath) !== masterConfig.pictureMasterSha256) {
  fail("Picture-master file hash differs from the locked mastering metadata.");
}

const probe = (filePath) =>
  JSON.parse(
    run(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_name,codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,color_space,color_transfer,color_primaries,sample_rate,channels,duration",
        "-of",
        "json",
        filePath,
      ],
      `FFprobe ${path.basename(filePath)}`,
      { capture: true, encoding: "utf8" },
    ),
  );

const rawProbe = probe(pictureMasterPath);
const finalProbe = probe(finalVideoPath);
const rawVideo = rawProbe.streams.find((stream) => stream.codec_type === "video");
const rawAudio = rawProbe.streams.find((stream) => stream.codec_type === "audio");
const finalVideo = finalProbe.streams.find(
  (stream) => stream.codec_type === "video",
);
const finalAudio = finalProbe.streams.find(
  (stream) => stream.codec_type === "audio",
);
const expectedDuration = timeline.durationInFrames / timeline.fps;
if (
  rawAudio ||
  rawVideo?.codec_name !== "h264" ||
  Number(rawVideo?.width) !== 2560 ||
  Number(rawVideo?.height) !== 1440 ||
  rawVideo?.pix_fmt !== "yuv420p" ||
  rawVideo?.r_frame_rate !== "30/1" ||
  Number(rawVideo?.nb_frames) !== timeline.durationInFrames ||
  finalVideo?.codec_name !== "h264" ||
  Number(finalVideo?.width) !== 2560 ||
  Number(finalVideo?.height) !== 1440 ||
  finalVideo?.pix_fmt !== "yuv420p" ||
  finalVideo?.r_frame_rate !== "30/1" ||
  Number(finalVideo?.nb_frames) !== timeline.durationInFrames ||
  finalVideo?.color_space !== "bt709" ||
  finalVideo?.color_transfer !== "bt709" ||
  finalVideo?.color_primaries !== "bt709" ||
  finalAudio?.codec_name !== "aac" ||
  Number(finalAudio?.sample_rate) !== 48_000 ||
  Number(finalAudio?.channels) !== 2 ||
  Math.abs(Number(finalProbe.format?.duration) - expectedDuration) > 0.05
) {
  fail("Final media does not match 2560x1440/30fps H.264 BT.709 with 48 kHz stereo AAC.");
}

const streamSha256 = (filePath) =>
  sha256(
    run(
      ffmpegPath,
      [
        "-v",
        "error",
        "-i",
        filePath,
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
      `Extract video stream from ${path.basename(filePath)}`,
      { capture: true, maxBuffer: 256 * 1024 * 1024 },
    ),
  );

const rawVideoStreamSha256 = streamSha256(pictureMasterPath);
const finalVideoStreamSha256 = streamSha256(finalVideoPath);
if (
  rawVideoStreamSha256 !== finalVideoStreamSha256 ||
  rawVideoStreamSha256 !== masterConfig.videoStreamSha256
) {
  fail("Final mux changed the locked H.264 picture stream.");
}

run(
  ffmpegPath,
  [
    "-v",
    "error",
    "-i",
    finalVideoPath,
    "-map",
    "0:v:0",
    "-c:v",
    "rawvideo",
    "-pix_fmt",
    "yuv420p",
    "-f",
    "null",
    "NUL",
  ],
  "Full final-video picture decode",
);

const decodedAudioWave = run(
  ffmpegPath,
  [
    "-v",
    "error",
    "-i",
    finalVideoPath,
    "-map",
    "0:a:0",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "pipe:1",
  ],
  "Decode final AAC audio",
  { capture: true, maxBuffer: 128 * 1024 * 1024 },
);
const extractWavePcm = (wave) => {
  const container = wave.subarray(0, 4).toString("ascii");
  if (
    (container !== "RIFF" && container !== "RF64") ||
    wave.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    fail("Decoded final AAC did not produce a PCM WAV stream.");
  }
  let offset = 12;
  while (offset + 8 <= wave.length) {
    const chunkId = wave.subarray(offset, offset + 4).toString("ascii");
    const declaredSize = wave.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === "data") {
      const availableSize = wave.length - dataStart;
      const dataSize =
        declaredSize === 0xffffffff
          ? availableSize
          : Math.min(declaredSize, availableSize);
      const pcm = wave.subarray(dataStart, dataStart + dataSize);
      if (pcm.length === 0 || pcm.length % 4 !== 0) {
        fail("Decoded final AAC WAV has an invalid stereo PCM payload.");
      }
      return pcm;
    }
    if (declaredSize === 0xffffffff) {
      break;
    }
    offset = dataStart + declaredSize + (declaredSize % 2);
  }
  fail("Decoded final AAC WAV has no data chunk.");
};
const decodedAudio = extractWavePcm(decodedAudioWave);
let peak = 0;
let sumSquares = 0;
let clippedSamples = 0;
for (let offset = 0; offset < decodedAudio.length; offset += 2) {
  const sample = decodedAudio.readInt16LE(offset);
  const amplitude = Math.abs(sample);
  peak = Math.max(peak, amplitude);
  sumSquares += sample * sample;
  if (amplitude >= 32767) {
    clippedSamples++;
  }
}
const decodedSampleFrames = decodedAudio.length / 4;
const expectedSampleFrames =
  (timeline.durationInFrames * 48_000) / timeline.fps;
if (
  clippedSamples !== 0 ||
  Math.abs(decodedSampleFrames - expectedSampleFrames) > 2048
) {
  fail("Decoded final AAC has clipping or an unexpected duration.");
}
const rms = Math.sqrt(sumSquares / (decodedAudio.length / 2));
const toDbfs = (value) =>
  value > 0 ? Number((20 * Math.log10(value / 32768)).toFixed(3)) : null;

console.log(
  JSON.stringify(
    {
      status: "verified",
      captions: captions.length,
      durationInFrames: timeline.durationInFrames,
      durationSeconds: expectedDuration,
      pictureMaster: {
        path: pictureMasterPath,
        sha256: masterConfig.pictureMasterSha256,
        videoStreamSha256: rawVideoStreamSha256,
      },
      finalVideo: {
        path: finalVideoPath,
        sha256: sha256File(finalVideoPath),
        videoStreamSha256: finalVideoStreamSha256,
      },
      decodedAudio: {
        sampleFrames: decodedSampleFrames,
        peakDbfs: toDbfs(peak),
        rmsDbfs: toDbfs(rms),
        clippedSamples,
      },
      hybridAuditSha256: sha256File(narrationAuditPath),
      narrationWaveSha256: sha256File(narrationPath),
    },
    null,
    2,
  ),
);
