import { useCurrentFrame } from "remotion";
import { Callout } from "../components/Callout";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenRecordingFrame } from "../components/ScreenRecordingFrame";
import { StepRibbon } from "../components/StepRibbon";
import { getSceneCues } from "../data/cues";

const STEPS = ["论文导入", "分级管理", "阅读积累", "本地分析", "成果输出"];

export const S01Overview: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-01", durationInFrames);
  const firstStart = cues.captionStartFrames[0];
  const firstEnd = cues.captionEndFrames[0];
  const secondStart = cues.captionStartFrames[1];
  const secondEnd = cues.captionEndFrames[1];
  const milestones = [
    firstStart,
    firstStart + (firstEnd - firstStart) / 3,
    firstStart + ((firstEnd - firstStart) * 2) / 3,
    secondStart,
    secondStart + (secondEnd - secondStart) / 2,
  ];
  const current = Math.max(
    0,
    milestones.reduce(
      (active, milestone, index) => (frame >= milestone ? index : active),
      0,
    ),
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="01 · SYSTEM OVERVIEW"
      title="统一工作台，贯通论文全流程"
      showHeader={false}
    >
      <ScreenRecordingFrame
        src="shared/recordings/01-dashboard-overview.mp4"
        trimBeforeSeconds={1}
        label="系统全景"
        segmentDurationInFrames={durationInFrames}
        zoomFrom={1}
        zoomTo={1.045}
      />
      <StepRibbon labels={STEPS} current={current} />
      <Callout
        title="一个工作台"
        detail="从论文进入系统，到知识沉淀与成果输出，形成连续工作链路。"
      />
    </SceneFrame>
  );
};
