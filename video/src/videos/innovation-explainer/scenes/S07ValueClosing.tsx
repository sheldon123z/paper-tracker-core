import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { SERVICE_NAME } from "../brand";

const SHIFTS: { from: string; to: string; type: GlyphType }[] = [
  { from: "分散论文", to: "领域知识资产", type: "grid" },
  { from: "个人积累", to: "组织工程创新能力", type: "governance" },
  { from: "被动查找", to: "智能体按流程推进", type: "model" },
];

export const S07ValueClosing: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [6, 32], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow={SERVICE_NAME}
      title="把个人积累转化为组织工程创新能力"
      showHeader={false}
    >
      <div
        style={{
          position: "absolute",
          inset: "86px 220px 118px",
          borderRadius: 58,
          border: `2px solid ${COLORS.cyan}66`,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.52), rgba(6,22,41,0.58))",
          boxShadow:
            "0 0 100px rgba(45,212,207,0.10), inset 0 0 80px rgba(45,212,207,0.04)",
          opacity,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 142,
          left: 260,
          right: 260,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          opacity,
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 23,
            letterSpacing: 8,
            fontWeight: 720,
          }}
        >
          {SERVICE_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            color: COLORS.white,
            fontSize: 74,
            lineHeight: 1.18,
            fontWeight: 780,
          }}
        >
          面向重大工程技术的专业知识服务
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 390,
          right: 390,
          top: 420,
          display: "grid",
          gap: 20,
          fontFamily: FONT_FAMILY,
          opacity,
        }}
      >
        {SHIFTS.map((shift, index) => (
          <div
            key={shift.from}
            style={{
              minHeight: 104,
              display: "grid",
              gridTemplateColumns: "1fr 86px 1.25fr",
              alignItems: "center",
              padding: "0 34px",
              borderRadius: 24,
              background: "rgba(13,45,77,0.72)",
              border: `1px solid ${index === 2 ? COLORS.cyan : COLORS.line}`,
            }}
          >
            <div
              style={{ color: COLORS.muted, fontSize: 31, textAlign: "right" }}
            >
              {shift.from}
            </div>
            <div
              style={{ color: COLORS.cyan, fontSize: 40, textAlign: "center" }}
            >
              →
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                color: COLORS.white,
                fontSize: 35,
                fontWeight: 760,
              }}
            >
              <FeatureGlyph type={shift.type} size={46} color={COLORS.cyan} />
              {shift.to}
            </div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};
