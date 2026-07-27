import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadInnovationMasterConfig } from "./innovation-master-config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const masterConfig = loadInnovationMasterConfig(projectRoot);
const FPS = masterConfig.fps;
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS;
if (!Number.isInteger(SAMPLES_PER_FRAME)) {
  throw new Error(
    `The ${SAMPLE_RATE} Hz master sample rate is not divisible by ${FPS} fps.`,
  );
}
const OUTPUT_FRAMES = masterConfig.outputDurationInFrames;
const OUTPUT_SAMPLES = OUTPUT_FRAMES * SAMPLES_PER_FRAME;
const EXPECTED_SEGMENTS = 49;
const FADE_IN_SECONDS = 1.5;
const FADE_OUT_SECONDS = 4;
const DUCK_REDUCTION_DB = 5;
const DUCK_ATTACK_SECONDS = 0.35;
const DUCK_RELEASE_SECONDS = 0.85;
const TARGET_NARRATED_MUSIC_RMS_DBFS = -33.1;
const FINAL_PEAK_LIMIT_DBFS = -1.5;
const FINAL_PEAK_LIMIT = 10 ** (FINAL_PEAK_LIMIT_DBFS / 20);

const EXPECTED_NARRATION_MANIFEST_SHA256 =
  "85CAC4F92D7B9DFCA7EC71EECAEA908EE8A6C032242CD7B114644B0F72AD40F8";
const EXPECTED_PICTURE_MASTER_SHA256 = masterConfig.pictureMasterSha256;
const EXPECTED_SEGMENT_05_SHA256 =
  "568CC5CC37B6395641163572717A2D11C705C0B48EA9C96831FACB11DD684AA8";
const EXPECTED_TARGET_TEXT = "可信可控的智能化科研支撑。";
const EXPECTED_VOICE_MASTER_SHA256 =
  "8E7B6BFD1BB38F3795F3EC9D4D9444F5D69462BE10B091EF58DB29B8BA9E8F9C";
const EXPECTED_MUSIC_SOURCE_SHA256 =
  "3632834CCE1D31EF41EBD5D8B1DCFF5508187AA797917BEE524BD77BF8DA1F48";

const MUSIC_TITLE = "Machinery of the Stars";
const MUSIC_ARTIST = "Scott Buckley";
const MUSIC_PAGE =
  "https://www.scottbuckley.com.au/library/machinery-of-the-stars/";
const MUSIC_LICENSE = "CC BY 4.0";
const MUSIC_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const MUSIC_ATTRIBUTION =
  "'Machinery of the Stars' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au";

const outputDir = path.join(projectRoot, "output", "innovation-final");
const narrationSourceDir = path.join(outputDir, "narration-source");
const manifestPath = path.join(narrationSourceDir, "manifest.json");
const narrationAuditPath = path.join(narrationSourceDir, "timing-audit.json");
const pictureMasterPath = path.join(outputDir, "picture-master.mp4");
const voiceMasterPath = path.join(outputDir, "voice-only-reference.wav");
const musicSourcePath = path.join(
  outputDir,
  "source-machinery-of-the-stars-scott-buckley.mp3",
);
const decodedMusicPath = path.join(outputDir, "music-source-decoded.wav");
const musicOnlyPath = path.join(
  outputDir,
  "background-music-synced-bgm.wav",
);
const finalMixPath = path.join(
  outputDir,
  "natural-final-mix-synced-bgm.wav",
);
const auditPath = path.join(
  outputDir,
  "natural-final-audit-synced-bgm.json",
);
const licensePath = path.join(outputDir, "music-license.json");
const creditPath = path.join(outputDir, "MUSIC-CREDIT.txt");
const finalBgmVideoPath = path.join(
  projectRoot,
  "output",
  "paper-tracker-innovation-explainer-voiced-bgm.mp4",
);
const finalNoBgmVideoPath = path.join(
  projectRoot,
  "output",
  "paper-tracker-innovation-explainer-voiced-no-bgm.mp4",
);
const remotionCliPath = path.join(
  projectRoot,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js",
);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));
const round = (value, digits = 8) => Number(value.toFixed(digits));
const dbfs = (amplitude) =>
  amplitude > 0 ? 20 * Math.log10(amplitude) : Number.NEGATIVE_INFINITY;
const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const formatPath = (filePath) =>
  path.relative(projectRoot, filePath).replaceAll("\\", "/");

const sha256File = async (filePath) =>
  await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex").toUpperCase()));
  });

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJsonAtomic = (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
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

const runRemotion = async (args, description, { capture = false } = {}) =>
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [remotionCliPath, ...args], {
      cwd: projectRoot,
      stdio: capture
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = capture && stderr.trim() ? `: ${stderr.trim()}` : "";
      reject(
        new Error(
          `${description} failed (${signal ? `signal ${signal}` : `exit ${code}`})${detail}`,
        ),
      );
    });
  });

const runFfprobe = async (filePath) => {
  const { stdout } = await runRemotion(
    [
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration,bit_rate:stream=index,codec_type,codec_name,width,height," +
        "pix_fmt,color_space,color_transfer,color_primaries,color_range," +
        "avg_frame_rate,r_frame_rate,nb_frames,duration,start_time,sample_rate," +
        "channels,bit_rate",
      "-of",
      "json",
      filePath,
    ],
    `ffprobe ${path.basename(filePath)}`,
    { capture: true },
  );
  return JSON.parse(stdout);
};

const locateWaveData = (
  buffer,
  { expectedSamples = OUTPUT_SAMPLES } = {},
) => {
  assert(
    buffer.length >= 44 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WAVE",
    "Expected a RIFF/WAVE file.",
  );
  let format = null;
  let dataOffset = null;
  let dataBytes = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert(start + size <= buffer.length, `Truncated ${id} WAVE chunk.`);
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
  assert(
    format?.encoding === 1 &&
      format.channels === CHANNELS &&
      format.sampleRate === SAMPLE_RATE &&
      format.bitsPerSample === 16 &&
      dataOffset !== null &&
      dataBytes !== null,
    "Unexpected PCM WAVE format.",
  );
  const samplesPerChannel = dataBytes / (CHANNELS * BYTES_PER_SAMPLE);
  if (expectedSamples !== null) {
    assert(
      samplesPerChannel === expectedSamples,
      `Unexpected PCM duration: ${samplesPerChannel} samples per channel.`,
    );
  }
  return { ...format, dataOffset, dataBytes, samplesPerChannel };
};

const mergeFrameIntervals = (segments) => {
  const sorted = segments
    .map((segment) => ({
      start: segment.shiftedStartFrame,
      end: segment.extendedEndFrame,
    }))
    .sort((left, right) => left.start - right.start);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
};

const inspectWave = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const wave = locateWaveData(buffer);
  const interleavedSamples = wave.samplesPerChannel * wave.channels;
  const squareSums = Array(wave.channels).fill(0);
  const peaks = Array(wave.channels).fill(0);
  let clippedSamples = 0;
  for (let index = 0; index < interleavedSamples; index += 1) {
    const channel = index % wave.channels;
    const value =
      buffer.readInt16LE(wave.dataOffset + index * BYTES_PER_SAMPLE) / 32768;
    const absolute = Math.abs(value);
    peaks[channel] = Math.max(peaks[channel], absolute);
    squareSums[channel] += value * value;
    if (absolute >= 32767 / 32768) {
      clippedSamples += 1;
    }
  }
  const peak = Math.max(...peaks);
  const rms = Math.sqrt(
    squareSums.reduce((sum, value) => sum + value, 0) / interleavedSamples,
  );
  return {
    file: formatPath(filePath),
    sha256: await sha256File(filePath),
    bytes: buffer.length,
    sampleRate: wave.sampleRate,
    channels: wave.channels,
    bitsPerSample: wave.bitsPerSample,
    samplesPerChannel: wave.samplesPerChannel,
    durationFrames: wave.samplesPerChannel / SAMPLES_PER_FRAME,
    durationSeconds: round(wave.samplesPerChannel / wave.sampleRate, 9),
    peak: round(peak, 8),
    peakDbfs: round(dbfs(peak), 4),
    rms: round(rms, 8),
    rmsDbfs: round(dbfs(rms), 4),
    clippedSamples,
  };
};

const measureWaveIntervals = (filePath, intervals) => {
  const buffer = fs.readFileSync(filePath);
  const wave = locateWaveData(buffer);
  let squareSum = 0;
  let interleavedSamples = 0;
  let peak = 0;
  for (const interval of intervals) {
    const startSample = interval.start * SAMPLES_PER_FRAME;
    const endSample = interval.end * SAMPLES_PER_FRAME;
    for (let sample = startSample; sample < endSample; sample += 1) {
      const interleavedBase = sample * wave.channels;
      for (let channel = 0; channel < wave.channels; channel += 1) {
        const value =
          buffer.readInt16LE(
            wave.dataOffset +
              (interleavedBase + channel) * BYTES_PER_SAMPLE,
          ) / 32768;
        squareSum += value * value;
        peak = Math.max(peak, Math.abs(value));
        interleavedSamples += 1;
      }
    }
  }
  const rms = Math.sqrt(squareSum / interleavedSamples);
  return {
    intervals: intervals.length,
    frames: intervals.reduce(
      (sum, interval) => sum + interval.end - interval.start,
      0,
    ),
    rms: round(rms, 8),
    rmsDbfs: round(dbfs(rms), 4),
    peak: round(peak, 8),
    peakDbfs: round(dbfs(peak), 4),
  };
};

const makeBiquadCoefficients = ({
  type,
  frequency,
  q = Math.SQRT1_2,
  gainDb = 0,
}) => {
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const alpha = sine / (2 * q);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  if (type === "highpass") {
    b0 = (1 + cosine) / 2;
    b1 = -(1 + cosine);
    b2 = (1 + cosine) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosine;
    a2 = 1 - alpha;
  } else if (type === "peaking") {
    const amplitude = 10 ** (gainDb / 40);
    b0 = 1 + alpha * amplitude;
    b1 = -2 * cosine;
    b2 = 1 - alpha * amplitude;
    a0 = 1 + alpha / amplitude;
    a1 = -2 * cosine;
    a2 = 1 - alpha / amplitude;
  } else {
    throw new Error(`Unsupported biquad type: ${type}`);
  }
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
};

const applyBiquad = (sample, coefficients, state) => {
  const output =
    coefficients.b0 * sample +
    coefficients.b1 * state.x1 +
    coefficients.b2 * state.x2 -
    coefficients.a1 * state.y1 -
    coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = sample;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
};

const buildDuckEnvelope = (intervals) => {
  const envelope = new Float32Array(OUTPUT_SAMPLES);
  envelope.fill(1);
  const duckGain = 10 ** (-DUCK_REDUCTION_DB / 20);
  const attackSamples = Math.round(DUCK_ATTACK_SECONDS * SAMPLE_RATE);
  const releaseSamples = Math.round(DUCK_RELEASE_SECONDS * SAMPLE_RATE);
  for (const interval of intervals) {
    const start = interval.start * SAMPLES_PER_FRAME;
    const end = interval.end * SAMPLES_PER_FRAME;
    const attackStart = Math.max(0, start - attackSamples);
    const releaseEnd = Math.min(OUTPUT_SAMPLES, end + releaseSamples);
    for (let sample = attackStart; sample < start; sample += 1) {
      const progress = (sample - attackStart) / Math.max(1, start - attackStart);
      const gain = 1 - smoothstep(progress) * (1 - duckGain);
      envelope[sample] = Math.min(envelope[sample], gain);
    }
    for (let sample = start; sample < Math.min(end, OUTPUT_SAMPLES); sample += 1) {
      envelope[sample] = Math.min(envelope[sample], duckGain);
    }
    for (let sample = end; sample < releaseEnd; sample += 1) {
      const progress = (sample - end) / Math.max(1, releaseEnd - end);
      const gain = duckGain + smoothstep(progress) * (1 - duckGain);
      envelope[sample] = Math.min(envelope[sample], gain);
    }
  }
  return {
    envelope,
    duckGain,
    attackSamples,
    releaseSamples,
    minimumGain: envelope.reduce(
      (minimum, value) => Math.min(minimum, value),
      1,
    ),
  };
};

const createNarrationMask = (intervals) => {
  const mask = new Uint8Array(OUTPUT_SAMPLES);
  for (const interval of intervals) {
    mask.fill(
      1,
      interval.start * SAMPLES_PER_FRAME,
      interval.end * SAMPLES_PER_FRAME,
    );
  }
  return mask;
};

const processMusicAndMix = async (intervals) => {
  const musicBuffer = fs.readFileSync(decodedMusicPath);
  const musicWave = locateWaveData(musicBuffer);
  const voiceBuffer = fs.readFileSync(voiceMasterPath);
  const voiceWave = locateWaveData(voiceBuffer);
  const interleavedSamples = OUTPUT_SAMPLES * CHANNELS;
  const musicFloat = new Float32Array(interleavedSamples);
  const narrationMask = createNarrationMask(intervals);
  const duck = buildDuckEnvelope(intervals);
  const highpass = makeBiquadCoefficients({
    type: "highpass",
    frequency: 70,
  });
  const presenceCut = makeBiquadCoefficients({
    type: "peaking",
    frequency: 2800,
    q: 0.8,
    gainDb: -2,
  });
  const states = Array.from({ length: CHANNELS }, () => ({
    highpass: { x1: 0, x2: 0, y1: 0, y2: 0 },
    presence: { x1: 0, x2: 0, y1: 0, y2: 0 },
  }));
  const fadeInSamples = Math.round(FADE_IN_SECONDS * SAMPLE_RATE);
  const fadeOutSamples = Math.round(FADE_OUT_SECONDS * SAMPLE_RATE);
  let narratedSquareSum = 0;
  let narratedInterleavedSamples = 0;
  let processedPeak = 0;

  for (let sample = 0; sample < OUTPUT_SAMPLES; sample += 1) {
    const fadeIn =
      sample < fadeInSamples ? smoothstep(sample / fadeInSamples) : 1;
    const fadeOutStart = OUTPUT_SAMPLES - fadeOutSamples;
    const fadeOut =
      sample >= fadeOutStart
        ? smoothstep((OUTPUT_SAMPLES - 1 - sample) / fadeOutSamples)
        : 1;
    const envelopeGain = duck.envelope[sample] * fadeIn * fadeOut;
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const index = sample * CHANNELS + channel;
      const input =
        musicBuffer.readInt16LE(
          musicWave.dataOffset + index * BYTES_PER_SAMPLE,
        ) / 32768;
      const filtered = applyBiquad(
        applyBiquad(input, highpass, states[channel].highpass),
        presenceCut,
        states[channel].presence,
      );
      const value = filtered * envelopeGain;
      musicFloat[index] = value;
      processedPeak = Math.max(processedPeak, Math.abs(value));
      if (narrationMask[sample] === 1) {
        narratedSquareSum += value * value;
        narratedInterleavedSamples += 1;
      }
    }
  }

  const preGainNarratedRms = Math.sqrt(
    narratedSquareSum / narratedInterleavedSamples,
  );
  const targetNarratedRms = 10 ** (TARGET_NARRATED_MUSIC_RMS_DBFS / 20);
  const targetGain = targetNarratedRms / preGainNarratedRms;
  let safetyGain = 1;
  for (let index = 0; index < interleavedSamples; index += 1) {
    const voice =
      voiceBuffer.readInt16LE(
        voiceWave.dataOffset + index * BYTES_PER_SAMPLE,
      ) / 32768;
    const music = musicFloat[index] * targetGain;
    const combined = voice + music;
    if (combined > FINAL_PEAK_LIMIT && music > 0) {
      safetyGain = Math.min(
        safetyGain,
        Math.max(0, (FINAL_PEAK_LIMIT - voice) / music),
      );
    } else if (combined < -FINAL_PEAK_LIMIT && music < 0) {
      safetyGain = Math.min(
        safetyGain,
        Math.max(0, (-FINAL_PEAK_LIMIT - voice) / music),
      );
    }
  }
  safetyGain = Math.min(1, safetyGain * 0.998);
  const finalMusicGain = targetGain * safetyGain;
  const outputMusicBuffer = Buffer.from(musicBuffer);
  const outputMixBuffer = Buffer.from(voiceBuffer);
  let finalMixPeak = 0;
  let finalMusicPeak = 0;
  for (let index = 0; index < interleavedSamples; index += 1) {
    const voice =
      voiceBuffer.readInt16LE(
        voiceWave.dataOffset + index * BYTES_PER_SAMPLE,
      ) / 32768;
    const music = musicFloat[index] * finalMusicGain;
    const mix = voice + music;
    finalMusicPeak = Math.max(finalMusicPeak, Math.abs(music));
    finalMixPeak = Math.max(finalMixPeak, Math.abs(mix));
    const musicQuantized = Math.round(
      clamp(music, -1, 1) * (music < 0 ? 32768 : 32767),
    );
    const mixQuantized = Math.round(
      clamp(mix, -1, 1) * (mix < 0 ? 32768 : 32767),
    );
    outputMusicBuffer.writeInt16LE(
      musicQuantized,
      musicWave.dataOffset + index * BYTES_PER_SAMPLE,
    );
    outputMixBuffer.writeInt16LE(
      mixQuantized,
      voiceWave.dataOffset + index * BYTES_PER_SAMPLE,
    );
  }
  fs.writeFileSync(musicOnlyPath, outputMusicBuffer);
  fs.writeFileSync(finalMixPath, outputMixBuffer);
  return {
    processing:
      "single MP3 decode to PCM; 70 Hz high-pass; -2 dB presence cut at 2.8 kHz; narration duck; fades; one gain stage; PCM mix with the locked voice master",
    sourceStartSeconds: 0,
    sourceLooped: false,
    sourceTempoChanged: false,
    sourcePitchChanged: false,
    fadeInSeconds: FADE_IN_SECONDS,
    fadeOutSeconds: FADE_OUT_SECONDS,
    ducking: {
      reductionDb: DUCK_REDUCTION_DB,
      targetGain: round(duck.duckGain, 8),
      measuredMinimumGain: round(duck.minimumGain, 8),
      attackSeconds: DUCK_ATTACK_SECONDS,
      releaseSeconds: DUCK_RELEASE_SECONDS,
      intervalCount: intervals.length,
    },
    equalization: {
      highpassHz: 70,
      presenceCut: {
        frequencyHz: 2800,
        gainDb: -2,
        q: 0.8,
      },
    },
    targetNarratedMusicRmsDbfs: TARGET_NARRATED_MUSIC_RMS_DBFS,
    preGainNarratedMusicRmsDbfs: round(dbfs(preGainNarratedRms), 4),
    targetGain: round(targetGain, 10),
    safetyGain: round(safetyGain, 10),
    finalMusicGain: round(finalMusicGain, 10),
    processedPeakBeforeGainDbfs: round(dbfs(processedPeak), 4),
    finalMusicPeakDbfs: round(dbfs(finalMusicPeak), 4),
    finalMixPeakBeforeQuantizationDbfs: round(dbfs(finalMixPeak), 4),
    finalPeakLimitDbfs: FINAL_PEAK_LIMIT_DBFS,
  };
};

const loadAndValidateSources = async () => {
  for (const requiredPath of [
    remotionCliPath,
    manifestPath,
    narrationAuditPath,
    pictureMasterPath,
    voiceMasterPath,
    musicSourcePath,
  ]) {
    assert(
      fs.existsSync(requiredPath),
      `Required file is missing: ${requiredPath}`,
    );
  }
  const manifestSha256 = await sha256File(manifestPath);
  const pictureMasterSha256 = await sha256File(pictureMasterPath);
  const voiceMasterSha256 = await sha256File(voiceMasterPath);
  const musicSourceSha256 = await sha256File(musicSourcePath);
  assert(
    manifestSha256 === EXPECTED_NARRATION_MANIFEST_SHA256,
    "The reviewed narration manifest changed.",
  );
  assert(
    pictureMasterSha256 === EXPECTED_PICTURE_MASTER_SHA256,
    "The locked picture master changed.",
  );
  assert(
    voiceMasterSha256 === EXPECTED_VOICE_MASTER_SHA256,
    "The locked narration-only PCM master changed.",
  );
  assert(
    musicSourceSha256 === EXPECTED_MUSIC_SOURCE_SHA256,
    "The downloaded Scott Buckley source MP3 changed.",
  );

  const manifest = readJson(manifestPath);
  const narrationAudit = readJson(narrationAuditPath);
  assert(
    manifest?.status === "complete" &&
      Array.isArray(manifest.segments) &&
      manifest.segments.length === EXPECTED_SEGMENTS &&
      narrationAudit?.status === "complete" &&
      Array.isArray(narrationAudit.segments) &&
      narrationAudit.segments.length === EXPECTED_SEGMENTS,
    "The reviewed narration bundle is incomplete.",
  );
  for (const [index, segment] of narrationAudit.segments.entries()) {
    const manifestSegment = manifest.segments[index];
    const segmentPath = path.join(narrationSourceDir, segment.file);
    assert(
      segment.index === index &&
        manifestSegment?.index === index &&
        segment.file === manifestSegment.file &&
        segment.sha256 === manifestSegment.sha256 &&
        fs.existsSync(segmentPath) &&
        (await sha256File(segmentPath)) === segment.sha256,
      `Narration PCM changed at segment ${index + 1}.`,
    );
  }
  assert(
    narrationAudit.segments[4].text === EXPECTED_TARGET_TEXT &&
      narrationAudit.segments[4].sha256 === EXPECTED_SEGMENT_05_SHA256,
    "The approved target sentence changed.",
  );
  return {
    narrationAudit,
    manifestSha256,
    narrationAuditSha256: await sha256File(narrationAuditPath),
    pictureMasterSha256,
    voiceMasterSha256,
    musicSourceSha256,
  };
};

const decodeMusic = async () => {
  await runRemotion(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-i",
      musicSourcePath,
      "-map",
      "0:a:0",
      "-af",
      `aresample=${SAMPLE_RATE},` +
        `aformat=sample_fmts=s16:sample_rates=${SAMPLE_RATE}:channel_layouts=stereo,` +
        `atrim=end_sample=${OUTPUT_SAMPLES},apad=whole_len=${OUTPUT_SAMPLES},` +
        `atrim=end_sample=${OUTPUT_SAMPLES},asetpts=N/SR/TB`,
      "-c:a",
      "pcm_s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      String(CHANNELS),
      decodedMusicPath,
    ],
    "source music decode",
  );
  locateWaveData(fs.readFileSync(decodedMusicPath));
};

const muxVideo = async ({ audioPath, outputPath, label }) => {
  await runRemotion(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-i",
      pictureMasterPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "libfdk_aac",
      "-b:a",
      "320k",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      String(CHANNELS),
      "-movflags",
      "+faststart",
      "-shortest",
      outputPath,
    ],
    `${label} stream-copy video mux`,
  );
  const probe = await runFfprobe(outputPath);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  assert(
    video?.codec_name === "h264" &&
      video?.width === 2560 &&
      video?.height === 1440 &&
      video?.pix_fmt === "yuv420p" &&
      video?.color_space === "bt709" &&
      video?.color_transfer === "bt709" &&
      video?.color_primaries === "bt709" &&
      video?.color_range === "tv" &&
      video?.avg_frame_rate === "30/1" &&
      Number(video?.nb_frames) === OUTPUT_FRAMES &&
      audio?.codec_name === "aac" &&
      Number(audio?.sample_rate) === SAMPLE_RATE &&
      Number(audio?.channels) === CHANNELS,
    `${label} mux failed H.264/BT.709/30 fps/AAC validation.`,
  );
  return {
    sourceFile: formatPath(pictureMasterPath),
    sourceSha256: EXPECTED_PICTURE_MASTER_SHA256,
    method:
      "copy the locked H.264 picture master and encode the supplied PCM once",
    videoCodec: "H.264 stream copy",
    audioCodec: "AAC 320k",
    audioSource: formatPath(audioPath),
    outputFile: formatPath(outputPath),
    outputSha256: await sha256File(outputPath),
    probe,
  };
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const source = await loadAndValidateSources();
  const musicProbe = await runFfprobe(musicSourcePath);
  const sourceAudio = musicProbe.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  assert(
    sourceAudio?.codec_name === "mp3" &&
      Number(sourceAudio?.channels) === CHANNELS &&
      Number(musicProbe.format?.duration) > OUTPUT_FRAMES / FPS,
    "The existing music source is not the expected full-length stereo MP3.",
  );

  await decodeMusic();
  const narratedIntervals = mergeFrameIntervals(
    source.narrationAudit.segments,
  );
  const processing = await processMusicAndMix(narratedIntervals);
  const voiceStats = await inspectWave(voiceMasterPath);
  const musicStats = await inspectWave(musicOnlyPath);
  const mixStats = await inspectWave(finalMixPath);
  const narratedVoice = measureWaveIntervals(
    voiceMasterPath,
    narratedIntervals,
  );
  const narratedMusic = measureWaveIntervals(musicOnlyPath, narratedIntervals);
  const narratedMix = measureWaveIntervals(finalMixPath, narratedIntervals);
  const voiceToMusicRmsDb = narratedVoice.rmsDbfs - narratedMusic.rmsDbfs;
  assert(
    mixStats.clippedSamples === 0 &&
      mixStats.peakDbfs <= FINAL_PEAK_LIMIT_DBFS + 0.01,
    `Final PCM is not peak-safe: ${mixStats.peakDbfs} dBFS.`,
  );
  assert(
    musicStats.clippedSamples === 0 &&
      narratedMusic.rmsDbfs >= -35 &&
      narratedMusic.rmsDbfs <= -31.5,
    `Narrated music is outside target: ${narratedMusic.rmsDbfs} dBFS.`,
  );
  assert(
    voiceToMusicRmsDb >= 7 && voiceToMusicRmsDb <= 11,
    `Voice/music balance is outside target: ${voiceToMusicRmsDb} dB.`,
  );

  const license = {
    title: MUSIC_TITLE,
    artist: MUSIC_ARTIST,
    officialPage: MUSIC_PAGE,
    license: MUSIC_LICENSE,
    licenseUrl: MUSIC_LICENSE_URL,
    attribution: MUSIC_ATTRIBUTION,
    sourceFile: formatPath(musicSourcePath),
    sourceSha256: source.musicSourceSha256,
    downloadedAt: new Date().toISOString(),
    usage:
      "Background music in the non-commercial Paper Tracker innovation explainer; attribution retained with the deliverable.",
  };
  writeJsonAtomic(licensePath, license);
  fs.writeFileSync(
    creditPath,
    `${MUSIC_ATTRIBUTION}\n${MUSIC_PAGE}\n${MUSIC_LICENSE_URL}\n`,
  );
  const withBgmVideo = await muxVideo({
    audioPath: finalMixPath,
    outputPath: finalBgmVideoPath,
    label: "with-BGM final",
  });
  const noBgmVideo = await muxVideo({
    audioPath: voiceMasterPath,
    outputPath: finalNoBgmVideoPath,
    label: "no-BGM final",
  });
  const audit = {
    version: 1,
    status: "complete",
    createdAt: new Date().toISOString(),
    revision: {
      version: "final",
      reason:
        "User requested quieter background music and an otherwise identical narration-only export.",
      scope:
        "reduce the existing licensed music by 5 dB and export both with-BGM and no-BGM deliverables; narration, timing, captions, and picture are unchanged",
    },
    source: {
      narrationVersion: "locked-current",
      renderSource: {
        renderProps: formatPath(masterConfig.renderPropsPath),
        renderPropsSha256: masterConfig.renderPropsSha256,
        timeline: formatPath(masterConfig.sourceTimelinePath),
        timelineDurationInFrames:
          masterConfig.sourceTimelineDurationInFrames,
        timelineSha256: masterConfig.sourceTimelineSha256,
        fingerprintVersion: 1,
        fingerprintSha256: masterConfig.sourceFingerprintSha256,
        fingerprintFileCount: masterConfig.sourceFileCount,
      },
      pictureMaster: {
        file: formatPath(pictureMasterPath),
        sha256: source.pictureMasterSha256,
      },
      manifest: formatPath(manifestPath),
      manifestSha256: source.manifestSha256,
      synchronizedAudit: formatPath(narrationAuditPath),
      synchronizedAuditSha256: source.narrationAuditSha256,
      narrationSegmentCount: EXPECTED_SEGMENTS,
      segment05Text: EXPECTED_TARGET_TEXT,
      segment05Sha256: EXPECTED_SEGMENT_05_SHA256,
      lockedVoiceMaster: {
        file: formatPath(voiceMasterPath),
        sha256: source.voiceMasterSha256,
      },
    },
    timeline: {
      fps: FPS,
      durationFrames: OUTPUT_FRAMES,
      durationSeconds: round(OUTPUT_FRAMES / FPS, 9),
      sampleRate: SAMPLE_RATE,
      samplesPerFrame: SAMPLES_PER_FRAME,
      samplesPerChannel: OUTPUT_SAMPLES,
    },
    audio: {
      finalMix: mixStats,
      voiceReference: voiceStats,
      backgroundMusic: {
        kind: "existing licensed recording",
        generatedProcedurally: false,
        title: MUSIC_TITLE,
        artist: MUSIC_ARTIST,
        officialPage: MUSIC_PAGE,
        license: MUSIC_LICENSE,
        licenseUrl: MUSIC_LICENSE_URL,
        attribution: MUSIC_ATTRIBUTION,
        sourceFile: formatPath(musicSourcePath),
        sourceSha256: source.musicSourceSha256,
        sourceProbe: musicProbe,
        decodedSourceFile: formatPath(decodedMusicPath),
        decodedSourceSha256: await sha256File(decodedMusicPath),
        processedReference: musicStats,
        processing,
      },
      narratedIntervals: {
        count: narratedIntervals.length,
        voice: narratedVoice,
        music: narratedMusic,
        mix: narratedMix,
        voiceToMusicRmsDb: round(voiceToMusicRmsDb, 4),
        targetVoiceToMusicRmsDb: [7, 11],
        targetMusicRmsDbfs: [-35, -31.5],
      },
    },
    licensing: {
      metadataFile: formatPath(licensePath),
      metadataSha256: await sha256File(licensePath),
      creditFile: formatPath(creditPath),
      creditSha256: await sha256File(creditPath),
    },
    videos: {
      withBackgroundMusic: withBgmVideo,
      withoutBackgroundMusic: noBgmVideo,
      pictureAndNarrationAreIdentical: true,
    },
  };
  writeJsonAtomic(auditPath, audit);
  console.log(
    JSON.stringify(
      {
        withBgmVideo: finalBgmVideoPath,
        withBgmVideoSha256: withBgmVideo.outputSha256,
        noBgmVideo: finalNoBgmVideoPath,
        noBgmVideoSha256: noBgmVideo.outputSha256,
        backgroundMusic: `${MUSIC_ARTIST} — ${MUSIC_TITLE}`,
        musicSourceSha256: source.musicSourceSha256,
        finalMixPeakDbfs: mixStats.peakDbfs,
        finalMixRmsDbfs: mixStats.rmsDbfs,
        narratedVoiceRmsDbfs: narratedVoice.rmsDbfs,
        narratedMusicRmsDbfs: narratedMusic.rmsDbfs,
        voiceToMusicRmsDb: round(voiceToMusicRmsDb, 4),
        lockedVoiceMasterSha256: source.voiceMasterSha256,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(`Innovation finalization failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
