import { Video } from "@remotion/media";
import {
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const REFERENCE_DURATION_IN_FRAMES = 30 * 30;
const REPORT_COMPLETION_START_FRAME = 690;
const REPORT_COMPLETION_DONE_FRAME = 720;

const EXECUTION_STEPS: {
  title: string;
  detail: string;
  tool: string;
  type: GlyphType;
  startFrame: number;
}[] = [
  {
    title: "任务拆解",
    detail: "把研究目标拆为连续阶段",
    tool: "研究任务规划",
    type: "workflow",
    startFrame: 70,
  },
  {
    title: "文献检索",
    detail: "限定在当前授权论文库",
    tool: "授权库检索",
    type: "library",
    startFrame: 180,
  },
  {
    title: "证据筛选",
    detail: "识别方法、结论与边界",
    tool: "证据筛选",
    type: "evidence",
    startFrame: 290,
  },
  {
    title: "跨文献组织",
    detail: "关联差异、条件与约束",
    tool: "跨文献分析",
    type: "grid",
    startFrame: 400,
  },
  {
    title: "路线与空白归纳",
    detail: "形成技术路线和研究线索",
    tool: "路线归纳",
    type: "question",
    startFrame: 510,
  },
  {
    title: "报告合成",
    detail: "生成结构化综述初稿",
    tool: "报告生成",
    type: "report",
    startFrame: 620,
  },
];

const STATUS_ITEMS = [
  { label: "任务阶段", value: "连续推进" },
  { label: "授权范围", value: "当前论文库" },
  { label: "中间结果", value: "实时呈现" },
  { label: "专家控制", value: "可审阅修正" },
] as const;

const getActiveStep = (frame: number) => {
  let active = 0;
  for (let index = 0; index < EXECUTION_STEPS.length; index += 1) {
    if (frame >= EXECUTION_STEPS[index].startFrame) {
      active = index;
    }
  }
  return active;
};

const StepRow: React.FC<{
  step: (typeof EXECUTION_STEPS)[number];
  index: number;
  frame: number;
  activeIndex: number;
  workflowComplete: boolean;
}> = ({ step, index, frame, activeIndex, workflowComplete }) => {
  const enter = interpolate(
    frame,
    [step.startFrame - 26, step.startFrame + 10],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const isComplete =
    index < activeIndex ||
    (workflowComplete && index === EXECUTION_STEPS.length - 1);
  const isActive = index === activeIndex && !workflowComplete;
  const accent = isActive ? COLORS.cyan : isComplete ? COLORS.blue : COLORS.dim;

  return (
    <div
      style={{
        minHeight: 58,
        boxSizing: "border-box",
        padding: "9px 12px",
        display: "grid",
        gridTemplateColumns: "42px 1fr",
        gap: 12,
        alignItems: "center",
        borderRadius: 16,
        opacity: enter,
        translate: `0 ${8 * (1 - enter)}px`,
        background: isActive
          ? "linear-gradient(120deg, rgba(45,212,207,0.18), rgba(18,59,98,0.82))"
          : "rgba(6,22,41,0.68)",
        border: `1px solid ${isActive ? COLORS.cyan : COLORS.line}`,
        boxShadow: isActive ? "0 12px 34px rgba(45,212,207,0.12)" : "none",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          color: isComplete ? COLORS.background : accent,
          background: isComplete ? COLORS.blue : `${accent}14`,
          border: `1px solid ${accent}88`,
        }}
      >
        {isComplete ? (
          <span style={{ fontSize: 20, fontWeight: 840 }}>✓</span>
        ) : (
          <FeatureGlyph type={step.type} size={28} color={accent} />
        )}
      </div>
      <div>
        <div
          style={{
            color: isActive ? COLORS.cyan : COLORS.white,
            fontSize: 21,
            lineHeight: 1.15,
            fontWeight: 790,
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            marginTop: 3,
            color: COLORS.muted,
            fontSize: 15,
            lineHeight: 1.25,
          }}
        >
          {step.detail}
        </div>
      </div>
    </div>
  );
};

const TaskControlPane: React.FC<{
  frame: number;
  activeIndex: number;
  workflowComplete: boolean;
}> = ({ frame, activeIndex, workflowComplete }) => {
  const activeStep = EXECUTION_STEPS[activeIndex];

  return (
    <div
      style={{
        minWidth: 0,
        boxSizing: "border-box",
        padding: "24px 24px 22px",
        overflow: "hidden",
        borderRadius: 30,
        color: COLORS.white,
        background: "linear-gradient(145deg, #0b2d4e, #071d35)",
        border: "1px solid rgba(130,186,235,0.34)",
        boxShadow: "0 26px 72px rgba(0,0,0,0.30)",
      }}
    >
      <div
        style={{
          padding: "15px 17px",
          borderRadius: 18,
          background: "rgba(45,212,207,0.10)",
          border: `1px solid ${COLORS.cyan}88`,
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 15,
            fontWeight: 780,
            letterSpacing: 1.8,
          }}
        >
          ENGINEERING GOAL · 示例课题
        </div>
        <div
          style={{
            marginTop: 7,
            fontSize: 24,
            lineHeight: 1.3,
            fontWeight: 790,
          }}
        >
          高海拔地区电力设备选型
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
        {EXECUTION_STEPS.map((step, index) => (
          <StepRow
            key={step.title}
            step={step}
            index={index}
            frame={frame}
            activeIndex={activeIndex}
            workflowComplete={workflowComplete}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          minHeight: 42,
          boxSizing: "border-box",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderRadius: 14,
          color: COLORS.white,
          background: "rgba(6,22,41,0.82)",
          border: `1px solid ${COLORS.line}`,
          fontSize: 16,
        }}
      >
        <span style={{ color: COLORS.muted }}>当前工具</span>
        <span style={{ color: COLORS.cyan, fontWeight: 760 }}>
          {workflowComplete ? "报告已生成" : activeStep.tool}
        </span>
      </div>
    </div>
  );
};

const WorkflowEvidencePane: React.FC<{
  frame: number;
  activeIndex: number;
  workflowComplete: boolean;
}> = ({ frame, activeIndex, workflowComplete }) => {
  const { fps } = useVideoConfig();
  const completionProgress = interpolate(
    frame,
    [REPORT_COMPLETION_START_FRAME, REPORT_COMPLETION_DONE_FRAME],
    [0, 1],
    {
      easing: Easing.bezier(0.45, 0, 0.55, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const expertEnter = interpolate(frame, [600, 640], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const expertOpacity = expertEnter * (1 - completionProgress);

  return (
    <div
      style={{
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
        borderRadius: 30,
        background: "#eaf2f9",
        border: "1px solid rgba(130,186,235,0.42)",
        boxShadow: "0 26px 72px rgba(0,0,0,0.32)",
      }}
    >
      <Video
        src={staticFile(
          "innovation-explainer/recordings/high-altitude-workflow-running.mp4",
        )}
        trimBefore={Math.round(7.2 * fps)}
        playbackRate={0.4}
        muted
        objectFit="cover"
        style={{
          width: "100%",
          height: "100%",
          objectPosition: "center center",
          scale: 1.255,
          translate: "-146px 103px",
          filter: "contrast(1.025) saturate(1.015)",
          opacity: 1 - completionProgress,
        }}
      />

      <Sequence
        from={REPORT_COMPLETION_START_FRAME}
        premountFor={fps}
        style={{ opacity: completionProgress }}
      >
        <Video
          src={staticFile(
            "innovation-explainer/recordings/high-altitude-workflow-result.mp4",
          )}
          trimBefore={Math.round(2.7 * fps)}
          playbackRate={0.58}
          muted
          objectFit="cover"
          style={{
            width: "100%",
            height: "100%",
            objectPosition: "center center",
            scale: 1.255,
            translate: "-146px 103px",
            filter: "contrast(1.025) saturate(1.015)",
          }}
        />
      </Sequence>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 76,
          boxSizing: "border-box",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: COLORS.white,
          background: "linear-gradient(90deg, #0b3154, #0a2947)",
          borderBottom: "1px solid rgba(130,186,235,0.28)",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 810 }}>
            {workflowComplete
              ? "研究智能体已完成报告"
              : "研究智能体正在按流程执行"}
          </div>
          <div style={{ marginTop: 3, color: COLORS.muted, fontSize: 16 }}>
            {workflowComplete
              ? "服务实景 · 报告已生成并可继续审阅"
              : "服务实景 · 阶段状态与中间结果"}
          </div>
        </div>
        <div
          style={{
            padding: "9px 15px",
            borderRadius: 999,
            color: COLORS.cyan,
            background: COLORS.cyanSoft,
            border: "1px solid rgba(45,212,207,0.55)",
            fontSize: 18,
            fontWeight: 780,
          }}
        >
          {workflowComplete
            ? "报告生成完成"
            : EXECUTION_STEPS[activeIndex].title}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 22,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          opacity: 1 - completionProgress,
        }}
      >
        {STATUS_ITEMS.map((item, index) => {
          const enter = interpolate(
            frame,
            [130 + index * 90, 164 + index * 90],
            [0, 1],
            {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

          return (
            <div
              key={item.label}
              style={{
                minHeight: 70,
                boxSizing: "border-box",
                padding: "12px 13px",
                borderRadius: 15,
                opacity: enter,
                color: COLORS.white,
                background: "rgba(6,22,41,0.90)",
                border: `1px solid ${index === 3 ? COLORS.cyan : COLORS.line}`,
                boxShadow: "0 12px 28px rgba(0,0,0,0.20)",
              }}
            >
              <div style={{ color: COLORS.muted, fontSize: 14 }}>
                {item.label}
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: index === 3 ? COLORS.cyan : COLORS.white,
                  fontSize: 18,
                  fontWeight: 760,
                }}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          top: 102,
          right: 24,
          width: 390,
          boxSizing: "border-box",
          padding: "18px 20px",
          borderRadius: 20,
          opacity: expertOpacity,
          translate: `0 ${12 * (1 - expertOpacity)}px`,
          color: COLORS.white,
          background: "rgba(6,22,41,0.94)",
          border: `1px solid ${COLORS.cyan}88`,
          boxShadow: "0 18px 46px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: COLORS.cyan,
            fontSize: 19,
            fontWeight: 790,
          }}
        >
          <FeatureGlyph type="person" size={36} color={COLORS.cyan} />
          专家在环
        </div>
        <div
          style={{
            marginTop: 10,
            color: COLORS.white,
            fontSize: 20,
            lineHeight: 1.5,
          }}
        >
          可随时审阅、追问和修正，最终判断权始终由专家保留。
        </div>
      </div>
    </div>
  );
};

export const S04ResearchAgentCore: React.FC<{
  durationInFrames: number;
}> = ({ durationInFrames }) => {
  const rawFrame = useCurrentFrame();
  const frame =
    rawFrame * (REFERENCE_DURATION_IN_FRAMES / Math.max(1, durationInFrames));
  const activeIndex = getActiveStep(frame);
  const workflowComplete = frame >= REPORT_COMPLETION_DONE_FRAME;
  const opacity = interpolate(
    rawFrame,
    [0, 24, durationInFrames - 18, durationInFrames - 1],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="05 · RESEARCH AGENT"
      title="专业研究智能体，按目标与模板连续推进"
    >
      <div
        style={{
          position: "absolute",
          left: 118,
          right: 118,
          top: 246,
          bottom: 238,
          display: "grid",
          gridTemplateColumns: "520px 1fr",
          gap: 22,
          opacity,
          fontFamily: FONT_FAMILY,
        }}
      >
        <TaskControlPane
          frame={frame}
          activeIndex={activeIndex}
          workflowComplete={workflowComplete}
        />
        <WorkflowEvidencePane
          frame={frame}
          activeIndex={activeIndex}
          workflowComplete={workflowComplete}
        />
      </div>
    </SceneFrame>
  );
};
