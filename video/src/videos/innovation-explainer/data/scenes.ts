import timeline from "./timeline.json";

type TimelineScene = {
  id: string;
  startSeconds: number;
  durationSeconds: number;
  startFrame?: number;
  durationInFrames?: number;
};

const typedTimeline = timeline as {
  durationSeconds: number;
  durationInFrames?: number;
  scenes: TimelineScene[];
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_IN_FRAMES =
  typedTimeline.durationInFrames ??
  Math.round(typedTimeline.durationSeconds * FPS);

const timingById = new Map(
  typedTimeline.scenes.map((scene) => [
    scene.id,
    {
      startFrame: scene.startFrame ?? Math.round(scene.startSeconds * FPS),
      durationInFrames:
        scene.durationInFrames ?? Math.round(scene.durationSeconds * FPS),
    },
  ]),
);

const timing = (id: string) => {
  const value = timingById.get(id);
  if (!value) {
    throw new Error(`Missing timeline entry for ${id}.`);
  }
  return value;
};

export type SceneDefinition = {
  id: string;
  startFrame: number;
  durationInFrames: number;
  eyebrow: string;
  title: string;
};

export const SCENES: SceneDefinition[] = [
  {
    id: "scene-intro",
    ...timing("scene-intro"),
    eyebrow: "国家电网电研智枢科研智能平台",
    title: "面向国家电网的电力科研智能平台",
  },
  {
    id: "scene-00",
    ...timing("scene-00"),
    eyebrow: "POWER SYSTEM RESEARCH",
    title: "电力科研论文增长，知识为何仍然分散",
  },
  {
    id: "scene-01",
    ...timing("scene-01"),
    eyebrow: "01 · POSITIONING",
    title: "从读一篇论文，到研究一个电网问题",
  },
  {
    id: "scene-02",
    ...timing("scene-02"),
    eyebrow: "02 · KNOWLEDGE ASSET",
    title: "一次整理，沉淀电力科研知识资产",
  },
  {
    id: "scene-03",
    ...timing("scene-03"),
    eyebrow: "03 · EVIDENCE SYNTHESIS",
    title: "围绕电力科研问题，组织跨文献证据",
  },
  {
    id: "scene-04",
    ...timing("scene-04"),
    eyebrow: "04 · RESEARCH AGENT",
    title: "从工具辅助，到科研智能体主动推进",
  },
  {
    id: "scene-05",
    ...timing("scene-05"),
    eyebrow: "05 · EFFECTIVE RESEARCH TIME",
    title: "让电力科研时间回到判断与创新",
  },
  {
    id: "scene-06",
    ...timing("scene-06"),
    eyebrow: "06 · LOCAL GOVERNANCE",
    title: "电力科研数据不出本地，智能体不越权限",
  },
  {
    id: "scene-07",
    ...timing("scene-07"),
    eyebrow: "国家电网电研智枢科研智能平台",
    title: "持续助力新型电力系统研究",
  },
  {
    id: "scene-outro",
    ...timing("scene-outro"),
    eyebrow: "国家电网电研智枢科研智能平台",
    title: "面向国家电网的电力科研智能平台",
  },
];
