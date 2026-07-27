import { Sequence, useCurrentFrame } from "remotion";
import { Callout } from "../components/Callout";
import { KnowledgeFlow } from "../components/KnowledgeFlow";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenRecordingFrame } from "../components/ScreenRecordingFrame";
import { StepRibbon } from "../components/StepRibbon";
import {
  captionStart,
  getSceneCues,
  makeContinuousSegments,
  segmentIndexAtFrame,
} from "../data/cues";

const STEPS = ["提出问题", "单篇追问", "本地检索与提炼", "跨论文分析"];

export const S04LocalAssistant: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-04", durationInFrames);
  const singlePaperStart = captionStart(cues, 1);
  const knowledgeFlowStart = captionStart(cues, 2);
  const crossPaperResultStart = captionStart(cues, 3);
  const conversationStart = captionStart(cues, 4);
  const segments = makeContinuousSegments(durationInFrames, [
    singlePaperStart,
    knowledgeFlowStart,
    crossPaperResultStart,
  ]);
  const current = segmentIndexAtFrame(frame, segments);
  const [
    querySegment,
    singlePaperSegment,
    knowledgeFlowSegment,
    resultSegment,
  ] = segments;

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="04 · LOCAL INTELLIGENCE"
      title="从阅读到本地智能分析"
      showHeader={false}
    >
      <Sequence
        from={querySegment.from}
        durationInFrames={querySegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/09-assistant-query.mp4"
          trimBeforeSeconds={0}
          label="智能助手"
          segmentDurationInFrames={querySegment.durationInFrames}
          zoomTo={1.04}
        />
      </Sequence>
      <Sequence
        from={singlePaperSegment.from}
        durationInFrames={singlePaperSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/08-2-paper-analyze.mp4"
          trimBeforeSeconds={8}
          label="单篇论文追问"
          segmentDurationInFrames={singlePaperSegment.durationInFrames}
          zoomFrom={1.01}
          zoomTo={1.065}
        />
      </Sequence>
      <Sequence
        from={knowledgeFlowSegment.from}
        durationInFrames={knowledgeFlowSegment.durationInFrames}
        premountFor={30}
      >
        <KnowledgeFlow />
      </Sequence>
      <Sequence
        from={resultSegment.from}
        durationInFrames={resultSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/10-assistant-result.mp4"
          trimBeforeSeconds={0}
          label="跨论文分析"
          segmentDurationInFrames={resultSegment.durationInFrames}
          zoomFrom={1}
          zoomTo={1.06}
        />
      </Sequence>
      <StepRibbon labels={STEPS} current={current} />
      {frame >= knowledgeFlowStart && frame < crossPaperResultStart ? (
        <Callout
          title="研究问题驱动"
          detail="从相关论文定位，到方法对比、趋势归纳与研究建议。"
          enterAt={knowledgeFlowStart}
        />
      ) : null}
      {frame >= crossPaperResultStart && frame < conversationStart ? (
        <Callout
          title="跨论文分析结果"
          detail="方法对比、趋势归纳与后续研究建议集中呈现。"
          enterAt={crossPaperResultStart}
        />
      ) : null}
      {frame >= conversationStart ? (
        <Callout
          title="会话持续沉淀"
          detail="会话按论文和任务保存，便于继续追问和回顾。"
          enterAt={conversationStart}
        />
      ) : null}
    </SceneFrame>
  );
};
