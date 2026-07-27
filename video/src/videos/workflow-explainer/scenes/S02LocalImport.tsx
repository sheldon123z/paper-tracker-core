import { Sequence, useCurrentFrame } from "remotion";
import { Callout } from "../components/Callout";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenRecordingFrame } from "../components/ScreenRecordingFrame";
import { StepRibbon } from "../components/StepRibbon";
import {
  captionStart,
  getSceneCues,
  makeContinuousSegments,
  segmentIndexAtFrame,
} from "../data/cues";

const STEPS = ["选择文件", "本地解析", "逐篇复核", "重复识别"];

export const S02LocalImport: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-02", durationInFrames);
  const parseStart = captionStart(cues, 1);
  const reviewStart = captionStart(cues, 2);
  const deduplicationStart = captionStart(cues, 3);
  const recordingSegments = makeContinuousSegments(durationInFrames, [
    parseStart,
    reviewStart,
    deduplicationStart,
  ]);
  const stepSegments = makeContinuousSegments(durationInFrames, [
    parseStart,
    reviewStart,
    deduplicationStart,
  ]);
  const current = segmentIndexAtFrame(frame, stepSegments);
  const [openSegment, analyzingSegment, reviewSegment, resultSegment] =
    recordingSegments;

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="02 · LOCAL PDF IMPORT"
      title="批量导入与智能解析"
      showHeader={false}
    >
      <Sequence
        from={openSegment.from}
        durationInFrames={openSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/02-import-open.mp4"
          label="批量导入 PDF"
          segmentDurationInFrames={openSegment.durationInFrames}
          zoomTo={1.035}
        />
      </Sequence>
      <Sequence
        from={analyzingSegment.from}
        durationInFrames={analyzingSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/03-import-analyzing.mp4"
          trimBeforeSeconds={12}
          label="本地解析与 OCR"
          segmentDurationInFrames={analyzingSegment.durationInFrames}
          zoomTo={1.045}
        />
      </Sequence>
      <Sequence
        from={reviewSegment.from}
        durationInFrames={reviewSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/04-import-review.mp4"
          trimBeforeSeconds={16}
          label="元数据复核"
          segmentDurationInFrames={reviewSegment.durationInFrames}
          zoomFrom={1.01}
          zoomTo={1.06}
        />
      </Sequence>
      <Sequence
        from={resultSegment.from}
        durationInFrames={resultSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/05-import-result.mp4"
          trimBeforeSeconds={2}
          label="导入结果"
          segmentDurationInFrames={resultSegment.durationInFrames}
          zoomTo={1.045}
        />
      </Sequence>
      <StepRibbon labels={STEPS} current={current} />
      {frame >= parseStart && frame < reviewStart ? (
        <Callout
          title="本地解析"
          detail="文本提取、OCR 与元数据识别同步完成。"
          enterAt={parseStart}
        />
      ) : null}
      {frame >= deduplicationStart ? (
        <Callout
          title="多维度去重"
          detail="文件指纹、DOI、文献编号与标准化标题联合判断。"
          enterAt={deduplicationStart}
        />
      ) : null}
    </SceneFrame>
  );
};
