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

const EXPECTED_NARRATION_MANIFEST_SHA256 =
  "85CAC4F92D7B9DFCA7EC71EECAEA908EE8A6C032242CD7B114644B0F72AD40F8";
const EXPECTED_PICTURE_MASTER_SHA256 = masterConfig.pictureMasterSha256;
const EXPECTED_VIDEO_STREAM_SHA256 = masterConfig.videoStreamSha256;
const EXPECTED_SEGMENT_05_SHA256 =
  "568CC5CC37B6395641163572717A2D11C705C0B48EA9C96831FACB11DD684AA8";
const EXPECTED_TARGET_TEXT = "可信可控的智能化科研支撑。";
const EXPECTED_VOICE_MASTER_SHA256 =
  "8E7B6BFD1BB38F3795F3EC9D4D9444F5D69462BE10B091EF58DB29B8BA9E8F9C";
const EXPECTED_MUSIC_SOURCE_SHA256 =
  "3632834CCE1D31EF41EBD5D8B1DCFF5508187AA797917BEE524BD77BF8DA1F48";
const EXPECTED_SEGMENTS = 49;
const EXPECTED_FPS = masterConfig.fps;
const EXPECTED_FRAMES = masterConfig.outputDurationInFrames;
const EXPECTED_SAMPLE_RATE = 48_000;
const EXPECTED_CHANNELS = 2;
const EXPECTED_SAMPLES_PER_FRAME = EXPECTED_SAMPLE_RATE / EXPECTED_FPS;
if (!Number.isInteger(EXPECTED_SAMPLES_PER_FRAME)) {
  throw new Error(
    `The ${EXPECTED_SAMPLE_RATE} Hz master sample rate is not divisible by ${EXPECTED_FPS} fps.`,
  );
}
const EXPECTED_SAMPLES = EXPECTED_FRAMES * EXPECTED_SAMPLES_PER_FRAME;
const EXPECTED_TITLE = "Machinery of the Stars";
const EXPECTED_ARTIST = "Scott Buckley";
const EXPECTED_LICENSE = "CC BY 4.0";

const outputDir = path.join(projectRoot, "output", "innovation-final");
const narrationSourceDir = path.join(outputDir, "narration-source");
const manifestPath = path.join(narrationSourceDir, "manifest.json");
const sourceAuditPath = path.join(narrationSourceDir, "timing-audit.json");
const pictureMasterPath = path.join(outputDir, "picture-master.mp4");
const voiceMasterPath = path.join(outputDir, "voice-only-reference.wav");
const musicSourcePath = path.join(
  outputDir,
  "source-machinery-of-the-stars-scott-buckley.mp3",
);
const musicOnlyPath = path.join(
  outputDir,
  "background-music-synced-bgm.wav",
);
const finalMixPath = path.join(
  outputDir,
  "natural-final-mix-synced-bgm.wav",
);
const licensePath = path.join(outputDir, "music-license.json");
const creditPath = path.join(outputDir, "MUSIC-CREDIT.txt");
const auditPath = path.join(
  outputDir,
  "natural-final-audit-synced-bgm.json",
);
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

const nearlyEqual = (left, right, tolerance) =>
  Math.abs(left - right) <= tolerance;

const sha256File = async (filePath) =>
  await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex").toUpperCase()));
  });

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
  { allowAacPadding = false } = {},
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
      format.channels === EXPECTED_CHANNELS &&
      format.sampleRate === EXPECTED_SAMPLE_RATE &&
      format.bitsPerSample === 16 &&
      dataOffset !== null &&
      dataBytes !== null,
    "Unexpected PCM WAVE format.",
  );
  const samplesPerChannel = dataBytes / (EXPECTED_CHANNELS * 2);
  if (allowAacPadding) {
    assert(
      samplesPerChannel >= EXPECTED_SAMPLES &&
        samplesPerChannel <= EXPECTED_SAMPLES + 2048,
      `Decoded AAC has an unexpected sample count: ${samplesPerChannel}.`,
    );
  } else {
    assert(
      samplesPerChannel === EXPECTED_SAMPLES,
      `Unexpected PCM duration: ${samplesPerChannel} samples per channel.`,
    );
  }
  return { ...format, dataOffset, dataBytes, samplesPerChannel };
};

const measureWave = (
  filePath,
  { allowAacPadding = false, limitSamples = null } = {},
) => {
  const buffer = fs.readFileSync(filePath);
  const wave = locateWaveData(buffer, { allowAacPadding });
  const samplesPerChannel =
    limitSamples === null
      ? wave.samplesPerChannel
      : Math.min(limitSamples, wave.samplesPerChannel);
  const interleavedSamples = samplesPerChannel * EXPECTED_CHANNELS;
  let squareSum = 0;
  let peak = 0;
  let clippedSamples = 0;
  for (let index = 0; index < interleavedSamples; index += 1) {
    const value = buffer.readInt16LE(wave.dataOffset + index * 2) / 32768;
    const absolute = Math.abs(value);
    squareSum += value * value;
    peak = Math.max(peak, absolute);
    if (absolute >= 32767 / 32768) {
      clippedSamples += 1;
    }
  }
  const rms = Math.sqrt(squareSum / interleavedSamples);
  return {
    samplesPerChannel: wave.samplesPerChannel,
    measuredSamplesPerChannel: samplesPerChannel,
    peak,
    peakDbfs: 20 * Math.log10(peak),
    rms,
    rmsDbfs: 20 * Math.log10(rms),
    clippedSamples,
  };
};

const validatePcmRelationship = () => {
  const voiceBuffer = fs.readFileSync(voiceMasterPath);
  const musicBuffer = fs.readFileSync(musicOnlyPath);
  const mixBuffer = fs.readFileSync(finalMixPath);
  const voice = locateWaveData(voiceBuffer);
  const music = locateWaveData(musicBuffer);
  const mix = locateWaveData(mixBuffer);
  const interleavedSamples = EXPECTED_SAMPLES * EXPECTED_CHANNELS;
  let maximumErrorLsb = 0;
  for (let index = 0; index < interleavedSamples; index += 1) {
    const voiceValue = voiceBuffer.readInt16LE(voice.dataOffset + index * 2);
    const musicValue = musicBuffer.readInt16LE(music.dataOffset + index * 2);
    const mixValue = mixBuffer.readInt16LE(mix.dataOffset + index * 2);
    maximumErrorLsb = Math.max(
      maximumErrorLsb,
      Math.abs(mixValue - voiceValue - musicValue),
    );
  }
  assert(
    maximumErrorLsb <= 2,
    `The final PCM is not voice plus music: ${maximumErrorLsb} LSB.`,
  );
  return { maximumErrorLsb };
};

const extractVideoStreamHash = async (inputPath, label) => {
  const temporaryPath = path.join(
    outputDir,
    `.stream-check-${process.pid}-${randomUUID()}.h264`,
  );
  try {
    await runRemotion(
      [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-xerror",
        "-err_detect",
        "explode",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-c",
        "copy",
        "-f",
        "h264",
        temporaryPath,
      ],
      `${label} H.264 extraction`,
    );
    return await sha256File(temporaryPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
};

const validateFinalProbe = async (filePath, label) => {
  const probe = await runFfprobe(filePath);
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
      video?.avg_frame_rate === `${EXPECTED_FPS}/1` &&
      Number(video?.nb_frames) === EXPECTED_FRAMES &&
      audio?.codec_name === "aac" &&
      Number(audio?.sample_rate) === EXPECTED_SAMPLE_RATE &&
      Number(audio?.channels) === EXPECTED_CHANNELS,
    `${label} failed H.264/BT.709/30 fps/AAC validation.`,
  );
  return probe;
};

const decodeAndMeasureAudio = async (filePath, label, reference) => {
  const temporaryPath = path.join(
    outputDir,
    `.decoded-${label}-${process.pid}-${randomUUID()}.wav`,
  );
  try {
    await runRemotion(
      [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-xerror",
        "-err_detect",
        "explode",
        "-y",
        "-i",
        filePath,
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s16le",
        "-ar",
        String(EXPECTED_SAMPLE_RATE),
        "-ac",
        String(EXPECTED_CHANNELS),
        temporaryPath,
      ],
      `${label} AAC decode`,
    );
    const decoded = measureWave(temporaryPath, {
      allowAacPadding: true,
      limitSamples: EXPECTED_SAMPLES,
    });
    assert(
      decoded.clippedSamples === 0 &&
        Math.abs(decoded.rmsDbfs - reference.rmsDbfs) <= 0.2 &&
        decoded.peakDbfs <= -1,
      `${label} AAC does not preserve its peak-safe PCM source.`,
    );
    return decoded;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
};

const strictDecodeVideo = async (filePath, label) => {
  const { stdout } = await runRemotion(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-xerror",
      "-err_detect",
      "explode",
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "rawvideo",
      "-fps_mode",
      "passthrough",
      "-progress",
      "pipe:1",
      "-nostats",
      "-f",
      "null",
      "-",
    ],
    `${label} strict full video decode`,
    { capture: true },
  );
  const decodedFrames = [...stdout.matchAll(/^frame=(\d+)$/gm)]
    .map((match) => Number(match[1]))
    .at(-1);
  assert(
    decodedFrames === EXPECTED_FRAMES,
    `${label} strict decode reported ${decodedFrames ?? "no"} frames.`,
  );
  return decodedFrames;
};

const main = async () => {
  for (const requiredPath of [
    remotionCliPath,
    manifestPath,
    sourceAuditPath,
    pictureMasterPath,
    voiceMasterPath,
    musicSourcePath,
    musicOnlyPath,
    finalMixPath,
    licensePath,
    creditPath,
    auditPath,
    finalBgmVideoPath,
    finalNoBgmVideoPath,
  ]) {
    assert(
      fs.existsSync(requiredPath),
      `Required file is missing: ${requiredPath}`,
    );
  }
  assert(
    (await sha256File(manifestPath)) ===
      EXPECTED_NARRATION_MANIFEST_SHA256,
    "The reviewed narration manifest changed.",
  );
  assert(
    (await sha256File(pictureMasterPath)) ===
      EXPECTED_PICTURE_MASTER_SHA256,
    "The locked picture master changed.",
  );
  assert(
    (await sha256File(voiceMasterPath)) === EXPECTED_VOICE_MASTER_SHA256,
    "The locked narration-only PCM master changed.",
  );
  assert(
    (await sha256File(musicSourcePath)) === EXPECTED_MUSIC_SOURCE_SHA256,
    "The downloaded source music changed.",
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, "utf8"));
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const license = JSON.parse(fs.readFileSync(licensePath, "utf8"));
  assert(
    manifest?.status === "complete" &&
      manifest.segments?.length === EXPECTED_SEGMENTS &&
      sourceAudit?.status === "complete" &&
      sourceAudit.segments?.length === EXPECTED_SEGMENTS,
    "The reviewed narration bundle is incomplete.",
  );
  for (const [index, segment] of sourceAudit.segments.entries()) {
    const manifestSegment = manifest.segments[index];
    const segmentPath = path.join(narrationSourceDir, segment.file);
    assert(
      segment.index === index &&
        manifestSegment?.index === index &&
        segment.file === manifestSegment.file &&
        segment.sha256 === manifestSegment.sha256 &&
        (await sha256File(segmentPath)) === segment.sha256,
      `Narration PCM changed at segment ${index + 1}.`,
    );
  }
  assert(
    sourceAudit.segments[4].text === EXPECTED_TARGET_TEXT &&
      sourceAudit.segments[4].sha256 === EXPECTED_SEGMENT_05_SHA256,
    "The approved target sentence changed.",
  );
  assert(
    audit?.status === "complete" &&
      audit.revision?.version === "final" &&
      audit.source?.manifestSha256 ===
        EXPECTED_NARRATION_MANIFEST_SHA256 &&
      audit.source?.renderSource?.timelineSha256 ===
        masterConfig.sourceTimelineSha256 &&
      audit.source?.renderSource?.renderPropsSha256 ===
        masterConfig.renderPropsSha256 &&
      audit.source?.renderSource?.fingerprintSha256 ===
        masterConfig.sourceFingerprintSha256 &&
      audit.source?.renderSource?.fingerprintFileCount ===
        masterConfig.sourceFileCount &&
      audit.source?.pictureMaster?.sha256 ===
        EXPECTED_PICTURE_MASTER_SHA256 &&
      audit.source?.segment05Sha256 === EXPECTED_SEGMENT_05_SHA256 &&
      audit.source?.lockedVoiceMaster?.sha256 ===
        EXPECTED_VOICE_MASTER_SHA256 &&
      audit.timeline?.durationFrames === EXPECTED_FRAMES &&
      audit.timeline?.samplesPerChannel === EXPECTED_SAMPLES &&
      audit.videos?.pictureAndNarrationAreIdentical === true,
    "The final audit is not bound to the reviewed narration and timeline.",
  );
  assert(
    audit.audio?.backgroundMusic?.kind === "existing licensed recording" &&
      audit.audio.backgroundMusic.generatedProcedurally === false &&
      audit.audio.backgroundMusic.title === EXPECTED_TITLE &&
      audit.audio.backgroundMusic.artist === EXPECTED_ARTIST &&
      audit.audio.backgroundMusic.license === EXPECTED_LICENSE &&
      audit.audio.backgroundMusic.sourceSha256 ===
        EXPECTED_MUSIC_SOURCE_SHA256 &&
      audit.audio.backgroundMusic.processing?.sourceLooped === false &&
      audit.audio.backgroundMusic.processing?.sourceTempoChanged === false &&
      audit.audio.backgroundMusic.processing?.sourcePitchChanged === false &&
      audit.audio.backgroundMusic.processing?.ducking?.reductionDb === 5 &&
      audit.audio.backgroundMusic.processing?.fadeOutSeconds === 4 &&
      audit.audio.backgroundMusic.processing
        ?.targetNarratedMusicRmsDbfs === -33.1,
    "The final audit does not describe the selected quieter licensed track.",
  );
  assert(
    license.title === EXPECTED_TITLE &&
      license.artist === EXPECTED_ARTIST &&
      license.license === EXPECTED_LICENSE &&
      license.sourceSha256 === EXPECTED_MUSIC_SOURCE_SHA256 &&
      license.attribution?.includes("Scott Buckley") &&
      license.attribution?.includes("CC-BY 4.0"),
    "The music attribution metadata is incomplete.",
  );
  assert(
    audit.licensing?.metadataSha256 === (await sha256File(licensePath)) &&
      audit.licensing?.creditSha256 === (await sha256File(creditPath)),
    "The audited attribution files changed.",
  );

  const musicProbe = await runFfprobe(musicSourcePath);
  const sourceMusicStream = musicProbe.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  assert(
    sourceMusicStream?.codec_name === "mp3" &&
      Number(sourceMusicStream.channels) === EXPECTED_CHANNELS &&
      Number(musicProbe.format?.duration) > EXPECTED_FRAMES / EXPECTED_FPS,
    "The source is not the expected full-length stereo MP3.",
  );
  for (const section of [
    audit.audio.finalMix,
    audit.audio.voiceReference,
    audit.audio.backgroundMusic.processedReference,
  ]) {
    const filePath = path.resolve(projectRoot, section.file);
    assert(
      fs.existsSync(filePath) &&
        (await sha256File(filePath)) === section.sha256,
      `Audited PCM changed: ${section.file}`,
    );
    const measured = measureWave(filePath);
    assert(
      nearlyEqual(measured.peakDbfs, section.peakDbfs, 0.001) &&
        nearlyEqual(measured.rmsDbfs, section.rmsDbfs, 0.001) &&
        measured.clippedSamples === section.clippedSamples,
      `Audited PCM measurements changed: ${section.file}`,
    );
  }

  const finalMix = measureWave(finalMixPath);
  const voiceOnly = measureWave(voiceMasterPath);
  const musicOnly = measureWave(musicOnlyPath);
  assert(
    finalMix.peakDbfs <= -1.49 &&
      finalMix.clippedSamples === 0 &&
      voiceOnly.clippedSamples === 0 &&
      musicOnly.clippedSamples === 0,
    "A final PCM source is not peak-safe.",
  );
  assert(
    audit.audio.narratedIntervals?.music?.rmsDbfs >= -34 &&
      audit.audio.narratedIntervals.music.rmsDbfs <= -32 &&
      audit.audio.narratedIntervals.voiceToMusicRmsDb >= 8 &&
      audit.audio.narratedIntervals.voiceToMusicRmsDb <= 10,
    "The quieter music is outside the reviewed narration balance.",
  );
  const pcmRelationship = validatePcmRelationship();

  await validateFinalProbe(finalBgmVideoPath, "with-BGM final");
  await validateFinalProbe(finalNoBgmVideoPath, "no-BGM final");
  const pictureStreamSha256 = await extractVideoStreamHash(
    pictureMasterPath,
    "picture master",
  );
  const withBgmStreamSha256 = await extractVideoStreamHash(
    finalBgmVideoPath,
    "with-BGM final",
  );
  const noBgmStreamSha256 = await extractVideoStreamHash(
    finalNoBgmVideoPath,
    "no-BGM final",
  );
  assert(
    pictureStreamSha256 === EXPECTED_VIDEO_STREAM_SHA256 &&
      withBgmStreamSha256 === pictureStreamSha256 &&
      noBgmStreamSha256 === pictureStreamSha256,
    "The final exports did not preserve the exact locked H.264 stream.",
  );

  const decodedWithBgm = await decodeAndMeasureAudio(
    finalBgmVideoPath,
    "with-bgm",
    finalMix,
  );
  const decodedNoBgm = await decodeAndMeasureAudio(
    finalNoBgmVideoPath,
    "no-bgm",
    voiceOnly,
  );
  const withBgmFrames = await strictDecodeVideo(
    finalBgmVideoPath,
    "with-BGM final",
  );
  const noBgmFrames = await strictDecodeVideo(
    finalNoBgmVideoPath,
    "no-BGM final",
  );
  const withBgmSha256 = await sha256File(finalBgmVideoPath);
  const noBgmSha256 = await sha256File(finalNoBgmVideoPath);
  assert(
    audit.videos?.withBackgroundMusic?.outputSha256 === withBgmSha256 &&
      audit.videos?.withoutBackgroundMusic?.outputSha256 === noBgmSha256 &&
      audit.videos.withBackgroundMusic.sourceSha256 ===
        EXPECTED_PICTURE_MASTER_SHA256 &&
      audit.videos.withoutBackgroundMusic.sourceSha256 ===
        EXPECTED_PICTURE_MASTER_SHA256 &&
      audit.videos.withoutBackgroundMusic.audioSource.endsWith(
        "innovation-final/voice-only-reference.wav",
      ),
    "The audited final hashes or no-BGM PCM source changed.",
  );

  console.log(
    JSON.stringify(
      {
        status: "verified",
        withBgmVideo: finalBgmVideoPath,
        withBgmSha256,
        noBgmVideo: finalNoBgmVideoPath,
        noBgmSha256,
        frames: {
          withBgm: withBgmFrames,
          noBgm: noBgmFrames,
        },
        strictFullDecode: "passed for both exports",
        exactPictureStreamPreserved: true,
        videoStreamSha256: pictureStreamSha256,
        narrationSegmentsVerified: EXPECTED_SEGMENTS,
        targetSentenceSha256: EXPECTED_SEGMENT_05_SHA256,
        lockedVoiceMasterSha256: EXPECTED_VOICE_MASTER_SHA256,
        backgroundMusic: `${EXPECTED_ARTIST} — ${EXPECTED_TITLE}`,
        musicSourceSha256: EXPECTED_MUSIC_SOURCE_SHA256,
        musicLicense: EXPECTED_LICENSE,
        narratedMusicRmsDbfs:
          audit.audio.narratedIntervals.music.rmsDbfs,
        voiceToMusicRmsDb:
          audit.audio.narratedIntervals.voiceToMusicRmsDb,
        finalMixPeakDbfs: finalMix.peakDbfs,
        finalMixRmsDbfs: finalMix.rmsDbfs,
        decodedWithBgmRmsDbfs: decodedWithBgm.rmsDbfs,
        voiceOnlyRmsDbfs: voiceOnly.rmsDbfs,
        decodedNoBgmRmsDbfs: decodedNoBgm.rmsDbfs,
        pcmRelationship,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(`Innovation verification failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
