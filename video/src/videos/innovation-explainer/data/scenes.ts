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
    eyebrow: "专业领域大模型智能文献检索与知识服务",
    title: "面向重大工程技术的智能文献检索与知识服务",
  },
  {
    id: "scene-06",
    ...timing("scene-06"),
    eyebrow: "01 · SECURITY BY DESIGN",
    title: "本地闭环、权限继承与关键过程追溯",
  },
  {
    id: "scene-00",
    ...timing("scene-00"),
    eyebrow: "02 · RESEARCH FRICTION",
    title: "资料分散，让工程研究时间耗在重复调研",
  },
  {
    id: "scene-01",
    ...timing("scene-01"),
    eyebrow: "03 · FROM READING TO RESEARCH",
    title: "不止看一篇论文，持续回答一个工程技术问题",
  },
  {
    id: "scene-02",
    ...timing("scene-02"),
    eyebrow: "04 · DOMAIN KNOWLEDGE ASSET",
    title: "一次整理，让论文沉淀为专业知识资产",
  },
  {
    id: "scene-04",
    ...timing("scene-04"),
    eyebrow: "05 · RESEARCH AGENT",
    title: "领域大模型与研究智能体，按目标连续推进",
  },
  {
    id: "scene-architecture",
    ...timing("scene-architecture"),
    eyebrow: "06 · AGENTIC ARCHITECTURE",
    title: "专业领域大模型驱动的智能体工作流",
  },
  {
    id: "scene-03",
    ...timing("scene-03"),
    eyebrow: "07 · RESEARCH OUTCOME",
    title: "减少重复搬运，把时间还给判断与创新",
  },
  {
    id: "scene-07",
    ...timing("scene-07"),
    eyebrow: "08 · SERVICE VALUE",
    title: "把个人积累转化为组织工程创新能力",
  },
  {
    id: "scene-outro",
    ...timing("scene-outro"),
    eyebrow: "专业领域大模型智能文献检索与知识服务",
    title: "让资料成为知识，让知识形成能力",
  },
];
