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

const STEPS = ["选择模板", "分阶段执行", "形成报告", "导出成果"];

export const S05ResearchWorkflow: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-05", durationInFrames);
  const runningStart = captionStart(cues, 2);
  const exportStart = captionStart(cues, 3);
  const reportStart = Math.round(
    runningStart + (exportStart - runningStart) * 0.58,
  );
  const segments = makeContinuousSegments(durationInFrames, [
    runningStart,
    reportStart,
    exportStart,
  ]);
  const current = segmentIndexAtFrame(frame, segments);
  const [templatesSegment, runningSegment, reportSegment, finalReportSegment] =
    segments;

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="05 · RESEARCH WORKFLOW"
      title="研究过程可见，成果可用"
      showHeader={false}
    >
      <Sequence
        from={templatesSegment.from}
        durationInFrames={templatesSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/12-workflow-templates_running.mp4"
          label="科研工作流模板"
          segmentDurationInFrames={templatesSegment.durationInFrames}
          zoomTo={1.04}
        />
      </Sequence>
      <Sequence
        from={runningSegment.from}
        durationInFrames={runningSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/12-workflow-templates_running.mp4"
          trimBeforeSeconds={18}
          label="分阶段执行"
          segmentDurationInFrames={runningSegment.durationInFrames}
          zoomFrom={1.01}
          zoomTo={1.06}
        />
      </Sequence>
      <Sequence
        from={reportSegment.from}
        durationInFrames={reportSegment.durationInFrames}
        premountFor={30}
      >
        <ScreenRecordingFrame
          src="shared/recordings/14-workflow-result.mp4"
          trimBeforeSeconds={3}
          label="调研报告"
          segmentDurationInFrames={reportSegment.durationInFrames}
          zoomFrom={1}
          zoomTo={1.05}
        />
      </Sequence>
      <Sequence
        from={finalReportSegment.from}
        durationInFrames={finalReportSegment.durationInFrames}
        premountFor={30}
      >
        <StillFrame
          src="shared/stills/final-report.png"
          label="成果导出"
          segmentDurationInFrames={finalReportSegment.durationInFrames}
        />
      </Sequence>
      <StepRibbon labels={STEPS} current={current} />
      {frame >= runningStart && frame < exportStart ? (
        <Callout
          title="过程持续可见"
          detail="检索、筛选、分析与报告合成按阶段推进。"
          enterAt={runningStart}
        />
      ) : null}
      {frame >= exportStart ? (
        <Callout
          title="成果直接可用"
          detail="支持导出 Markdown、Word 与 PDF，便于继续编辑和汇报。"
          enterAt={exportStart}
        />
      ) : null}
    </SceneFrame>
  );
};
