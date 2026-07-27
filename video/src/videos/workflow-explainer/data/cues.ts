import cuesJson from "./cues.json";

type RawSceneCues = {
  id: string;
  captionStartFrames: number[];
  captionEndFrames: number[];
  sceneDurationInFrames: number;
};

type CueManifest = {
  fps: number;
  scenes: RawSceneCues[];
};

export type SceneCues = {
  captionStartFrames: number[];
  captionEndFrames: number[];
};

export type FrameSegment = {
  from: number;
  durationInFrames: number;
};

const manifest = cuesJson as CueManifest;
const rawCuesById = new Map(manifest.scenes.map((scene) => [scene.id, scene]));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const scaleCueFrame = (
  frame: number,
  rawDurationInFrames: number,
  sceneDurationInFrames: number,
  allowSceneEnd: boolean,
) => {
  const upperBound = allowSceneEnd
    ? sceneDurationInFrames
    : sceneDurationInFrames - 1;

  return clamp(
    Math.round((frame / rawDurationInFrames) * sceneDurationInFrames),
    0,
    upperBound,
  );
};

export const getSceneCues = (
  id: string,
  sceneDurationInFrames: number,
): SceneCues => {
  const raw = rawCuesById.get(id);
  if (!raw) {
    throw new Error(`Missing caption cues for ${id}.`);
  }
  if (sceneDurationInFrames < 1 || raw.sceneDurationInFrames < 1) {
    throw new Error(`${id} must have a positive scene duration.`);
  }
  if (raw.sceneDurationInFrames !== sceneDurationInFrames) {
    throw new Error(
      `${id} cue duration ${raw.sceneDurationInFrames} does not match scene duration ${sceneDurationInFrames}.`,
    );
  }
  if (raw.captionStartFrames.length !== raw.captionEndFrames.length) {
    throw new Error(`${id} has mismatched caption cue arrays.`);
  }

  return {
    captionStartFrames: raw.captionStartFrames.map((frame) =>
      scaleCueFrame(
        frame,
        raw.sceneDurationInFrames,
        sceneDurationInFrames,
        false,
      ),
    ),
    captionEndFrames: raw.captionEndFrames.map((frame) =>
      scaleCueFrame(
        frame,
        raw.sceneDurationInFrames,
        sceneDurationInFrames,
        true,
      ),
    ),
  };
};

export const captionStart = (cues: SceneCues, index: number) => {
  const frame = cues.captionStartFrames[index];
  if (frame === undefined) {
    throw new Error(`Missing caption start cue ${index}.`);
  }
  return frame;
};

export const makeContinuousSegments = (
  sceneDurationInFrames: number,
  proposedBoundaries: number[],
): FrameSegment[] => {
  const segmentCount = proposedBoundaries.length + 1;
  if (sceneDurationInFrames < segmentCount) {
    throw new Error(
      `${sceneDurationInFrames} frames cannot hold ${segmentCount} non-empty segments.`,
    );
  }

  const boundaries = [0];
  proposedBoundaries.forEach((boundary, index) => {
    const previous = boundaries[index];
    const remainingSegments = proposedBoundaries.length - index;
    boundaries.push(
      clamp(
        Math.round(boundary),
        previous + 1,
        sceneDurationInFrames - remainingSegments,
      ),
    );
  });
  boundaries.push(sceneDurationInFrames);

  return boundaries.slice(0, -1).map((from, index) => ({
    from,
    durationInFrames: boundaries[index + 1] - from,
  }));
};

export const segmentIndexAtFrame = (
  frame: number,
  segments: FrameSegment[],
) => {
  const index = segments.findIndex(
    (segment) => frame < segment.from + segment.durationInFrames,
  );
  return index === -1 ? segments.length - 1 : index;
};

export const makeEntranceRange = (
  startFrame: number,
  sceneDurationInFrames: number,
  animationDurationInFrames: number,
): [number, number] => {
  if (sceneDurationInFrames < 2) {
    throw new Error(
      "An entrance animation requires at least two scene frames.",
    );
  }

  const start = clamp(Math.round(startFrame), 0, sceneDurationInFrames - 2);
  const end = clamp(
    start + Math.max(1, Math.round(animationDurationInFrames)),
    start + 1,
    sceneDurationInFrames - 1,
  );
  return [start, end];
};
