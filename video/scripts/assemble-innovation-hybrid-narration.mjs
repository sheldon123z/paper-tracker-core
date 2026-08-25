import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(projectRoot, "output");
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
const defaultSourceMaster = path.join(
  outputRoot,
  "innovation-section05-tts-v3/section05-tts-v3-master-24k-mono.wav",
);
const defaultOpeningWorkDir = path.join(outputRoot, "innovation-opening-tts");
const defaultOutputDir = path.join(
  outputRoot,
  "innovation-opening-restructure",
);
const ffmpegPath = path.join(
  projectRoot,
  "node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe",
);

const SOURCE_SAMPLE_RATE = 24_000;
const OUTPUT_SAMPLE_RATE = 48_000;
const FPS = 30;
const BYTES_PER_SAMPLE = 2;
const OPENING_CUE_COUNT = 5;
const EXPECTED_SOURCE_MASTER_SHA256 =
  "47E30AD6869A9D70A704A2078D22805B425E486B18E80BE511C374ED1BBA9E3B";
const EXPECTED_BODY_PREFIX_PCM_SHA256 =
  "C537AB938FFC7107C5E3BE27E42D6292EB9E4DA7454B69B901AF3739C7B1CCFB";
const EXPECTED_BODY_SUFFIX_PCM_SHA256 =
  "9E818B965E0FBA83E536601F11197CBEC867DA3D9CF43A7CACC1B051D6BF62FF";
const EXPECTED_REMOVED_SILENCE_PCM_SHA256 =
  "16FA66A7DC98D93F2A4C5D20BAF5177F59C4C37FC62FACE65690C11C15FE6FF9";
const EXPECTED_RETIMED_BODY_PCM_SHA256 =
  "92C306E32C928872F483AF08D1BA1487954C3767D53CBF7DE9400C7931288195";
const EXPECTED_OUTRO_PCM_SHA256 =
  "FAB093499CDB049B50AD647E4306A70F029CD987A21B52D469A333E2828ABFF3";
const SOURCE_BODY_PREFIX_FRAMES = [1647, 3596];
const SOURCE_REMOVED_SILENCE_FRAMES = [3596, 3628];
const SOURCE_BODY_SUFFIX_FRAMES = [3628, 6460];
const SOURCE_OUTRO_FRAMES = [7383, 7575];
const EXPECTED_SCENE_ORDER = [
  "scene-intro",
  "scene-00",
  "scene-01",
  "scene-02",
  "scene-04",
  "scene-architecture",
  "scene-03",
  "scene-06",
  "scene-outro",
];

const fail = (message) => {
  throw new Error(message);
};

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();

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

const sha256CanonicalJson = (value) => sha256(canonicalJson(value));
const sha256File = (filePath) => sha256(fs.readFileSync(filePath));

const relativePath = (filePath) =>
  path.relative(projectRoot, filePath).replaceAll("\\", "/");

const resolveFromProject = (configuredPath, fallback) =>
  configuredPath ? path.resolve(projectRoot, configuredPath) : fallback;

const assertInsideOutput = (resolved, label) => {
  const relative = path.relative(outputRoot, resolved);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(`${label} must be a strict child of video/output.`);
  }
  if (fs.existsSync(resolved)) {
    const stats = fs.lstatSync(resolved);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      fail(`${label} must be a real directory, not a link.`);
    }
  }
};

const parseArguments = (tokens) => {
  const parsed = {
    help: false,
    openingWorkDir: null,
    outputDir: null,
    sourceMaster: null,
    verify: false,
    wav: null,
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
    } else if (token === "--verify") {
      parsed.verify = true;
    } else if (
      token === "--source-master" ||
      token === "--opening-work-dir" ||
      token === "--output-dir" ||
      token === "--wav"
    ) {
      const value = tokens[++index];
      if (!value || value.startsWith("--")) {
        fail(`${token} requires a path.`);
      }
      const name = token
        .slice(2)
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      parsed[name] = value;
    } else {
      fail(`Unknown argument: ${token}`);
    }
  }
  if (parsed.wav && !parsed.verify) {
    fail("--wav is only valid together with --verify.");
  }
  return parsed;
};

const printHelp = () => {
  console.log(`Assemble the restructured innovation narration while preserving
all accepted speech PCM and removing one explicitly audited zero-only gap.

Usage:
  node scripts/assemble-innovation-hybrid-narration.mjs
  node scripts/assemble-innovation-hybrid-narration.mjs --verify
  node scripts/assemble-innovation-hybrid-narration.mjs --verify --wav PATH

Options:
  --source-master PATH      Accepted v3 24 kHz mono WAV.
  --opening-work-dir PATH   Isolated cache containing generated cues 1-5.
  --output-dir PATH         Ignored directory for the hybrid outputs.
  --verify                  Recompute all source, block, segment, and WAV hashes.
  --wav PATH                Also require this WAV to equal the audited final mix.
  --help                    Show this help.

The assembler places the five new normal-speed PCM segments at their caption
starts, concatenates two locked body slices around a verified 32-frame silent
gap, reuses the outro byte-for-byte, then performs one whole-master conversion
to 48 kHz stereo.`);
};

const parseWave = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    fail(`Not a RIFF/WAVE file: ${filePath}`);
  }
  let format = null;
  let pcm = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) {
      fail(`Truncated ${id} chunk: ${filePath}`);
    }
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      pcm = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !pcm) {
    fail(`WAV file is missing fmt or data: ${filePath}`);
  }
  if (
    format.audioFormat !== 1 ||
    format.bitsPerSample !== 16 ||
    format.blockAlign !== format.channels * BYTES_PER_SAMPLE ||
    pcm.length % format.blockAlign !== 0
  ) {
    fail(`WAV file is not PCM s16le: ${filePath}`);
  }
  return {
    ...format,
    fileSha256: sha256(buffer),
    pcm,
    pcmSha256: sha256(pcm),
    samplesPerChannel: pcm.length / format.blockAlign,
  };
};

const pcmStats = (pcm) => {
  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    const amplitude = Math.abs(sample);
    peak = Math.max(peak, amplitude);
    sumSquares += sample * sample;
    if (amplitude >= 32767) {
      clippedSamples++;
    }
  }
  const sampleCount = pcm.length / 2;
  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const toDbfs = (value) =>
    value > 0 ? Number((20 * Math.log10(value / 32768)).toFixed(3)) : null;
  return {
    peakDbfs: toDbfs(peak),
    rmsDbfs: toDbfs(rms),
    clippedSamples,
  };
};

const makeWave = ({ channels, pcm, sampleRate }) => {
  const header = Buffer.alloc(44);
  const blockAlign = channels * BYTES_PER_SAMPLE;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const writeAtomic = (filePath, bytes) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, bytes);
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
};

const writeJsonAtomic = (filePath, value) =>
  writeAtomic(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));

const loadInputs = () => {
  const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  const authorization = JSON.parse(fs.readFileSync(authorizationPath, "utf8"));
  const captionsSha256 = sha256CanonicalJson(captions);
  const timelineSha256 = sha256CanonicalJson(timeline);
  const sceneOrder = timeline.scenes?.map((scene) => scene.id);
  if (
    timeline.fps !== FPS ||
    timeline.durationInFrames !== 5778 ||
    Math.abs(timeline.durationSeconds - timeline.durationInFrames / FPS) >
      1e-9 ||
    sceneOrder?.length !== EXPECTED_SCENE_ORDER.length ||
    sceneOrder.some((scene, index) => scene !== EXPECTED_SCENE_ORDER[index]) ||
    authorization.authorized !== true ||
    authorization.captionSha256 !== captionsSha256 ||
    authorization.captions?.sha256 !== captionsSha256 ||
    authorization.captions?.count !== captions.length ||
    authorization.timeline?.sha256 !== timelineSha256 ||
    authorization.timeline?.durationInFrames !== timeline.durationInFrames ||
    authorization.reusePolicy?.bodyPrefixPcmSha256 !==
      EXPECTED_BODY_PREFIX_PCM_SHA256 ||
    authorization.reusePolicy?.bodySuffixPcmSha256 !==
      EXPECTED_BODY_SUFFIX_PCM_SHA256 ||
    authorization.reusePolicy?.removedSilencePcmSha256 !==
      EXPECTED_REMOVED_SILENCE_PCM_SHA256 ||
    authorization.reusePolicy?.retimedBodyPcmSha256 !==
      EXPECTED_RETIMED_BODY_PCM_SHA256 ||
    authorization.reusePolicy?.outroPcmSha256 !== EXPECTED_OUTRO_PCM_SHA256 ||
    authorization.retiming?.noPerSegmentTimeStretching !== true
  ) {
    fail(
      "Current captions, timeline, and explicit narration authorization do not match.",
    );
  }
  const scene02 = timeline.scenes.find((scene) => scene.id === "scene-02");
  const outro = timeline.scenes.find((scene) => scene.id === "scene-outro");
  if (
    scene02?.startFrame !== 805 ||
    outro?.startFrame !== 5586 ||
    outro.startFrame + outro.durationInFrames !== timeline.durationInFrames
  ) {
    fail(
      "Hybrid narration boundaries do not match the reviewed 5778-frame timeline.",
    );
  }
  return {
    authorization,
    captions,
    captionsSha256,
    scene02,
    timeline,
    timelineSha256,
    outro,
  };
};

const frameTo24kSample = (frame) => {
  const sample = (frame * SOURCE_SAMPLE_RATE) / FPS;
  if (!Number.isInteger(sample)) {
    fail(`Frame ${frame} does not align to a 24 kHz sample.`);
  }
  return sample;
};

const loadSourceBlocks = (sourceMasterPath, inputs) => {
  const source = parseWave(sourceMasterPath);
  if (
    source.sampleRate !== SOURCE_SAMPLE_RATE ||
    source.channels !== 1 ||
    source.samplesPerChannel !== 6_060_000 ||
    source.fileSha256 !== EXPECTED_SOURCE_MASTER_SHA256
  ) {
    fail(
      "Accepted v3 source master failed format, duration, or file-hash verification.",
    );
  }
  const sourceBodyPrefixStart = frameTo24kSample(SOURCE_BODY_PREFIX_FRAMES[0]);
  const sourceBodyPrefixEnd = frameTo24kSample(SOURCE_BODY_PREFIX_FRAMES[1]);
  const sourceRemovedSilenceStart = frameTo24kSample(
    SOURCE_REMOVED_SILENCE_FRAMES[0],
  );
  const sourceRemovedSilenceEnd = frameTo24kSample(
    SOURCE_REMOVED_SILENCE_FRAMES[1],
  );
  const sourceBodySuffixStart = frameTo24kSample(SOURCE_BODY_SUFFIX_FRAMES[0]);
  const sourceBodySuffixEnd = frameTo24kSample(SOURCE_BODY_SUFFIX_FRAMES[1]);
  const sourceOutroStart = frameTo24kSample(SOURCE_OUTRO_FRAMES[0]);
  const sourceOutroEnd = frameTo24kSample(SOURCE_OUTRO_FRAMES[1]);
  const bodyPrefix = source.pcm.subarray(
    sourceBodyPrefixStart * BYTES_PER_SAMPLE,
    sourceBodyPrefixEnd * BYTES_PER_SAMPLE,
  );
  const removedSilence = source.pcm.subarray(
    sourceRemovedSilenceStart * BYTES_PER_SAMPLE,
    sourceRemovedSilenceEnd * BYTES_PER_SAMPLE,
  );
  const bodySuffix = source.pcm.subarray(
    sourceBodySuffixStart * BYTES_PER_SAMPLE,
    sourceBodySuffixEnd * BYTES_PER_SAMPLE,
  );
  const body = Buffer.concat([bodyPrefix, bodySuffix]);
  const outro = source.pcm.subarray(
    sourceOutroStart * BYTES_PER_SAMPLE,
    sourceOutroEnd * BYTES_PER_SAMPLE,
  );
  let removedSilenceNonzeroSamples = 0;
  for (let offset = 0; offset < removedSilence.length; offset += 2) {
    if (removedSilence.readInt16LE(offset) !== 0) {
      removedSilenceNonzeroSamples++;
    }
  }
  if (
    sha256(bodyPrefix) !== EXPECTED_BODY_PREFIX_PCM_SHA256 ||
    sha256(bodySuffix) !== EXPECTED_BODY_SUFFIX_PCM_SHA256 ||
    sha256(removedSilence) !== EXPECTED_REMOVED_SILENCE_PCM_SHA256 ||
    removedSilenceNonzeroSamples !== 0 ||
    sha256(body) !== EXPECTED_RETIMED_BODY_PCM_SHA256
  ) {
    fail(
      "Accepted v3 body slices or the audited zero-only gap do not match their locked baselines.",
    );
  }
  if (sha256(outro) !== EXPECTED_OUTRO_PCM_SHA256) {
    fail("Accepted v3 outro PCM hash does not match the locked baseline.");
  }

  const bodyTargetStart = frameTo24kSample(inputs.scene02.startFrame);
  const bodyTargetEnd = frameTo24kSample(inputs.outro.startFrame);
  const outroTargetEnd = frameTo24kSample(inputs.timeline.durationInFrames);
  if (
    body.length !== (bodyTargetEnd - bodyTargetStart) * BYTES_PER_SAMPLE ||
    outro.length !== (outroTargetEnd - bodyTargetEnd) * BYTES_PER_SAMPLE
  ) {
    fail(
      "Locked source slices do not exactly fill the retimed body/outro timeline.",
    );
  }
  return {
    body,
    bodyPrefix,
    bodySuffix,
    bodyTargetEnd,
    bodyTargetStart,
    outro,
    outroTargetEnd,
    removedSilence,
    removedSilenceNonzeroSamples,
    source,
    sourceBodyPrefixEnd,
    sourceBodyPrefixStart,
    sourceBodySuffixEnd,
    sourceBodySuffixStart,
    sourceOutroEnd,
    sourceOutroStart,
    sourceRemovedSilenceEnd,
    sourceRemovedSilenceStart,
  };
};

const loadOpeningSegments = (openingWorkDir, inputs, openingEndSample) => {
  const manifestPath = path.join(openingWorkDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail(`Opening narration manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.captionsSha256 !== inputs.captionsSha256 ||
    manifest.timelineSha256 !== inputs.timelineSha256 ||
    manifest.captionCount !== inputs.captions.length ||
    !Array.isArray(manifest.segments)
  ) {
    fail(
      "Opening narration manifest is not bound to the current authorized inputs.",
    );
  }

  const segments = [];
  for (let index = 0; index < OPENING_CUE_COUNT; index++) {
    const caption = inputs.captions[index];
    const entry = manifest.segments[index];
    if (
      !entry ||
      entry.index !== index ||
      entry.cue !== index + 1 ||
      entry.text !== caption.text ||
      entry.startMs !== caption.startMs ||
      entry.captionEndMs !== caption.endMs
    ) {
      fail(`Opening narration manifest entry ${index + 1} is invalid.`);
    }
    const segmentPath = path.resolve(openingWorkDir, entry.file);
    const relative = path.relative(openingWorkDir, segmentPath);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      !fs.existsSync(segmentPath)
    ) {
      fail(
        `Opening narration segment ${index + 1} escapes its work directory.`,
      );
    }
    const pcm = fs.readFileSync(segmentPath);
    if (
      pcm.length === 0 ||
      pcm.length % BYTES_PER_SAMPLE !== 0 ||
      pcm.length !== entry.bytes ||
      sha256(pcm) !== entry.sha256 ||
      entry.clippedSamples !== 0
    ) {
      fail(`Opening narration segment ${index + 1} failed PCM verification.`);
    }
    const startSample = caption.startMs * (SOURCE_SAMPLE_RATE / 1000);
    const captionEndSample = caption.endMs * (SOURCE_SAMPLE_RATE / 1000);
    if (!Number.isInteger(startSample) || !Number.isInteger(captionEndSample)) {
      fail(`Opening caption ${index + 1} is not aligned to 24 kHz samples.`);
    }
    const endSample = startSample + pcm.length / BYTES_PER_SAMPLE;
    const nextStartSample =
      index + 1 < OPENING_CUE_COUNT
        ? inputs.captions[index + 1].startMs * (SOURCE_SAMPLE_RATE / 1000)
        : openingEndSample;
    if (
      endSample > captionEndSample ||
      endSample > nextStartSample ||
      nextStartSample - endSample < SOURCE_SAMPLE_RATE * 0.2
    ) {
      fail(
        `Opening cue ${index + 1} does not fit its caption window with a 200 ms safety gap.`,
      );
    }
    segments.push({
      caption,
      endSample,
      entry,
      nextStartSample,
      pcm,
      segmentPath,
      startSample,
    });
  }
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256File(manifestPath),
    segments,
  };
};

const buildExpectedMaster = (sourceMasterPath, openingWorkDir) => {
  const inputs = loadInputs();
  const blocks = loadSourceBlocks(sourceMasterPath, inputs);
  const totalSamples = frameTo24kSample(inputs.timeline.durationInFrames);
  const master = Buffer.alloc(totalSamples * BYTES_PER_SAMPLE);
  const opening = loadOpeningSegments(
    openingWorkDir,
    inputs,
    blocks.bodyTargetStart,
  );
  for (const segment of opening.segments) {
    segment.pcm.copy(master, segment.startSample * BYTES_PER_SAMPLE);
  }
  blocks.body.copy(master, blocks.bodyTargetStart * BYTES_PER_SAMPLE);
  blocks.outro.copy(master, blocks.bodyTargetEnd * BYTES_PER_SAMPLE);
  const targetBody = master.subarray(
    blocks.bodyTargetStart * BYTES_PER_SAMPLE,
    blocks.bodyTargetEnd * BYTES_PER_SAMPLE,
  );
  const targetOutro = master.subarray(
    blocks.bodyTargetEnd * BYTES_PER_SAMPLE,
    blocks.outroTargetEnd * BYTES_PER_SAMPLE,
  );
  if (
    sha256(targetBody) !== EXPECTED_RETIMED_BODY_PCM_SHA256 ||
    sha256(targetOutro) !== EXPECTED_OUTRO_PCM_SHA256
  ) {
    fail("Retimed speech PCM changed after placement in the new master.");
  }
  return { blocks, inputs, master, opening };
};

const outputPaths = (outputDir) => ({
  audit: path.join(outputDir, "innovation-opening-restructure-audit.json"),
  finalMix: path.join(
    outputDir,
    "innovation-opening-restructure-final-mix.wav",
  ),
  master24k: path.join(
    outputDir,
    "innovation-opening-restructure-master-24k-mono.wav",
  ),
});

const convertToFinalMix = (master24kPath, finalMixPath, expectedSamples) => {
  if (!fs.existsSync(ffmpegPath)) {
    fail(`Bundled Remotion FFmpeg not found: ${ffmpegPath}`);
  }
  const sanitizedEnvironment = { ...process.env };
  for (const key of Object.keys(sanitizedEnvironment)) {
    if (
      key.toUpperCase() === "VOLCENGINE_TTS_API_KEY" ||
      key.toUpperCase() === "SSLKEYLOGFILE"
    ) {
      delete sanitizedEnvironment[key];
    }
  }
  const args = [
    "-v",
    "error",
    "-y",
    "-i",
    master24kPath,
    "-map",
    "0:a:0",
    "-ac",
    "2",
    "-ar",
    String(OUTPUT_SAMPLE_RATE),
    "-c:a",
    "pcm_s16le",
    "-af",
    `aresample=${OUTPUT_SAMPLE_RATE},` +
      `aformat=sample_fmts=s16:sample_rates=${OUTPUT_SAMPLE_RATE}:` +
      `channel_layouts=stereo,apad=whole_len=${expectedSamples},` +
      `atrim=end_sample=${expectedSamples}`,
    finalMixPath,
  ];
  const result = spawnSync(ffmpegPath, args, {
    cwd: projectRoot,
    env: sanitizedEnvironment,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(
      `Whole-master 48 kHz conversion failed with exit code ${result.status}.`,
    );
  }
};

const makeAudit = ({ built, finalWave, masterWave, outputDir }) => ({
  schemaVersion: 1,
  status: "complete",
  createdAt: new Date().toISOString(),
  captions: {
    file: relativePath(captionsPath),
    count: built.inputs.captions.length,
    sha256: built.inputs.captionsSha256,
  },
  timeline: {
    file: relativePath(timelinePath),
    fps: built.inputs.timeline.fps,
    durationInFrames: built.inputs.timeline.durationInFrames,
    durationSeconds: built.inputs.timeline.durationSeconds,
    sha256: built.inputs.timelineSha256,
  },
  source: {
    acceptedMaster: relativePath(built.sourceMasterPath),
    fileSha256: built.blocks.source.fileSha256,
    pcmSha256: built.blocks.source.pcmSha256,
    sampleRate: SOURCE_SAMPLE_RATE,
    channels: 1,
    samples: built.blocks.source.samplesPerChannel,
  },
  opening: {
    cueCount: OPENING_CUE_COUNT,
    workDir: relativePath(built.openingWorkDir),
    manifest: relativePath(built.opening.manifestPath),
    manifestSha256: built.opening.manifestSha256,
    noPerSegmentTimeStretching: true,
    minimumGapMs: Math.min(
      ...built.opening.segments.map(
        (segment) =>
          ((segment.nextStartSample - segment.endSample) / SOURCE_SAMPLE_RATE) *
          1000,
      ),
    ),
    segments: built.opening.segments.map((segment) => ({
      cue: segment.entry.cue,
      text: segment.caption.text,
      file: relativePath(segment.segmentPath),
      sha256: segment.entry.sha256,
      startSample: segment.startSample,
      endSample: segment.endSample,
      captionEndSample: segment.caption.endMs * (SOURCE_SAMPLE_RATE / 1000),
      nextStartSample: segment.nextStartSample,
      clippedSamples: segment.entry.clippedSamples,
    })),
  },
  blocks: {
    body: {
      sourceSlices: [
        {
          sourceFrames: SOURCE_BODY_PREFIX_FRAMES,
          sourceSamples: [
            built.blocks.sourceBodyPrefixStart,
            built.blocks.sourceBodyPrefixEnd,
          ],
          targetFrames: [
            built.inputs.scene02.startFrame,
            built.inputs.scene02.startFrame +
              (SOURCE_BODY_PREFIX_FRAMES[1] - SOURCE_BODY_PREFIX_FRAMES[0]),
          ],
          targetSamples: [
            built.blocks.bodyTargetStart,
            built.blocks.bodyTargetStart +
              built.blocks.bodyPrefix.length / BYTES_PER_SAMPLE,
          ],
          sourceSha256: EXPECTED_BODY_PREFIX_PCM_SHA256,
          targetSha256: EXPECTED_BODY_PREFIX_PCM_SHA256,
        },
        {
          sourceFrames: SOURCE_BODY_SUFFIX_FRAMES,
          sourceSamples: [
            built.blocks.sourceBodySuffixStart,
            built.blocks.sourceBodySuffixEnd,
          ],
          targetFrames: [
            built.inputs.scene02.startFrame +
              (SOURCE_BODY_PREFIX_FRAMES[1] - SOURCE_BODY_PREFIX_FRAMES[0]),
            built.inputs.outro.startFrame,
          ],
          targetSamples: [
            built.blocks.bodyTargetStart +
              built.blocks.bodyPrefix.length / BYTES_PER_SAMPLE,
            built.blocks.bodyTargetEnd,
          ],
          sourceSha256: EXPECTED_BODY_SUFFIX_PCM_SHA256,
          targetSha256: EXPECTED_BODY_SUFFIX_PCM_SHA256,
        },
      ],
      removedSilence: {
        sourceFrames: SOURCE_REMOVED_SILENCE_FRAMES,
        sourceSamples: [
          built.blocks.sourceRemovedSilenceStart,
          built.blocks.sourceRemovedSilenceEnd,
        ],
        durationInFrames:
          SOURCE_REMOVED_SILENCE_FRAMES[1] - SOURCE_REMOVED_SILENCE_FRAMES[0],
        samples: built.blocks.removedSilence.length / BYTES_PER_SAMPLE,
        nonzeroSamples: built.blocks.removedSilenceNonzeroSamples,
        sha256: EXPECTED_REMOVED_SILENCE_PCM_SHA256,
      },
      concatenated: {
        targetFrames: [
          built.inputs.scene02.startFrame,
          built.inputs.outro.startFrame,
        ],
        targetSamples: [
          built.blocks.bodyTargetStart,
          built.blocks.bodyTargetEnd,
        ],
        durationInFrames:
          built.inputs.outro.startFrame - built.inputs.scene02.startFrame,
        samples: built.blocks.body.length / BYTES_PER_SAMPLE,
        sourceSha256: EXPECTED_RETIMED_BODY_PCM_SHA256,
        targetSha256: EXPECTED_RETIMED_BODY_PCM_SHA256,
      },
    },
    outro: {
      sourceFrames: SOURCE_OUTRO_FRAMES,
      sourceSamples: [
        built.blocks.sourceOutroStart,
        built.blocks.sourceOutroEnd,
      ],
      targetFrames: [
        built.inputs.outro.startFrame,
        built.inputs.timeline.durationInFrames,
      ],
      targetSamples: [built.blocks.bodyTargetEnd, built.blocks.outroTargetEnd],
      sourceSha256: EXPECTED_OUTRO_PCM_SHA256,
      targetSha256: EXPECTED_OUTRO_PCM_SHA256,
    },
  },
  mastering: {
    noTimeStretching: true,
    wholeMasterSampleRateConversion: true,
    secretPersisted: false,
    outputDirectory: relativePath(outputDir),
  },
  outputs: {
    master24kMono: {
      file: relativePath(masterWave.filePath),
      fileSha256: masterWave.fileSha256,
      pcmSha256: masterWave.pcmSha256,
      sampleRate: masterWave.sampleRate,
      channels: masterWave.channels,
      samplesPerChannel: masterWave.samplesPerChannel,
      ...pcmStats(masterWave.pcm),
    },
    finalMix48kStereo: {
      file: relativePath(finalWave.filePath),
      fileSha256: finalWave.fileSha256,
      pcmSha256: finalWave.pcmSha256,
      sampleRate: finalWave.sampleRate,
      channels: finalWave.channels,
      samplesPerChannel: finalWave.samplesPerChannel,
      ...pcmStats(finalWave.pcm),
    },
  },
});

const verifyBundle = ({
  openingWorkDir,
  outputDir,
  sourceMasterPath,
  wavPath,
}) => {
  const paths = outputPaths(outputDir);
  const built = buildExpectedMaster(sourceMasterPath, openingWorkDir);
  if (!fs.existsSync(paths.audit) || !fs.existsSync(paths.master24k)) {
    fail("Hybrid narration outputs are incomplete.");
  }
  const audit = JSON.parse(fs.readFileSync(paths.audit, "utf8"));
  const masterWave = parseWave(paths.master24k);
  const finalMixPath = wavPath ?? paths.finalMix;
  const finalWave = parseWave(finalMixPath);
  const expected24kSamples = frameTo24kSample(
    built.inputs.timeline.durationInFrames,
  );
  const expected48kSamples =
    (built.inputs.timeline.durationInFrames * OUTPUT_SAMPLE_RATE) / FPS;
  if (
    masterWave.sampleRate !== SOURCE_SAMPLE_RATE ||
    masterWave.channels !== 1 ||
    masterWave.samplesPerChannel !== expected24kSamples ||
    masterWave.pcmSha256 !== sha256(built.master) ||
    finalWave.sampleRate !== OUTPUT_SAMPLE_RATE ||
    finalWave.channels !== 2 ||
    finalWave.samplesPerChannel !== expected48kSamples ||
    pcmStats(masterWave.pcm).clippedSamples !== 0 ||
    pcmStats(finalWave.pcm).clippedSamples !== 0 ||
    audit.status !== "complete" ||
    audit.captions?.sha256 !== built.inputs.captionsSha256 ||
    audit.timeline?.sha256 !== built.inputs.timelineSha256 ||
    audit.opening?.manifestSha256 !== built.opening.manifestSha256 ||
    audit.blocks?.body?.sourceSlices?.[0]?.sourceSha256 !==
      EXPECTED_BODY_PREFIX_PCM_SHA256 ||
    audit.blocks?.body?.sourceSlices?.[0]?.targetSha256 !==
      EXPECTED_BODY_PREFIX_PCM_SHA256 ||
    audit.blocks?.body?.sourceSlices?.[1]?.sourceSha256 !==
      EXPECTED_BODY_SUFFIX_PCM_SHA256 ||
    audit.blocks?.body?.sourceSlices?.[1]?.targetSha256 !==
      EXPECTED_BODY_SUFFIX_PCM_SHA256 ||
    audit.blocks?.body?.removedSilence?.sha256 !==
      EXPECTED_REMOVED_SILENCE_PCM_SHA256 ||
    audit.blocks?.body?.removedSilence?.nonzeroSamples !== 0 ||
    audit.blocks?.body?.concatenated?.sourceSha256 !==
      EXPECTED_RETIMED_BODY_PCM_SHA256 ||
    audit.blocks?.body?.concatenated?.targetSha256 !==
      EXPECTED_RETIMED_BODY_PCM_SHA256 ||
    audit.blocks?.outro?.sourceSha256 !== EXPECTED_OUTRO_PCM_SHA256 ||
    audit.blocks?.outro?.targetSha256 !== EXPECTED_OUTRO_PCM_SHA256 ||
    audit.mastering?.noTimeStretching !== true ||
    audit.outputs?.master24kMono?.fileSha256 !== masterWave.fileSha256 ||
    audit.outputs?.master24kMono?.pcmSha256 !== masterWave.pcmSha256 ||
    audit.outputs?.finalMix48kStereo?.fileSha256 !== finalWave.fileSha256 ||
    audit.outputs?.finalMix48kStereo?.pcmSha256 !== finalWave.pcmSha256
  ) {
    fail("Hybrid narration bundle failed deterministic verification.");
  }
  console.log(
    JSON.stringify(
      {
        status: "verified",
        captionCount: built.inputs.captions.length,
        openingCueCount: OPENING_CUE_COUNT,
        durationInFrames: built.inputs.timeline.durationInFrames,
        bodyPcmSha256: EXPECTED_RETIMED_BODY_PCM_SHA256,
        outroPcmSha256: EXPECTED_OUTRO_PCM_SHA256,
        master24kMono: {
          file: relativePath(paths.master24k),
          sha256: masterWave.fileSha256,
        },
        finalMix48kStereo: {
          file: relativePath(finalMixPath),
          sha256: finalWave.fileSha256,
        },
      },
      null,
      2,
    ),
  );
};

const main = () => {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const sourceMasterPath = resolveFromProject(
    args.sourceMaster,
    defaultSourceMaster,
  );
  const openingWorkDir = resolveFromProject(
    args.openingWorkDir,
    defaultOpeningWorkDir,
  );
  const outputDir = resolveFromProject(args.outputDir, defaultOutputDir);
  assertInsideOutput(openingWorkDir, "Opening narration work directory");
  assertInsideOutput(outputDir, "Hybrid narration output directory");
  if (
    outputDir.toLowerCase() === openingWorkDir.toLowerCase() ||
    outputDir.toLowerCase() === path.dirname(sourceMasterPath).toLowerCase()
  ) {
    fail("Hybrid outputs must not overwrite source narration bundles.");
  }
  const wavPath = args.wav ? path.resolve(projectRoot, args.wav) : null;

  if (args.verify) {
    verifyBundle({ openingWorkDir, outputDir, sourceMasterPath, wavPath });
    return;
  }

  const paths = outputPaths(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const built = buildExpectedMaster(sourceMasterPath, openingWorkDir);
  built.sourceMasterPath = sourceMasterPath;
  built.openingWorkDir = openingWorkDir;
  writeAtomic(
    paths.master24k,
    makeWave({
      channels: 1,
      pcm: built.master,
      sampleRate: SOURCE_SAMPLE_RATE,
    }),
  );
  const expected48kSamples =
    (built.inputs.timeline.durationInFrames * OUTPUT_SAMPLE_RATE) / FPS;
  convertToFinalMix(paths.master24k, paths.finalMix, expected48kSamples);
  const masterWave = {
    ...parseWave(paths.master24k),
    filePath: paths.master24k,
  };
  const finalWave = { ...parseWave(paths.finalMix), filePath: paths.finalMix };
  if (
    masterWave.samplesPerChannel !== built.master.length / BYTES_PER_SAMPLE ||
    finalWave.samplesPerChannel !== expected48kSamples ||
    pcmStats(masterWave.pcm).clippedSamples !== 0 ||
    pcmStats(finalWave.pcm).clippedSamples !== 0
  ) {
    fail("Hybrid narration output has an invalid duration or clipped samples.");
  }
  const audit = makeAudit({ built, finalWave, masterWave, outputDir });
  writeJsonAtomic(paths.audit, audit);
  verifyBundle({ openingWorkDir, outputDir, sourceMasterPath, wavPath: null });
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
