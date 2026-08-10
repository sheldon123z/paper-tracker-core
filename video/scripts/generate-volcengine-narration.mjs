import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const captionsPath = path.join(
  projectRoot,
  "src",
  "videos",
  "innovation-explainer",
  "data",
  "captions.json",
);
const timelinePath = path.join(
  projectRoot,
  "src",
  "videos",
  "innovation-explainer",
  "data",
  "timeline.json",
);
const authorizationPath = path.join(
  projectRoot,
  "render-props",
  "innovation-tts-authorization.json",
);
const workDir = path.join(projectRoot, "output", "innovation-volcengine-tts");
const segmentDir = path.join(workDir, "segments");
const manifestPath = path.join(workDir, "manifest.json");
const auditPath = path.join(workDir, "consistency-audit.json");
const sourceMasterPath = path.join(workDir, "voice-master-24k-mono.wav");
const stagedFinalMixPath = path.join(workDir, "final-mix.wav");
const proposedCaptionsPath = path.join(workDir, "proposed-captions.json");
const proposedTimelinePath = path.join(workDir, "proposed-timeline.json");
const retimingPlanPath = path.join(workDir, "retiming-plan.json");
const remotionCliPath = path.join(
  projectRoot,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js",
);

const ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const RESOURCE_ID = "seed-tts-2.0";
const APP_KEY = "aGjiRDfUWi";
const SPEAKER = "zh_male_wennuanahu_uranus_bigtts";
const UID = "video-narration";
const SOURCE_SAMPLE_RATE = 24_000;
const OUTPUT_SAMPLE_RATE = 48_000;
const OUTPUT_CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_LINE_CHARS = 24 * 1024 * 1024;
const MAX_RESPONSE_MESSAGES = 10_000;
const MAX_PCM_BYTES = 16 * 1024 * 1024;
const CONTEXT_TEXT =
  "自然、温和、清晰地说，像技术负责人在会议中平实说明。保持音色本身的特点，不使用播音腔或广告腔，不刻意加重，语速正常，停顿自然。";
const ADDITIONS = {
  explicit_language: "zh-cn",
  silence_duration: 300,
  disable_markdown_filter: true,
  disable_emoji_filter: true,
  context_texts: [CONTEXT_TEXT],
};
const AUDIO_PARAMS = {
  format: "pcm",
  sample_rate: SOURCE_SAMPLE_RATE,
  speech_rate: 0,
  loudness_rate: 0,
};
const PUBLIC_CONFIG = {
  endpoint: ENDPOINT,
  resourceId: RESOURCE_ID,
  appKey: APP_KEY,
  uid: UID,
  speaker: SPEAKER,
  audioParams: AUDIO_PARAMS,
  additions: ADDITIONS,
  alignment: "one immutable request configuration per caption cue",
  postProcessing:
    "adaptive edge-silence trim, 8 ms edge fades, timeline placement without time stretching, global peak headroom only",
};

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

const CONFIG_SHA256 = sha256(canonicalJson(PUBLIC_CONFIG));

const writeJsonAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (
      error?.code !== "EEXIST" &&
      error?.code !== "EPERM" &&
      error?.code !== "ENOTEMPTY"
    ) {
      throw error;
    }
    fs.rmSync(filePath, { force: true });
    fs.renameSync(temporaryPath, filePath);
  }
};

const parseArguments = (tokens) => {
  const parsed = {
    force: false,
    help: false,
    offline: false,
    only: null,
    target: null,
    verify: false,
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
    } else if (token === "--force") {
      parsed.force = true;
    } else if (token === "--offline") {
      parsed.offline = true;
    } else if (token === "--verify") {
      parsed.verify = true;
    } else if (token === "--only" || token === "--target") {
      const value = tokens[++index];
      if (!value || value.startsWith("--")) {
        fail(`${token} requires a value.`);
      }
      parsed[token.slice(2)] = value;
    } else if (token.startsWith("--only=")) {
      parsed.only = token.slice("--only=".length);
    } else if (token.startsWith("--target=")) {
      parsed.target = token.slice("--target=".length);
    } else {
      fail(`Unknown argument: ${token}`);
    }
  }
  if (parsed.only !== null) {
    parsed.only = Number(parsed.only);
    if (!Number.isInteger(parsed.only) || parsed.only < 1) {
      fail("--only must be a positive, one-based caption index.");
    }
  }
  if (parsed.offline && parsed.force) {
    fail("--offline and --force cannot be used together.");
  }
  if (
    parsed.verify &&
    (parsed.offline ||
      parsed.force ||
      parsed.only !== null ||
      parsed.target !== null)
  ) {
    fail(
      "--verify cannot be combined with --offline, --force, --only, or --target.",
    );
  }
  return parsed;
};

const printHelp = () => {
  console.log(`Generate the innovation-video narration with Volcengine Seed TTS 2.0.

Usage:
  node scripts/generate-volcengine-narration.mjs
  node scripts/generate-volcengine-narration.mjs --only 1
  node scripts/generate-volcengine-narration.mjs --offline
  node scripts/generate-volcengine-narration.mjs --verify

Options:
  --only N       Generate and cache one one-based caption; do not publish a mix.
  --offline      Reuse verified cached PCM only; never call the TTS endpoint.
  --verify       Verify cached segments, manifest, audit, and the published WAV.
  --force        Regenerate requested segments instead of using valid cache files.
  --target PATH  Override the final-mix.wav destination.
  --help         Show this help.

Generation requires VOLCENGINE_TTS_API_KEY. The key is never written to disk or
included in child-process environments. Full generation creates a 48 kHz,
stereo PCM WAV whose duration matches the explicit authorization and backs up
an existing target before publish.`);
};

const loadInputs = () => {
  const captionsBytes = fs.readFileSync(captionsPath);
  const timelineBytes = fs.readFileSync(timelinePath);
  const captions = JSON.parse(captionsBytes.toString("utf8"));
  const timeline = JSON.parse(timelineBytes.toString("utf8"));
  const authorization = JSON.parse(fs.readFileSync(authorizationPath, "utf8"));
  if (!Array.isArray(captions) || captions.length !== 49) {
    fail(
      `Expected exactly 49 innovation captions; received ${captions?.length}.`,
    );
  }
  const authorizedDurationSeconds =
    authorization?.retiming?.authorizedDurationSeconds;
  const authorizedDurationInFrames = authorizedDurationSeconds * 30;
  if (
    timeline?.fps !== 30 ||
    timeline?.mode !== "volcengine-tts-voiced" ||
    !Number.isFinite(authorizedDurationSeconds) ||
    !Number.isInteger(authorizedDurationInFrames) ||
    timeline?.durationInFrames !== authorizedDurationInFrames ||
    timeline?.durationSeconds !== authorizedDurationSeconds
  ) {
    fail(
      "Innovation narration requires a voiced timeline whose duration matches the explicit TTS authorization.",
    );
  }
  const captionsSha256 = sha256(canonicalJson(captions));
  if (
    authorization?.authorized !== true ||
    authorization.endpoint !== ENDPOINT ||
    authorization.captionHashMode !== "canonical-json-v1" ||
    authorization.captionSha256 !== captionsSha256 ||
    authorization.captions?.hashMode !== "canonical-json-v1" ||
    authorization.captions?.sha256 !== captionsSha256 ||
    authorization.captions?.count !== captions.length ||
    authorization.model?.resourceId !== RESOURCE_ID ||
    authorization.application?.appKey !== APP_KEY ||
    authorization.voice?.speaker !== SPEAKER ||
    authorization.request?.user?.uid !== UID ||
    authorization.request?.audioParams?.format !== AUDIO_PARAMS.format ||
    authorization.request?.audioParams?.sampleRate !==
      AUDIO_PARAMS.sample_rate ||
    authorization.request?.audioParams?.speechRate !==
      AUDIO_PARAMS.speech_rate ||
    authorization.request?.audioParams?.loudnessRate !==
      AUDIO_PARAMS.loudness_rate ||
    authorization.request?.additions?.explicitLanguage !==
      ADDITIONS.explicit_language ||
    authorization.request?.additions?.silenceDuration !==
      ADDITIONS.silence_duration ||
    authorization.request?.additions?.disableMarkdownFilter !==
      ADDITIONS.disable_markdown_filter ||
    authorization.request?.additions?.disableEmojiFilter !==
      ADDITIONS.disable_emoji_filter ||
    authorization.request?.additions?.contextTexts?.[0] !== CONTEXT_TEXT
  ) {
    fail(
      "Innovation TTS authorization does not match the current captions and fixed request configuration.",
    );
  }
  let previousEnd = 0;
  for (const [index, caption] of captions.entries()) {
    if (
      typeof caption.text !== "string" ||
      caption.text.trim().length === 0 ||
      !Number.isFinite(caption.startMs) ||
      !Number.isFinite(caption.endMs) ||
      caption.startMs < previousEnd ||
      caption.endMs <= caption.startMs ||
      caption.endMs > timeline.durationSeconds * 1000
    ) {
      fail(`Invalid innovation caption at index ${index + 1}.`);
    }
    previousEnd = caption.endMs;
  }
  return {
    captions,
    captionsSha256,
    timeline,
    timelineSha256: sha256(canonicalJson(timeline)),
  };
};

const resolveTarget = (configuredTarget) => {
  if (configuredTarget) {
    return path.resolve(projectRoot, configuredTarget);
  }
  const assetRoot = path.resolve(
    projectRoot,
    process.env.VIDEO_ASSETS_DIR || "../../video-assets",
  );
  return path.join(
    assetRoot,
    "render-inputs",
    "innovation-explainer",
    "audio",
    "final-mix.wav",
  );
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const synthesizeOnce = async ({ apiKey, text }) => {
  const requestId = randomUUID();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": RESOURCE_ID,
      "X-Api-App-Key": APP_KEY,
      "X-Api-Request-Id": requestId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: { uid: UID },
      req_params: {
        text,
        speaker: SPEAKER,
        audio_params: AUDIO_PARAMS,
        additions: JSON.stringify(ADDITIONS),
      },
    }),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });

  const logId = response.headers.get("x-tt-logid") ?? "unavailable";
  if (!response.ok) {
    const error = new Error(
      `Volcengine TTS HTTP ${response.status}; request=${requestId}; ` +
        `logid=${logId}. Service response text was intentionally suppressed.`,
    );
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  if (!response.body) {
    fail(
      `Volcengine TTS returned no body; request=${requestId}; logid=${logId}.`,
    );
  }

  const decoder = new TextDecoder();
  const chunks = [];
  let carry = "";
  let finished = false;
  let pcmBytes = 0;
  let responseBytes = 0;
  let responseMessages = 0;

  const consumeLine = (rawLine) => {
    if (rawLine.length > MAX_RESPONSE_LINE_CHARS) {
      fail(
        `Volcengine TTS response line exceeded the safety limit; ` +
          `request=${requestId}; logid=${logId}.`,
      );
    }
    let line = rawLine.trim();
    if (!line) {
      return;
    }
    if (line.startsWith("data:")) {
      line = line.slice(5).trim();
    }
    if (!line) {
      return;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      const error = new Error(
        `Volcengine TTS returned malformed streaming JSON; ` +
          `request=${requestId}; logid=${logId}.`,
      );
      error.retryable = true;
      throw error;
    }
    responseMessages++;
    if (responseMessages > MAX_RESPONSE_MESSAGES) {
      fail(
        `Volcengine TTS response message count exceeded the safety limit; ` +
          `request=${requestId}; logid=${logId}.`,
      );
    }
    const code = Number(message.code);
    if (code === 0) {
      if (message.data) {
        const audio = Buffer.from(message.data, "base64");
        if (audio.length > 0) {
          pcmBytes += audio.length;
          if (pcmBytes > MAX_PCM_BYTES) {
            fail(
              `Volcengine TTS PCM payload exceeded the safety limit; ` +
                `request=${requestId}; logid=${logId}.`,
            );
          }
          chunks.push(audio);
        }
      }
      return;
    }
    if (code === 20_000_000) {
      finished = true;
      return;
    }
    const error = new Error(
      `Volcengine TTS ${message.code}; request=${requestId}; ` +
        `logid=${logId}. Service message was intentionally suppressed.`,
    );
    error.retryable = code === 42_900_001 || code >= 50_000_000;
    throw error;
  };

  for await (const chunk of response.body) {
    responseBytes += chunk.byteLength;
    if (responseBytes > MAX_RESPONSE_BYTES) {
      fail(
        `Volcengine TTS response exceeded the safety limit; ` +
          `request=${requestId}; logid=${logId}.`,
      );
    }
    carry += decoder.decode(chunk, { stream: true });
    for (;;) {
      const newline = carry.indexOf("\n");
      if (newline < 0) {
        break;
      }
      consumeLine(carry.slice(0, newline));
      carry = carry.slice(newline + 1);
    }
    if (carry.length > MAX_RESPONSE_LINE_CHARS) {
      fail(
        `Volcengine TTS response line exceeded the safety limit; ` +
          `request=${requestId}; logid=${logId}.`,
      );
    }
  }
  carry += decoder.decode();
  if (carry.length > MAX_RESPONSE_LINE_CHARS) {
    fail(
      `Volcengine TTS response line exceeded the safety limit; ` +
        `request=${requestId}; logid=${logId}.`,
    );
  }
  consumeLine(carry);

  if (!finished || chunks.length === 0) {
    const error = new Error(
      `Incomplete Volcengine TTS stream; request=${requestId}; logid=${logId}.`,
    );
    error.retryable = true;
    throw error;
  }
  const pcm = Buffer.concat(chunks);
  if (
    pcm.length < SOURCE_SAMPLE_RATE * BYTES_PER_SAMPLE * 0.2 ||
    pcm.length % BYTES_PER_SAMPLE !== 0 ||
    pcm.toString("ascii", 0, 4) === "RIFF"
  ) {
    fail(`Invalid raw PCM payload; request=${requestId}; logid=${logId}.`);
  }
  return { logId, pcm, requestId, responseMessages };
};

const synthesizeWithRetry = async (options) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return { ...(await synthesizeOnce(options)), attempts: attempt };
    } catch (error) {
      lastError = error;
      const networkFailure =
        error instanceof TypeError ||
        error?.name === "TimeoutError" ||
        error?.name === "AbortError";
      if (attempt === 3 || (!networkFailure && !error?.retryable)) {
        throw error;
      }
      await sleep(750 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
};

const pcmStats = (pcm) => {
  const samples = pcm.length / BYTES_PER_SAMPLE;
  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  for (let index = 0; index < samples; index++) {
    const integer = pcm.readInt16LE(index * BYTES_PER_SAMPLE);
    const value = integer / 32768;
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
    if (integer === -32768 || integer === 32767) {
      clippedSamples++;
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples));
  const toDbfs = (amplitude) =>
    amplitude > 0 ? 20 * Math.log10(amplitude) : Number.NEGATIVE_INFINITY;
  return {
    samples,
    durationSeconds: samples / SOURCE_SAMPLE_RATE,
    peak,
    peakDbfs: toDbfs(peak),
    rms,
    rmsDbfs: toDbfs(rms),
    clippedSamples,
  };
};

const rmsWindows = (pcm, windowSamples = 240) => {
  const sampleCount = pcm.length / BYTES_PER_SAMPLE;
  const values = [];
  for (let start = 0; start < sampleCount; start += windowSamples) {
    const end = Math.min(sampleCount, start + windowSamples);
    let sumSquares = 0;
    for (let sample = start; sample < end; sample++) {
      const value = pcm.readInt16LE(sample * BYTES_PER_SAMPLE) / 32768;
      sumSquares += value * value;
    }
    values.push(Math.sqrt(sumSquares / Math.max(1, end - start)));
  }
  return values;
};

const trimEdgeSilence = (pcm) => {
  const windowSamples = Math.round(SOURCE_SAMPLE_RATE * 0.01);
  const windows = rmsWindows(pcm, windowSamples);
  const peakRms = Math.max(...windows);
  const threshold = Math.max(0.0035, Math.min(0.018, peakRms * 0.055));
  const active = windows
    .map((value, index) => (value >= threshold ? index : -1))
    .filter((index) => index >= 0);
  if (active.length === 0 || peakRms < 0.006) {
    fail("Synthesized segment contains no detectable speech.");
  }

  const sourceSamples = pcm.length / BYTES_PER_SAMPLE;
  const speechStartSample = active[0] * windowSamples;
  const speechEndSample = Math.min(
    sourceSamples,
    (active.at(-1) + 1) * windowSamples,
  );
  const startSample = Math.max(
    0,
    speechStartSample - Math.round(SOURCE_SAMPLE_RATE * 0.1),
  );
  const endSample = Math.min(
    sourceSamples,
    speechEndSample + Math.round(SOURCE_SAMPLE_RATE * 0.08),
  );
  const output = Buffer.from(
    pcm.subarray(startSample * BYTES_PER_SAMPLE, endSample * BYTES_PER_SAMPLE),
  );

  const outputSamples = output.length / BYTES_PER_SAMPLE;
  const fadeSamples = Math.min(
    Math.round(SOURCE_SAMPLE_RATE * 0.008),
    Math.floor(outputSamples / 2),
  );
  for (let index = 0; index < fadeSamples; index++) {
    const gain = (index + 1) / fadeSamples;
    const tailIndex = outputSamples - 1 - index;
    output.writeInt16LE(
      Math.round(output.readInt16LE(index * 2) * gain),
      index * 2,
    );
    output.writeInt16LE(
      Math.round(output.readInt16LE(tailIndex * 2) * gain),
      tailIndex * 2,
    );
  }

  return {
    pcm: output,
    vad: {
      peakWindowRms: peakRms,
      threshold,
      removedLeadingMs: (startSample / SOURCE_SAMPLE_RATE) * 1000,
      removedTrailingMs:
        ((sourceSamples - endSample) / SOURCE_SAMPLE_RATE) * 1000,
      speechStartMs:
        ((speechStartSample - startSample) / SOURCE_SAMPLE_RATE) * 1000,
      speechEndMs:
        ((speechEndSample - startSample) / SOURCE_SAMPLE_RATE) * 1000,
    },
  };
};

const readableCharacterCount = (text) =>
  text.replace(/[\s，。；、：“”！？,.!?;：‘’（）()《》]/gu, "").length;

const segmentName = (index, text) =>
  `${String(index + 1).padStart(3, "0")}-${sha256(text).slice(0, 12)}.pcm`;

const segmentPathFor = (index, text) =>
  path.join(segmentDir, segmentName(index, text));

const validCachedSegment = (entry, index, text) => {
  if (
    !entry ||
    entry.index !== index ||
    entry.text !== text ||
    entry.configSha256 !== CONFIG_SHA256
  ) {
    return false;
  }
  const filePath = segmentPathFor(index, text);
  return (
    fs.existsSync(filePath) &&
    fs.statSync(filePath).size === entry.bytes &&
    sha256File(filePath) === entry.sha256
  );
};

const segmentSetSha256 = (segments) =>
  sha256(
    canonicalJson(
      segments.map((segment) => ({
        captionEndMs: segment.captionEndMs,
        configSha256: segment.configSha256,
        index: segment.index,
        sha256: segment.sha256,
        startMs: segment.startMs,
        textSha256: segment.textSha256,
      })),
    ),
  );

const baseManifest = (inputs, existing) => ({
  schemaVersion: 1,
  status:
    existing?.captionsSha256 === inputs.captionsSha256 &&
    existing?.timelineSha256 === inputs.timelineSha256
      ? (existing?.status ?? "partial")
      : "partial",
  generatedAt: existing?.generatedAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  captionsFile: path.relative(projectRoot, captionsPath).replaceAll("\\", "/"),
  captionsSha256: inputs.captionsSha256,
  timelineFile: path.relative(projectRoot, timelinePath).replaceAll("\\", "/"),
  timelineSha256: inputs.timelineSha256,
  durationSeconds: inputs.timeline.durationSeconds,
  durationInFrames: inputs.timeline.durationInFrames,
  fps: inputs.timeline.fps,
  config: PUBLIC_CONFIG,
  configSha256: CONFIG_SHA256,
  secretPersisted: false,
  segments: existing?.segments ?? [],
});

const loadCompatibleManifest = (inputs) => {
  if (!fs.existsSync(manifestPath)) {
    return baseManifest(inputs, null);
  }
  const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const reusable =
    existing?.schemaVersion === 1 &&
    existing.configSha256 === CONFIG_SHA256 &&
    Array.isArray(existing.segments) &&
    existing.segments.every(
      (segment, index) =>
        segment === null ||
        segment === undefined ||
        (inputs.captions[index]?.text === segment.text &&
          segment.configSha256 === CONFIG_SHA256),
    );
  if (!reusable) {
    return baseManifest(inputs, null);
  }
  return baseManifest(inputs, existing);
};

const createSegmentEntry = ({ caption, index, result, trimmed }) => {
  const stats = pcmStats(trimmed.pcm);
  const characters = readableCharacterCount(caption.text);
  return {
    index,
    cue: index + 1,
    text: caption.text,
    textSha256: sha256(caption.text),
    startMs: caption.startMs,
    captionEndMs: caption.endMs,
    file: `segments/${segmentName(index, caption.text)}`,
    bytes: trimmed.pcm.length,
    sha256: sha256(trimmed.pcm),
    configSha256: CONFIG_SHA256,
    requestId: result.requestId,
    logId: result.logId,
    attempts: result.attempts,
    responseMessages: result.responseMessages,
    durationSeconds: Number(stats.durationSeconds.toFixed(6)),
    readableCharacters: characters,
    charactersPerSecond: Number(
      (characters / stats.durationSeconds).toFixed(3),
    ),
    peakDbfs: Number(stats.peakDbfs.toFixed(3)),
    rmsDbfs: Number(stats.rmsDbfs.toFixed(3)),
    clippedSamples: stats.clippedSamples,
    vad: Object.fromEntries(
      Object.entries(trimmed.vad).map(([key, value]) => [
        key,
        Number(value.toFixed(3)),
      ]),
    ),
  };
};

const synthesizeCaption = async ({
  apiKey,
  caption,
  force,
  index,
  manifest,
}) => {
  const existing = manifest.segments[index];
  if (!force && validCachedSegment(existing, index, caption.text)) {
    console.log(
      `[${String(index + 1).padStart(2, "0")}/49] cached ` +
        `${existing.durationSeconds.toFixed(2)}s`,
    );
    return existing;
  }
  if (!apiKey) {
    fail(
      `Caption ${index + 1} has no valid cache and --offline forbids a TTS request.`,
    );
  }

  const result = await synthesizeWithRetry({ apiKey, text: caption.text });
  const trimmed = trimEdgeSilence(result.pcm);
  const entry = createSegmentEntry({ caption, index, result, trimmed });
  if (entry.clippedSamples > 0) {
    fail(`Caption ${index + 1} contains clipped PCM samples.`);
  }
  fs.mkdirSync(segmentDir, { recursive: true });
  const destination = segmentPathFor(index, caption.text);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, trimmed.pcm);
  try {
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (
      error?.code !== "EEXIST" &&
      error?.code !== "EPERM" &&
      error?.code !== "ENOTEMPTY"
    ) {
      throw error;
    }
    fs.rmSync(destination, { force: true });
    fs.renameSync(temporary, destination);
  }
  manifest.segments[index] = entry;
  manifest.status = "partial";
  delete manifest.finalMix;
  delete manifest.segmentSetSha256;
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestPath, manifest);
  console.log(
    `[${String(index + 1).padStart(2, "0")}/49] generated ` +
      `${entry.durationSeconds.toFixed(2)}s, ` +
      `${entry.charactersPerSecond.toFixed(2)} chars/s, ` +
      `${entry.rmsDbfs.toFixed(1)} dBFS`,
  );
  return entry;
};

const refreshManifestTimings = (inputs, manifest) => {
  manifest.segments = inputs.captions.map((caption, index) => ({
    ...manifest.segments[index],
    index,
    cue: index + 1,
    startMs: caption.startMs,
    captionEndMs: caption.endMs,
  }));
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestPath, manifest);
};

const buildRetimingPlan = (inputs, manifest) => {
  const durationMs = inputs.timeline.durationSeconds * 1000;
  const overflows = [];
  for (const [index, caption] of inputs.captions.entries()) {
    const entry = manifest.segments[index];
    const audioEndMs = caption.startMs + entry.durationSeconds * 1000;
    const nextStartMs = inputs.captions[index + 1]?.startMs ?? durationMs;
    if (audioEndMs > nextStartMs + 0.5) {
      overflows.push({
        cue: index + 1,
        text: caption.text,
        audioEndMs: Number(audioEndMs.toFixed(3)),
        nextCueStartMs: nextStartMs,
        overflowMs: Number((audioEndMs - nextStartMs).toFixed(3)),
      });
    }
  }
  if (overflows.length === 0) {
    return null;
  }

  const fps = inputs.timeline.fps;
  const millisecondsPerFrame = 1000 / fps;
  const proposedCaptions = [];
  const proposedScenes = [];
  let nextSceneStartFrame = 0;
  let captionCursor = 0;

  for (const scene of inputs.timeline.scenes) {
    const originalSceneStartMs = scene.startFrame * millisecondsPerFrame;
    const originalSceneEndMs =
      (scene.startFrame + scene.durationInFrames) * millisecondsPerFrame;
    const sceneCaptions = [];
    while (captionCursor < inputs.captions.length) {
      const caption = inputs.captions[captionCursor];
      if (
        caption.startMs < originalSceneStartMs - 0.5 ||
        caption.endMs > originalSceneEndMs + 0.5
      ) {
        break;
      }
      sceneCaptions.push({ caption, index: captionCursor });
      captionCursor++;
    }
    if (sceneCaptions.length === 0) {
      fail(`Cannot build a retiming plan: ${scene.id} has no captions.`);
    }

    const originalLeadFrames = Math.max(
      0,
      Math.round(
        ((sceneCaptions[0].caption.startMs - originalSceneStartMs) / 1000) *
          fps,
      ),
    );
    const originalTailFrames = Math.max(
      0,
      Math.round(
        ((originalSceneEndMs - sceneCaptions.at(-1).caption.endMs) / 1000) *
          fps,
      ),
    );
    const gapFrames = Math.max(
      1,
      Math.round(
        sceneCaptions.length > 1
          ? mean(
              sceneCaptions.slice(0, -1).map(({ caption }, index) => {
                const next = sceneCaptions[index + 1].caption;
                return ((next.startMs - caption.endMs) / 1000) * fps;
              }),
            )
          : 0.2 * fps,
      ),
    );

    let captionStartFrame = nextSceneStartFrame + originalLeadFrames;
    for (const [localIndex, { caption, index }] of sceneCaptions.entries()) {
      const audioFrames = Math.ceil(
        manifest.segments[index].durationSeconds * fps,
      );
      const captionEndFrame = captionStartFrame + audioFrames;
      proposedCaptions.push({
        ...caption,
        startMs: Number(((captionStartFrame / fps) * 1000).toFixed(3)),
        endMs: Number(((captionEndFrame / fps) * 1000).toFixed(3)),
      });
      captionStartFrame =
        captionEndFrame +
        (localIndex === sceneCaptions.length - 1 ? 0 : gapFrames);
    }

    const requiredDurationFrames =
      captionStartFrame + originalTailFrames - nextSceneStartFrame;
    const durationInFrames = Math.max(
      scene.durationInFrames,
      requiredDurationFrames,
    );
    proposedScenes.push({
      ...scene,
      startFrame: nextSceneStartFrame,
      durationInFrames,
      startSeconds: Number((nextSceneStartFrame / fps).toFixed(6)),
      durationSeconds: Number((durationInFrames / fps).toFixed(6)),
    });
    nextSceneStartFrame += durationInFrames;
  }
  if (captionCursor !== inputs.captions.length) {
    fail(
      `Cannot build a retiming plan: assigned ${captionCursor} of ` +
        `${inputs.captions.length} captions.`,
    );
  }

  const proposedTimeline = {
    ...inputs.timeline,
    durationInFrames: nextSceneStartFrame,
    durationSeconds: Number((nextSceneStartFrame / fps).toFixed(6)),
    mode: "volcengine-tts-voiced",
    scenes: proposedScenes,
  };
  return {
    schemaVersion: 1,
    status: "retiming-required",
    generatedAt: new Date().toISOString(),
    reason:
      "Normal-speed TTS exceeds at least one reviewed cue; no segment was time-stretched.",
    configSha256: CONFIG_SHA256,
    sourceCaptionsSha256: inputs.captionsSha256,
    sourceTimelineSha256: inputs.timelineSha256,
    sourceDurationSeconds: inputs.timeline.durationSeconds,
    proposedDurationSeconds: proposedTimeline.durationSeconds,
    proposedDurationInFrames: proposedTimeline.durationInFrames,
    overflows,
    proposedCaptions,
    proposedTimeline,
  };
};

const createMasterPcm = (inputs, manifest) => {
  const totalSamples = inputs.timeline.durationSeconds * SOURCE_SAMPLE_RATE;
  const master = Buffer.alloc(totalSamples * BYTES_PER_SAMPLE);
  const placement = [];

  for (const [index, caption] of inputs.captions.entries()) {
    const entry = manifest.segments[index];
    if (!validCachedSegment(entry, index, caption.text)) {
      fail(`Missing or invalid cached narration segment ${index + 1}.`);
    }
    const pcm = fs.readFileSync(segmentPathFor(index, caption.text));
    const startSample = Math.round(
      (caption.startMs / 1000) * SOURCE_SAMPLE_RATE,
    );
    const endSample = startSample + pcm.length / BYTES_PER_SAMPLE;
    const nextStartMs =
      inputs.captions[index + 1]?.startMs ??
      inputs.timeline.durationSeconds * 1000;
    const nextStartSample = Math.round(
      (nextStartMs / 1000) * SOURCE_SAMPLE_RATE,
    );
    if (endSample > nextStartSample) {
      const overflowMs =
        ((endSample - nextStartSample) / SOURCE_SAMPLE_RATE) * 1000;
      fail(
        `Caption ${index + 1} exceeds the next cue by ` +
          `${overflowMs.toFixed(0)} ms at speech_rate=0. ` +
          "The timeline must be retimed; per-caption speed changes are forbidden.",
      );
    }
    pcm.copy(master, startSample * BYTES_PER_SAMPLE);
    const actualEndMs = (endSample / SOURCE_SAMPLE_RATE) * 1000;
    placement.push({
      cue: index + 1,
      startMs: caption.startMs,
      captionEndMs: caption.endMs,
      audioEndMs: Number(actualEndMs.toFixed(3)),
      nextCueStartMs: nextStartMs,
      endDeltaFromCaptionMs: Number((actualEndMs - caption.endMs).toFixed(3)),
      safetyGapMs: Number((nextStartMs - actualEndMs).toFixed(3)),
    });
  }

  const statsBeforeGain = pcmStats(master);
  const targetPeak = 10 ** (-3 / 20);
  const gain =
    statsBeforeGain.peak > targetPeak ? targetPeak / statsBeforeGain.peak : 1;
  if (gain < 1) {
    for (let index = 0; index < totalSamples; index++) {
      master.writeInt16LE(
        Math.round(master.readInt16LE(index * 2) * gain),
        index * 2,
      );
    }
  }
  return {
    master,
    placement,
    appliedGlobalGainDb: Number((20 * Math.log10(gain)).toFixed(3)),
    stats: pcmStats(master),
  };
};

const writePcmWave = ({ channels, filePath, pcm, sampleRate }) => {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * BYTES_PER_SAMPLE;
  const blockAlign = channels * BYTES_PER_SAMPLE;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
};

const scrubbedChildEnvironment = () => {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === "VOLCENGINE_TTS_API_KEY") {
      delete environment[key];
    }
  }
  return environment;
};

const convertMaster = (durationSeconds) => {
  if (!fs.existsSync(remotionCliPath)) {
    fail(`Remotion CLI is missing: ${remotionCliPath}`);
  }
  const result = spawnSync(
    process.execPath,
    [
      remotionCliPath,
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourceMasterPath,
      "-af",
      `aresample=${OUTPUT_SAMPLE_RATE},` +
        `aformat=sample_fmts=s16:sample_rates=${OUTPUT_SAMPLE_RATE}:` +
        `channel_layouts=stereo,apad=whole_dur=${durationSeconds},` +
        `atrim=duration=${durationSeconds}`,
      "-c:a",
      "pcm_s16le",
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-ac",
      String(OUTPUT_CHANNELS),
      stagedFinalMixPath,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: scrubbedChildEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`FFmpeg conversion failed: ${String(result.stderr).trim()}`);
  }
};

const locateWaveData = (buffer) => {
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    fail("Expected a RIFF/WAVE output.");
  }
  let format = null;
  let dataOffset = null;
  let dataBytes = null;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) {
      fail(`Truncated ${id} WAVE chunk.`);
    }
    if (id === "fmt " && size >= 16) {
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      dataOffset = start;
      dataBytes = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!format || dataOffset === null || dataBytes === null) {
    fail("WAVE output has no supported fmt/data chunks.");
  }
  return { ...format, dataOffset, dataBytes };
};

const verifyFinalWave = (filePath, expectedSamplesPerChannel) => {
  if (!fs.existsSync(filePath)) {
    fail(`Final narration WAV is missing: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const wave = locateWaveData(buffer);
  const samplesPerChannel = wave.dataBytes / (wave.channels * BYTES_PER_SAMPLE);
  if (
    wave.encoding !== 1 ||
    wave.channels !== OUTPUT_CHANNELS ||
    wave.sampleRate !== OUTPUT_SAMPLE_RATE ||
    wave.bitsPerSample !== 16 ||
    samplesPerChannel !== expectedSamplesPerChannel
  ) {
    fail(
      `Unexpected final WAV: ${wave.sampleRate} Hz, ${wave.channels} ch, ` +
        `${wave.bitsPerSample}-bit, ${samplesPerChannel} samples/channel.`,
    );
  }
  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  const totalSamples = wave.dataBytes / BYTES_PER_SAMPLE;
  for (let index = 0; index < totalSamples; index++) {
    const integer = buffer.readInt16LE(wave.dataOffset + index * 2);
    const value = integer / 32768;
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
    if (integer === -32768 || integer === 32767) {
      clippedSamples++;
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, totalSamples));
  const peakDbfs = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const rmsDbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  if (clippedSamples !== 0 || peakDbfs > -2.9) {
    fail(
      `Final WAV is not peak-safe: ${peakDbfs.toFixed(2)} dBFS, ` +
        `${clippedSamples} clipped samples.`,
    );
  }
  return {
    path: filePath,
    bytes: buffer.length,
    sha256: sha256(buffer),
    sampleRate: wave.sampleRate,
    channels: wave.channels,
    bitsPerSample: wave.bitsPerSample,
    samplesPerChannel,
    durationSeconds: samplesPerChannel / wave.sampleRate,
    peakDbfs: Number(peakDbfs.toFixed(3)),
    rmsDbfs: Number(rmsDbfs.toFixed(3)),
    clippedSamples,
  };
};

const publishFinalMix = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let backup = null;
  if (fs.existsSync(targetPath)) {
    const existingHash = sha256File(targetPath);
    const stagedHash = sha256File(stagedFinalMixPath);
    if (existingHash === stagedHash) {
      return { backup: null, changed: false };
    }
    backup = path.join(
      path.dirname(targetPath),
      `final-mix.pre-volcengine-tts.${existingHash.slice(0, 12)}.wav`,
    );
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(targetPath, backup, fs.constants.COPYFILE_EXCL);
    }
  }
  const temporary = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  fs.copyFileSync(stagedFinalMixPath, temporary);
  if (sha256File(temporary) !== sha256File(stagedFinalMixPath)) {
    fs.rmSync(temporary, { force: true });
    fail("Final-mix staging copy failed SHA-256 verification.");
  }
  try {
    fs.renameSync(temporary, targetPath);
  } catch (error) {
    if (
      error?.code !== "EEXIST" &&
      error?.code !== "EPERM" &&
      error?.code !== "ENOTEMPTY"
    ) {
      throw error;
    }
    fs.rmSync(targetPath, { force: true });
    fs.renameSync(temporary, targetPath);
  }
  return { backup, changed: true };
};

const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values) => {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
};

const roundedRange = (values) => ({
  min: Number(Math.min(...values).toFixed(3)),
  median: Number(
    [...values]
      .sort((left, right) => left - right)
      [Math.floor(values.length / 2)].toFixed(3),
  ),
  max: Number(Math.max(...values).toFixed(3)),
  mean: Number(mean(values).toFixed(3)),
  standardDeviation: Number(standardDeviation(values).toFixed(3)),
});

const buildAudit = ({
  finalWave,
  inputs,
  manifest,
  masterResult,
  publishResult,
  targetPath,
}) => {
  const segments = manifest.segments;
  const configFingerprints = new Set(
    segments.map((segment) => segment.configSha256),
  );
  const clipped = segments.reduce(
    (sum, segment) => sum + segment.clippedSamples,
    0,
  );
  if (configFingerprints.size !== 1 || !configFingerprints.has(CONFIG_SHA256)) {
    fail("Narration segments do not share one immutable TTS configuration.");
  }
  if (clipped !== 0) {
    fail(`Narration source contains ${clipped} clipped samples.`);
  }
  return {
    schemaVersion: 1,
    status: "passed",
    generatedAt: new Date().toISOString(),
    captionsSha256: inputs.captionsSha256,
    timelineSha256: inputs.timelineSha256,
    configSha256: CONFIG_SHA256,
    segmentSetSha256: manifest.segmentSetSha256,
    config: PUBLIC_CONFIG,
    guarantees: {
      oneSpeaker: new Set(segments.map(() => SPEAKER)).size === 1,
      oneModel: new Set(segments.map(() => RESOURCE_ID)).size === 1,
      oneSpeechRate: AUDIO_PARAMS.speech_rate === 0,
      oneLoudnessRate: AUDIO_PARAMS.loudness_rate === 0,
      oneContextInstruction: ADDITIONS.context_texts.length === 1,
      noPerSegmentTimeStretching: true,
      noPerSegmentGainChanges: true,
      allRequestConfigurationsMatch: configFingerprints.size === 1,
      allTextMatchesCaptions: segments.every(
        (segment, index) => segment.text === inputs.captions[index].text,
      ),
      secretPersisted: false,
    },
    segmentCount: segments.length,
    segmentMetrics: {
      durationSeconds: roundedRange(
        segments.map((segment) => segment.durationSeconds),
      ),
      charactersPerSecond: roundedRange(
        segments.map((segment) => segment.charactersPerSecond),
      ),
      rmsDbfs: roundedRange(segments.map((segment) => segment.rmsDbfs)),
      peakDbfs: roundedRange(segments.map((segment) => segment.peakDbfs)),
      clippedSamples: clipped,
    },
    placement: masterResult.placement,
    mastering: {
      sourceSampleRate: SOURCE_SAMPLE_RATE,
      outputSampleRate: OUTPUT_SAMPLE_RATE,
      outputChannels: OUTPUT_CHANNELS,
      appliedGlobalGainDb: masterResult.appliedGlobalGainDb,
      finalWave,
    },
    publication: {
      target: targetPath,
      changed: publishResult.changed,
      backup: publishResult.backup,
    },
  };
};

const verifyCachedBundle = (inputs, targetPath) => {
  if (!fs.existsSync(manifestPath) || !fs.existsSync(auditPath)) {
    fail("Narration manifest or consistency audit is missing.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const currentSegmentSetSha256 = segmentSetSha256(manifest.segments ?? []);
  if (
    manifest.status !== "complete" ||
    manifest.configSha256 !== CONFIG_SHA256 ||
    manifest.captionsSha256 !== inputs.captionsSha256 ||
    manifest.timelineSha256 !== inputs.timelineSha256 ||
    manifest.segments?.length !== inputs.captions.length ||
    manifest.segmentSetSha256 !== currentSegmentSetSha256 ||
    audit.status !== "passed" ||
    audit.configSha256 !== CONFIG_SHA256 ||
    audit.captionsSha256 !== inputs.captionsSha256 ||
    audit.timelineSha256 !== inputs.timelineSha256 ||
    audit.segmentCount !== inputs.captions.length ||
    audit.segmentSetSha256 !== currentSegmentSetSha256
  ) {
    fail(
      "Narration manifest/audit does not match current source and TTS config.",
    );
  }
  for (const [index, caption] of inputs.captions.entries()) {
    if (!validCachedSegment(manifest.segments[index], index, caption.text)) {
      fail(`Cached narration segment ${index + 1} failed verification.`);
    }
  }
  const expectedSamples = inputs.timeline.durationSeconds * OUTPUT_SAMPLE_RATE;
  const staged = verifyFinalWave(stagedFinalMixPath, expectedSamples);
  const published = verifyFinalWave(targetPath, expectedSamples);
  if (
    staged.sha256 !== published.sha256 ||
    manifest.finalMix?.sha256 !== published.sha256 ||
    audit.mastering?.finalWave?.sha256 !== published.sha256
  ) {
    fail("Published final mix does not match the staged/audited WAV.");
  }
  console.log(
    JSON.stringify(
      {
        status: "verified",
        segmentCount: manifest.segments.length,
        configSha256: CONFIG_SHA256,
        captionsSha256: inputs.captionsSha256,
        finalMix: published,
      },
      null,
      2,
    ),
  );
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const inputs = loadInputs();
  const targetPath = resolveTarget(args.target);
  if (args.verify) {
    verifyCachedBundle(inputs, targetPath);
    return;
  }

  const apiKey = args.offline
    ? null
    : (process.env.VOLCENGINE_TTS_API_KEY ?? null);
  if (!args.offline && !apiKey) {
    fail(
      "Missing VOLCENGINE_TTS_API_KEY. Use the secure PowerShell wrapper or " +
        "supply it only through the process environment.",
    );
  }
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase() === "VOLCENGINE_TTS_API_KEY") {
      delete process.env[key];
    }
  }
  if (args.only !== null && args.only > inputs.captions.length) {
    fail(`--only must be between 1 and ${inputs.captions.length}.`);
  }

  fs.mkdirSync(segmentDir, { recursive: true });
  const manifest = loadCompatibleManifest(inputs);
  const indexes =
    args.only === null
      ? inputs.captions.map((_, index) => index)
      : [args.only - 1];
  for (const index of indexes) {
    await synthesizeCaption({
      apiKey,
      caption: inputs.captions[index],
      force: args.force,
      index,
      manifest,
    });
  }

  if (args.only !== null) {
    console.log(
      `Probe/cache generation completed for caption ${args.only}; no final mix was published.`,
    );
    return;
  }

  refreshManifestTimings(inputs, manifest);
  const retimingPlan = buildRetimingPlan(inputs, manifest);
  if (retimingPlan) {
    writeJsonAtomic(proposedCaptionsPath, retimingPlan.proposedCaptions);
    writeJsonAtomic(proposedTimelinePath, retimingPlan.proposedTimeline);
    writeJsonAtomic(retimingPlanPath, {
      ...retimingPlan,
      proposedCaptions: path
        .relative(projectRoot, proposedCaptionsPath)
        .replaceAll("\\", "/"),
      proposedTimeline: path
        .relative(projectRoot, proposedTimelinePath)
        .replaceAll("\\", "/"),
    });
    manifest.status = "retiming-required";
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestPath, manifest);
    fail(
      `Normal-speed narration requires ${retimingPlan.proposedDurationSeconds}s ` +
        `(${retimingPlan.proposedDurationInFrames} frames). Review and apply ` +
        `${retimingPlanPath}; cached audio will be reused.`,
    );
  }

  const masterResult = createMasterPcm(inputs, manifest);
  writePcmWave({
    channels: 1,
    filePath: sourceMasterPath,
    pcm: masterResult.master,
    sampleRate: SOURCE_SAMPLE_RATE,
  });
  convertMaster(inputs.timeline.durationSeconds);
  const expectedSamples = inputs.timeline.durationSeconds * OUTPUT_SAMPLE_RATE;
  const stagedWave = verifyFinalWave(stagedFinalMixPath, expectedSamples);
  const publishResult = publishFinalMix(targetPath);
  const publishedWave = verifyFinalWave(targetPath, expectedSamples);
  if (stagedWave.sha256 !== publishedWave.sha256) {
    fail("Published final mix differs from the verified staged WAV.");
  }

  manifest.status = "complete";
  manifest.updatedAt = new Date().toISOString();
  manifest.segmentSetSha256 = segmentSetSha256(manifest.segments);
  manifest.finalMix = {
    file: path.relative(projectRoot, stagedFinalMixPath).replaceAll("\\", "/"),
    target: targetPath,
    sha256: publishedWave.sha256,
  };
  writeJsonAtomic(manifestPath, manifest);
  const audit = buildAudit({
    finalWave: publishedWave,
    inputs,
    manifest,
    masterResult,
    publishResult,
    targetPath,
  });
  writeJsonAtomic(auditPath, audit);
  console.log(
    JSON.stringify(
      {
        status: "complete",
        segments: manifest.segments.length,
        configSha256: CONFIG_SHA256,
        finalMix: publishedWave,
        backup: publishResult.backup,
        audit: auditPath,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(`Volcengine narration failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
