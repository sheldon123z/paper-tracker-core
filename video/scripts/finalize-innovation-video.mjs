import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
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
const narrationPath = path.join(
  projectRoot,
  "output/innovation-opening-restructure/innovation-opening-restructure-final-mix.wav",
);
const renderScript = path.join(projectRoot, "scripts/render-video.ps1");
const recordMasterScript = path.join(
  projectRoot,
  "scripts/record-innovation-master.mjs",
);

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, description) => {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === "VOLCENGINE_TTS_API_KEY") {
      delete environment[key];
    }
  }
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`${description} failed with exit code ${result.status}.`);
  }
};

const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
const authorization = JSON.parse(fs.readFileSync(authorizationPath, "utf8"));
if (
  !Array.isArray(captions) ||
  captions.length === 0 ||
  authorization?.captions?.count !== captions.length ||
  authorization?.retiming?.authorizedDurationInFrames !==
    timeline.durationInFrames ||
  authorization?.generationStatus?.finalMixVerified !== true ||
  !fs.existsSync(narrationPath)
) {
  fail(
    "The current captions, authorization, timeline, and audited hybrid narration are not ready for final rendering.",
  );
}

run(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    renderScript,
    "-Video",
    "innovation",
    "-NarrationPath",
    narrationPath,
  ],
  "Innovation picture render and narration mux",
);

run(
  process.execPath,
  [recordMasterScript],
  "Innovation picture-master metadata recording",
);
