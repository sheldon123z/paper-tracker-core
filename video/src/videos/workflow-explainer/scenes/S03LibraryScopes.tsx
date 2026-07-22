import { Sequence, useCurrentFrame } from "remotion";
import { Callout } from "../components/Callout";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import {
  ScreenRecordingFrame,
  StillFrame,
} from "../components/ScreenRecordingFrame";
import { StepRibbon } from "../components/StepRibbon";
import {
  captionStart,
  getSceneCues,
  makeContinuousSegments,
  segmentIndexAtFrame,
} from "../data/cues";

const STEPS = ["分级论文库", "检索与筛选", "论文阅读", "知识沉淀"];

export const S03LibraryScopes: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-03", durationInFrames);
  const searchStart = captionStart(cues, 1);
  const readingStart = captionStart(cues, 2);
  const knowledgeAssetStart = captionStart(cues, 3);
  const scopeStart = captionStart(cues, 0);
  const publicLibraryStart = Math.round(
    scopeStart + (searchStart - scopeStart) / 3,
  );
  const privateLibraryStart = Math.round(
    scopeStart + ((searchStart - scopeStart) * 2) / 3,
  );
  const visualSegments = makeContinuousSegments(durationInFrames, [
    publicLibraryStart,
    privateLibraryStart,
    searchStart,
    readingStart,
  ]);
  const stepSegments = makeContinuousSegments(durationInFrames, [
    searchStart,
    readingStart,
    knowledgeAssetStart,
  ]);
  const current = segmentIndexAtFrame(frame, stepSegments);
  const [
    scopeSegment,
    publicStill,
    privateStill,
    searchSegment,
    readingSegment,
  ] = visualSegments;

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="03 · RESEARCH LIBRARY"
      title="公共库与部门私有库"
      showHeader={false}
    >
      <Sequence
        from={scopeSegment.from}
        durationInFrames={scopeSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/06-library-scope.mp4"
          trimBeforeSeconds={5}
          label="论文库范围"
          segmentDurationInFrames={scopeSegment.durationInFrames}
          zoomTo={1.035}
        />
      </Sequence>
      <Sequence
        from={searchSegment.from}
        durationInFrames={searchSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/07-library-search.mp4"
          trimBeforeSeconds={6}
          label="检索与筛选"
          segmentDurationInFrames={searchSegment.durationInFrames}
          zoomFrom={1.01}
          zoomTo={1.055}
        />
      </Sequence>
      <Sequence
        from={readingSegment.from}
        durationInFrames={readingSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/08-paper-reading.mp4"
          trimBeforeSeconds={12}
          label="论文阅读"
          segmentDurationInFrames={readingSegment.durationInFrames}
          zoomFrom={1}
          zoomTo={1.05}
        />
      </Sequence>
      <Sequence
        from={publicStill.from}
        durationInFrames={publicStill.durationInFrames}
        premountFor={30}
      >
        <StillFrame
          src="shared/stills/public-library.png"
          label="公共论文库"
          segmentDurationInFrames={publicStill.durationInFrames}
        />
      </Sequence>
      <Sequence
        from={privateStill.from}
        durationInFrames={privateStill.durationInFrames}
        premountFor={30}
      >
        <StillFrame
          src="shared/stills/department-library.png"
          label="部门私有论文库"
          segmentDurationInFrames={privateStill.durationInFrames}
        />
      </Sequence>
      <StepRibbon labels={STEPS} current={current} />
      {frame >= scopeStart && frame < searchStart ? (
        <Callout
          title="清晰的知识边界"
          detail="公共资料统一共享，部门资料按授权范围组织与使用。"
          enterAt={scopeStart}
        />
      ) : null}
      {frame >= knowledgeAssetStart ? (
        <Callout
          title="从文件到知识资产"
          detail="检索、收藏、阅读状态、标签与附件形成持续积累。"
          enterAt={knowledgeAssetStart}
        />
      ) : null}
    </SceneFrame>
  );
};
