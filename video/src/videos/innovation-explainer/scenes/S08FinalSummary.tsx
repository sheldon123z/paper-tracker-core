import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { SERVICE_NAME } from "../brand";

const SUMMARY: { label: string; type: GlyphType }[] = [
  { label: "知识资产", type: "grid" },
  { label: "领域大模型", type: "model" },
  { label: "安全治理", type: "governance" },
];

export const S08FinalSummary: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 24, durationInFrames - 16, durationInFrames - 1],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "100px 230px 118px",
          borderRadius: 64,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.58), rgba(6,22,41,0.58))",
          border: `2px solid ${COLORS.cyan}77`,
          boxShadow:
            "0 0 110px rgba(45,212,207,0.12), inset 0 0 90px rgba(45,212,207,0.04)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 170,
          left: 260,
          right: 260,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 27,
            letterSpacing: 10,
            fontWeight: 760,
          }}
        >
          {SERVICE_NAME}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 70,
            lineHeight: 1.18,
            fontWeight: 780,
          }}
        >
          让资料成为知识，让知识形成能力
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 350,
          right: 350,
          top: 470,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 22,
        }}
      >
        {SUMMARY.map((item, index) => (
          <div
            key={item.label}
            style={{
              height: 188,
              borderRadius: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              background: "rgba(13,45,77,0.82)",
              border: `1px solid ${index === 2 ? COLORS.cyan : COLORS.line}`,
            }}
          >
            <FeatureGlyph
              type={item.type}
              size={58}
              color={index === 2 ? COLORS.cyan : COLORS.blue}
            />
            <div style={{ marginTop: 18, fontSize: 33, fontWeight: 760 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 300,
          right: 300,
          bottom: 214,
          textAlign: "center",
          color: COLORS.white,
          fontSize: 38,
          fontWeight: 720,
        }}
      >
        让知识服务助力重大工程技术创新
      </div>
    </AbsoluteFill>
  );
};
