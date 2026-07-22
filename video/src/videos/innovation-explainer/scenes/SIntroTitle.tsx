import { AbsoluteFill, Easing, interpolate } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const INTRO_VALUES: { label: string; type: GlyphType }[] = [
  { label: "电力领域知识", type: "grid" },
  { label: "科研智能体", type: "model" },
  { label: "专家判断创新", type: "person" },
];
const INTRO_VALUE_START_FRAMES = [98, 163, 241];

export const SIntroTitle: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame } = useScaledSceneFrame(durationInFrames, 360);

  return (
    <AbsoluteFill
      style={{
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        alignItems: "center",
        justifyContent: "center",
        opacity: interpolate(
          frame,
          [0, 18, durationInFrames - 24, durationInFrames - 1],
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
          left: 120,
          right: 120,
          top: 55,
          bottom: 80,
          borderRadius: "50%",
          border: `2px solid ${COLORS.cyan}88`,
          boxShadow:
            "0 0 120px rgba(45,212,207,0.14), inset 0 0 90px rgba(45,212,207,0.05)",
          scale: interpolate(frame, [0, 55], [1.06, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 170,
          left: 200,
          right: 200,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 28,
            letterSpacing: 12,
            fontWeight: 760,
            opacity: interpolate(frame, [12, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {SYSTEM_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 74,
            lineHeight: 1.15,
            fontWeight: 780,
            letterSpacing: 2,
            opacity: interpolate(frame, [24, 52], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [24, 52], [22, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          <div>面向国家电网</div>
          <div>电力科研智能平台</div>
        </div>
        <div
          style={{
            marginTop: 20,
            color: COLORS.muted,
            fontSize: 34,
            fontWeight: 520,
            letterSpacing: 1.5,
            opacity: interpolate(frame, [46, 76], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          领域知识持续积累 · 科研智能体主动推进 · 专家判断创新
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 360,
          right: 360,
          top: 635,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 22,
        }}
      >
        {INTRO_VALUES.map((item, index) => (
          <div
            key={item.label}
            style={{
              height: 118,
              borderRadius: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              color: COLORS.white,
              background: "rgba(13,45,77,0.76)",
              border: `1px solid ${index === 1 ? COLORS.cyan : COLORS.line}`,
              fontSize: 26,
              fontWeight: 700,
              opacity: interpolate(
                frame,
                [
                  INTRO_VALUE_START_FRAMES[index],
                  INTRO_VALUE_START_FRAMES[index] + 26,
                ],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
              translate: `0 ${interpolate(
                frame,
                [
                  INTRO_VALUE_START_FRAMES[index],
                  INTRO_VALUE_START_FRAMES[index] + 26,
                ],
                [18, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px`,
            }}
          >
            <FeatureGlyph
              type={item.type}
              size={46}
              color={index === 1 ? COLORS.cyan : COLORS.blue}
            />
            {item.label}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
