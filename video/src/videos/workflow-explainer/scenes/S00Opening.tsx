import { Easing, interpolate, useCurrentFrame } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { captionStart, getSceneCues } from "../data/cues";

const FEATURES: { label: string; type: GlyphType }[] = [
  { label: "本地论文", type: "document" },
  { label: "分级知识库", type: "library" },
  { label: "本地分析", type: "model" },
  { label: "成果输出", type: "report" },
];

export const S00Opening: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-00", durationInFrames);
  const featureStart = captionStart(cues, 2);

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="LOCAL · OFFLINE · KNOWLEDGE WORKSPACE"
      title={SYSTEM_NAME}
      showHeader={false}
    >
      <div
        style={{
          position: "absolute",
          left: 340,
          top: 124,
          width: 1240,
          height: 700,
          borderRadius: "50%",
          border: `2px solid ${COLORS.cyan}`,
          opacity: interpolate(frame, [4, 44], [0, 0.72], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [4, 44], [0.74, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          boxShadow:
            "0 0 90px rgba(45,212,207,0.12), inset 0 0 90px rgba(45,212,207,0.05)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "214px 180px auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          opacity: interpolate(frame, [22, 58], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0 ${interpolate(frame, [22, 58], [24, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 22,
            letterSpacing: 7,
            fontWeight: 680,
          }}
        >
          LOCAL · OFFLINE · KNOWLEDGE WORKSPACE
        </div>
        <div
          style={{
            marginTop: 24,
            color: COLORS.white,
            fontSize: 104,
            lineHeight: 1.08,
            letterSpacing: 2,
            fontWeight: 760,
          }}
        >
          {SYSTEM_NAME}
        </div>
        <div
          style={{
            marginTop: 28,
            color: COLORS.muted,
            fontSize: 48,
            lineHeight: 1.45,
            fontWeight: 520,
          }}
        >
          本地离线运行的论文知识管理与智能分析平台
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 340,
          right: 340,
          top: 700,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: FONT_FAMILY,
        }}
      >
        {FEATURES.map((feature, index) => (
          <div
            key={feature.label}
            style={{
              width: 230,
              minHeight: 176,
              borderRadius: 26,
              border: `1px solid ${COLORS.line}`,
              background: "rgba(13,45,77,0.76)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 22px 54px rgba(0,0,0,0.24)",
              opacity: interpolate(
                frame,
                [featureStart + index * 9, featureStart + 24 + index * 9],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
              translate: `0 ${interpolate(
                frame,
                [featureStart + index * 9, featureStart + 24 + index * 9],
                [28, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px`,
            }}
          >
            <FeatureGlyph type={feature.type} size={58} />
            <div style={{ marginTop: 12, fontSize: 30, fontWeight: 650 }}>
              {feature.label}
            </div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};
