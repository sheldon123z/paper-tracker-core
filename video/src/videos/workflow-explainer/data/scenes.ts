import { SYSTEM_NAME } from "../../../shared/brand";
import timeline from "./timeline.json";

type TimelineScene = {
  id: string;
  startFrame: number;
  durationInFrames: number;
};

const typedTimeline = timeline as {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  scenes: TimelineScene[];
};

export const FPS = typedTimeline.fps;
export const WIDTH = typedTimeline.width;
export const HEIGHT = typedTimeline.height;
export const DURATION_IN_FRAMES = typedTimeline.durationInFrames;

export type SceneDefinition = {
  id: string;
  startFrame: number;
  durationInFrames: number;
  eyebrow: string;
  title: string;
};

const sceneCopyById: Record<
  string,
  Pick<SceneDefinition, "eyebrow" | "title">
> = {
  "scene-00": {
    eyebrow: "LOCAL · OFFLINE · KNOWLEDGE WORKSPACE",
    title: SYSTEM_NAME,
  },
  "scene-01": {
    eyebrow: "01 · SYSTEM OVERVIEW",
    title: "统一工作台，贯通论文全流程",
  },
  "scene-02": {
    eyebrow: "02 · LOCAL PDF IMPORT",
    title: "批量导入与智能解析",
  },
  "scene-03": {
    eyebrow: "03 · RESEARCH LIBRARY",
    title: "公共库与部门私有库",
  },
  "scene-04": {
    eyebrow: "04 · LOCAL INTELLIGENCE",
    title: "从阅读到本地智能分析",
  },
  "scene-05": {
    eyebrow: "05 · RESEARCH WORKFLOW",
    title: "研究过程可见，成果可用",
  },
  "scene-06": {
    eyebrow: "06 · GOVERNANCE",
    title: "组织化管理与全程追溯",
  },
  "scene-07": {
    eyebrow: SYSTEM_NAME,
    title: "让科研知识持续积累与复用",
  },
};

let expectedStartFrame = 0;

export const SCENES: SceneDefinition[] = typedTimeline.scenes.map((scene) => {
  const copy = sceneCopyById[scene.id];
  if (!copy) {
    throw new Error(`Missing workflow scene copy for ${scene.id}.`);
  }
  if (scene.startFrame !== expectedStartFrame) {
    throw new Error(
      `${scene.id} must start at frame ${expectedStartFrame}, received ${scene.startFrame}.`,
    );
  }
  if (!Number.isInteger(scene.durationInFrames) || scene.durationInFrames < 1) {
    throw new Error(`${scene.id} must last at least one frame.`);
  }

  expectedStartFrame += scene.durationInFrames;
  return { ...scene, ...copy };
});

if (expectedStartFrame !== DURATION_IN_FRAMES) {
  throw new Error(
    `Workflow timeline duration is ${DURATION_IN_FRAMES}, but its scenes cover ${expectedStartFrame} frames.`,
  );
}
