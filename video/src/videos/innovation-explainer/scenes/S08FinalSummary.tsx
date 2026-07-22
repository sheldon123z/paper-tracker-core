import { AbsoluteFill, Easing, interpolate } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const SUMMARY: { label: string; detail: string; type: GlyphType }[] = [
  { label: "领域积累", detail: "电网论文成为知识资产", type: "grid" },
  { label: "智能体协同", detail: "自主规划并主动推进", type: "model" },
  { label: "专家创新", detail: "关键判断始终由人负责", type: "person" },
];
const SUMMARY_START_FRAMES = [8, 74, 162];

export const S08FinalSummary: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame } = useScaledSceneFrame(durationInFrames, 360);

  return (
    <AbsoluteFill
      style={{
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        opacity: interpolate(
          frame,
          [0, 18, durationInFrames - 30, durationInFrames - 1],
          [0, 1, 1, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        ),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "92px 210px",
          borderRadius: 72,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.58), rgba(6,22,41,0.55))",
          border: `2px solid ${COLORS.cyan}77`,
          boxShadow:
            "0 0 120px rgba(45,212,207,0.13), inset 0 0 100px rgba(45,212,207,0.04)",
          scale: interpolate(frame, [0, 48], [1.025, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 150,
          left: 250,
          right: 250,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 27,
            letterSpacing: 11,
            fontWeight: 760,
          }}
        >
          {SYSTEM_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 72,
            lineHeight: 1.18,
            fontWeight: 780,
            opacity: interpolate(frame, [12, 32], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          面向国家电网的电力科研智能平台
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 330,
          right: 330,
          top: 430,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        }}
      >
        {SUMMARY.map((item, index) => (
          <div
            key={item.label}
            style={{
              height: 220,
              padding: "28px 24px",
              borderRadius: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              textAlign: "center",
              background: "rgba(13,45,77,0.82)",
              border: `1px solid ${index === 2 ? COLORS.cyan : COLORS.line}`,
              opacity: interpolate(
                frame,
                [SUMMARY_START_FRAMES[index], SUMMARY_START_FRAMES[index] + 22],
                [0, 1],
                {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
              translate: `0 ${interpolate(
                frame,
                [SUMMARY_START_FRAMES[index], SUMMARY_START_FRAMES[index] + 22],
                [20, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px`,
            }}
          >
            <FeatureGlyph
              type={item.type}
              size={62}
              color={index === 2 ? COLORS.cyan : COLORS.blue}
            />
            <div style={{ marginTop: 18, fontSize: 34, fontWeight: 760 }}>
              {item.label}
            </div>
            <div style={{ marginTop: 10, color: COLORS.muted, fontSize: 21 }}>
              {item.detail}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 300,
          right: 300,
          bottom: 230,
          textAlign: "center",
          color: COLORS.white,
          fontSize: 42,
          fontWeight: 720,
          letterSpacing: 1,
          opacity: interpolate(frame, [153, 175], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        自主规划 · 主动推进 · 助力科研
      </div>
    </AbsoluteFill>
  );
};
