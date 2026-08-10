import { Video } from "@remotion/media";
import { Easing, interpolate, staticFile, useVideoConfig } from "remotion";
import { FeatureGlyph } from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const REFERENCE_DURATION_IN_FRAMES = 26 * 30;
// The real result page begins scrolling shortly after the stable completed
// overview. With a 2.85s trim and 0.75x playback, that lands near frame 67.
// Keep every accompanying
// emphasis animation anchored to the same frame so picture and UI cannot drift.
const ANALYSIS_SCROLL_CUE_FRAME = 67;

const EVIDENCE_NODES = [
  {
    title: "技术路线",
    detail: "不同方案与实现路径",
    accent: COLORS.blue,
    startFrame: ANALYSIS_SCROLL_CUE_FRAME,
  },
  {
    title: "结论差异",
    detail: "研究结论及适用条件",
    accent: COLORS.cyan,
    startFrame: ANALYSIS_SCROLL_CUE_FRAME + 100,
  },
  {
    title: "约束与空白",
    detail: "研究边界与潜在线索",
    accent: COLORS.amber,
    startFrame: ANALYSIS_SCROLL_CUE_FRAME + 200,
  },
] as const;

const EvidenceNode: React.FC<{
  node: (typeof EVIDENCE_NODES)[number];
  index: number;
  frame: number;
}> = ({ node, index, frame }) => {
  const reveal = interpolate(
    frame,
    [node.startFrame, node.startFrame + 36],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const lift = interpolate(
    frame,
    [node.startFrame, node.startFrame + 36],
    [10, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        minHeight: 96,
        display: "grid",
        gridTemplateColumns: "70px 1fr",
        alignItems: "center",
        gap: 18,
        padding: "12px 20px",
        borderRadius: 22,
        background: `linear-gradient(120deg, ${node.accent}18, rgba(6,22,41,0.88))`,
        border: `1px solid ${node.accent}88`,
        boxShadow: `0 14px 34px rgba(0,0,0,0.18), 0 0 28px ${node.accent}16`,
        opacity: reveal,
        translate: `0 ${lift}px`,
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${node.accent}14`,
          border: `1px solid ${node.accent}66`,
        }}
      >
        <FeatureGlyph type="document" size={38} color={node.accent} />
      </div>
      <div>
        <div
          style={{
            color: COLORS.white,
            fontSize: 28,
            lineHeight: 1.2,
            fontWeight: 760,
          }}
        >
          {String(index + 1).padStart(2, "0")} · {node.title}
        </div>
        <div
          style={{
            marginTop: 7,
            color: COLORS.muted,
            fontSize: 19,
            lineHeight: 1.35,
          }}
        >
          {node.detail}
        </div>
      </div>
    </div>
  );
};

const EvidenceBoard: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 105,
        top: 246,
        width: 520,
        bottom: 246,
        padding: "28px 28px 24px",
        boxSizing: "border-box",
        borderRadius: 34,
        background:
          "linear-gradient(150deg, rgba(18,59,98,0.90), rgba(6,22,41,0.95))",
        border: `1px solid ${COLORS.line}`,
        boxShadow: "0 28px 76px rgba(0,0,0,0.28)",
        fontFamily: FONT_FAMILY,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minHeight: 100,
          padding: "0 18px",
          borderRadius: 24,
          background: "rgba(45,212,207,0.10)",
          border: `1px solid ${COLORS.cyan}88`,
          boxShadow: "0 0 42px rgba(45,212,207,0.10)",
        }}
      >
        <FeatureGlyph type="question" size={54} color={COLORS.cyan} />
        <div>
          <div
            style={{
              color: COLORS.cyan,
              fontSize: 17,
              letterSpacing: 2.2,
              fontWeight: 730,
            }}
          >
            中心研究问题
          </div>
          <div
            style={{
              marginTop: 7,
              color: COLORS.white,
              fontSize: 26,
              lineHeight: 1.25,
              fontWeight: 760,
            }}
          >
            高海拔地区电力设备选型
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 18,
          display: "grid",
          gap: 13,
        }}
      >
        {EVIDENCE_NODES.map((node, index) => (
          <EvidenceNode
            key={node.title}
            node={node}
            index={index}
            frame={frame}
          />
        ))}
      </div>
    </div>
  );
};

const AssistantWorkbench: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const reveal = interpolate(
    frame,
    [ANALYSIS_SCROLL_CUE_FRAME, ANALYSIS_SCROLL_CUE_FRAME + 58],
    [0.48, 1],
    {
      easing: Easing.bezier(0.45, 0, 0.55, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const veilOpacity = interpolate(
    frame,
    [ANALYSIS_SCROLL_CUE_FRAME, ANALYSIS_SCROLL_CUE_FRAME + 80],
    [0.46, 0.06],
    {
      easing: Easing.bezier(0.45, 0, 0.55, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const resultCardEnter = interpolate(
    frame,
    [ANALYSIS_SCROLL_CUE_FRAME, ANALYSIS_SCROLL_CUE_FRAME + 36],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 675,
        right: 105,
        top: 246,
        bottom: 246,
        overflow: "hidden",
        borderRadius: 34,
        background: "#EAF2F9",
        border: `1px solid rgba(45,212,207,${0.45 + reveal * 0.45})`,
        boxShadow: `0 30px 82px rgba(0,0,0,0.34), 0 0 ${42 * reveal}px rgba(45,212,207,0.11)`,
        fontFamily: FONT_FAMILY,
      }}
    >
      <Video
        src={staticFile(
          "innovation-explainer/recordings/high-altitude-workflow-result.mp4",
        )}
        trimBefore={Math.round(2.85 * fps)}
        playbackRate={0.75}
        muted
        objectFit="fill"
        style={{
          position: "absolute",
          width: 1414,
          height: 795,
          left: -274,
          top: 0,
          filter: `contrast(1.025) saturate(${0.88 + reveal * 0.13})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(6,22,41,${veilOpacity})`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 22,
          top: 20,
          padding: "10px 16px",
          borderRadius: 999,
          color: COLORS.white,
          background: "rgba(6,22,41,0.88)",
          border: `1px solid ${COLORS.cyan}88`,
          fontSize: 18,
          fontWeight: 720,
          opacity: resultCardEnter,
          translate: `0 ${interpolate(resultCardEnter, [0, 1], [10, 0])}px`,
        }}
      >
        真实工作流页面 · 结构化综述初稿
      </div>
    </div>
  );
};

export const S03EvidenceSynthesis: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame } = useScaledSceneFrame(
    durationInFrames,
    REFERENCE_DURATION_IN_FRAMES,
  );
  const opacity = interpolate(
    frame,
    [0, 22, REFERENCE_DURATION_IN_FRAMES - 14, REFERENCE_DURATION_IN_FRAMES],
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
      eyebrow="06 · RESEARCH OUTCOME"
      title="从跨文献证据，到结构化综述初稿"
    >
      <div style={{ opacity }}>
        <EvidenceBoard frame={frame} />
        <AssistantWorkbench frame={frame} />
      </div>
    </SceneFrame>
  );
};
