import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const relativePath = (projectRoot, filePath) =>
  path.relative(projectRoot, filePath).replaceAll("\\", "/");

const resolveInsideProject = (projectRoot, configuredPath) => {
  assert(
    typeof configuredPath === "string" && configuredPath.length > 0,
    "Innovation master metadata contains an invalid source path.",
  );
  const resolved = path.resolve(projectRoot, configuredPath);
  const relative = path.relative(projectRoot, resolved);
  assert(
    relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
    `Innovation master source path escapes the video project: ${configuredPath}`,
  );
  return resolved;
};

const collectFiles = (entryPath) => {
  const stats = fs.statSync(entryPath);
  if (stats.isFile()) {
    return [entryPath];
  }
  assert(stats.isDirectory(), `Unsupported source entry: ${entryPath}`);
  return fs
    .readdirSync(entryPath, { withFileTypes: true })
    .flatMap((entry) =>
      collectFiles(path.join(entryPath, entry.name)),
    );
};

const normalizedText = (filePath) =>
  fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");

export const sha256NormalizedText = (filePath) =>
  createHash("sha256")
    .update(normalizedText(filePath), "utf8")
    .digest("hex")
    .toUpperCase();

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

export const sha256CanonicalJson = (value) =>
  createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex")
    .toUpperCase();

export const computeInnovationSourceFingerprint = (
  projectRoot,
  configuredRoots,
) => {
  assert(
    Array.isArray(configuredRoots) && configuredRoots.length > 0,
    "Innovation master metadata has no source fingerprint roots.",
  );
  const files = [
    ...new Set(
      configuredRoots.flatMap((root) =>
        collectFiles(resolveInsideProject(projectRoot, root)),
      ),
    ),
  ].sort((left, right) =>
    relativePath(projectRoot, left).localeCompare(
      relativePath(projectRoot, right),
      "en",
    ),
  );
  const hash = createHash("sha256");
  hash.update("paper-tracker-innovation-source-v1\0");
  for (const filePath of files) {
    hash.update(relativePath(projectRoot, filePath), "utf8");
    hash.update("\0");
    hash.update(normalizedText(filePath), "utf8");
    hash.update("\0");
  }
  return {
    files: files.map((filePath) => relativePath(projectRoot, filePath)),
    sha256: hash.digest("hex").toUpperCase(),
  };
};

export const loadInnovationMasterConfig = (projectRoot) => {
  const renderPropsPath = path.join(
    projectRoot,
    "render-props",
    "innovation-final.json",
  );
  const renderProps = JSON.parse(fs.readFileSync(renderPropsPath, "utf8"));
  const mastering = renderProps.mastering;
  assert(
    mastering?.schemaVersion === 1,
    "Innovation final render props have no supported mastering metadata.",
  );
  assert(
    Number.isInteger(mastering.outputDurationInFrames) &&
      mastering.outputDurationInFrames > 0,
    "Innovation mastering outputDurationInFrames must be a positive integer.",
  );

  const timelinePath = resolveInsideProject(
    projectRoot,
    mastering.sourceTimeline,
  );
  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  assert(
    Number.isInteger(timeline.fps) && timeline.fps > 0,
    "Innovation source timeline has an invalid fps.",
  );
  assert(
    Number.isInteger(timeline.durationInFrames) &&
      timeline.durationInFrames > 0,
    "Innovation source timeline has an invalid duration.",
  );

  const timelineSha256 = sha256NormalizedText(timelinePath);
  assert(
    timelineSha256 === mastering.sourceTimelineSha256,
    "Innovation source timeline changed after the locked master was recorded.",
  );
  const fingerprint = computeInnovationSourceFingerprint(
    projectRoot,
    mastering.sourceFingerprintRoots,
  );
  assert(
    fingerprint.sha256 === mastering.sourceFingerprintSha256,
    "Innovation render source changed after the locked master was recorded.",
  );
  const compositionProps = { ...renderProps };
  delete compositionProps.mastering;
  const renderPropsSha256 = sha256CanonicalJson(compositionProps);
  assert(
    renderPropsSha256 === mastering.renderPropsSha256,
    "Innovation composition props changed after the locked master was recorded.",
  );
  for (const [name, value] of [
    ["pictureMasterSha256", mastering.pictureMasterSha256],
    ["videoStreamSha256", mastering.videoStreamSha256],
  ]) {
    assert(
      typeof value === "string" && /^[0-9A-F]{64}$/.test(value),
      `Innovation mastering ${name} must be an uppercase SHA-256 hash.`,
    );
  }

  return {
    fps: timeline.fps,
    outputDurationInFrames: mastering.outputDurationInFrames,
    pictureMasterSha256: mastering.pictureMasterSha256,
    renderPropsSha256,
    renderPropsPath,
    sourceFileCount: fingerprint.files.length,
    sourceFiles: fingerprint.files,
    sourceFingerprintSha256: fingerprint.sha256,
    sourceTimelineDurationInFrames: timeline.durationInFrames,
    sourceTimelinePath: timelinePath,
    sourceTimelineSha256: timelineSha256,
    videoStreamSha256: mastering.videoStreamSha256,
  };
};
