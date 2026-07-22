import { Easing, interpolate, useCurrentFrame } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const LEFT_STEPS: { label: string; type: GlyphType }[] = [
  { label: "单篇文件", type: "document" },
  { label: "阅读与标注", type: "note" },
  { label: "个人笔记", type: "folder" },
];

const RIGHT_STEPS: { label: string; type: GlyphType }[] = [
  { label: "电力知识库", type: "grid" },
  { label: "电网问题", type: "question" },
  { label: "跨文献证据", type: "evidence" },
  { label: "分析与成果", type: "report" },
  { label: "持续复用", type: "workflow" },
];

const Lane: React.FC<{
  title: string;
  steps: { label: string; type: GlyphType }[];
  accent: string;
  startFrame: number;
  stepStartFrames?: number[];
  timingScale: number;
  loop?: boolean;
}> = ({
  title,
  steps,
  accent,
  startFrame,
  stepStartFrames,
  timingScale,
  loop = false,
}) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        height: 480,
        borderRadius: 34,
        padding: "30px 34px",
        background: "rgba(6,22,41,0.72)",
        border: `1px solid ${accent}55`,
        boxShadow: "0 28px 74px rgba(0,0,0,0.28)",
        fontFamily: FONT_FAMILY,
        opacity: interpolate(frame, [startFrame, startFrame + 28], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `${interpolate(
          frame,
          [startFrame, startFrame + 28],
          [loop ? 36 : -36, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px 0`,
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 28,
          letterSpacing: 2,
          fontWeight: 760,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: loop ? 8 : 16,
        }}
      >
        {steps.map((step, index) => (
          <div
            key={step.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: loop ? 8 : 16,
            }}
          >
            <div
              style={{
                width: 150,
                minHeight: loop ? 220 : 214,
                padding: loop ? "22px 10px" : "22px 8px",
                borderRadius: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                textAlign: "center",
                background: `${accent}12`,
                border: `1px solid ${accent}44`,
                opacity: interpolate(
                  frame,
                  [
                    stepStartFrames?.[index] ?? startFrame + 20 + index * 15,
                    (stepStartFrames?.[index] ?? startFrame + 20 + index * 15) +
                      22,
                  ],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                ),
              }}
            >
              <FeatureGlyph
                type={step.type}
                size={loop ? 54 : 58}
                color={accent}
              />
              <div
                style={{
                  marginTop: 16,
                  color: COLORS.white,
                  fontSize: loop ? 23 : 23,
                  lineHeight: 1.35,
                  fontWeight: 680,
                  whiteSpace: "nowrap",
                }}
              >
                {step.label}
              </div>
            </div>
            {index < steps.length - 1 ? (
              <div
                style={{
                  color: accent,
                  fontSize: loop ? 28 : 36,
                  opacity: interpolate(
                    frame,
                    [
                      (stepStartFrames?.[index + 1] ??
                        startFrame + 20 + (index + 1) * 15) - 8,
                      (stepStartFrames?.[index + 1] ??
                        startFrame + 20 + (index + 1) * 15) + 6,
                    ],
                    [0, 0.8],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                }}
              >
                →
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 24,
          color: loop ? COLORS.cyan : COLORS.muted,
          fontSize: 26,
          lineHeight: 1.45,
          textAlign: "center",
          fontWeight: loop ? 700 : 520,
        }}
      >
        {loop ? "成果回到知识循环，形成持续积累" : "价值通常在个人笔记处结束"}
      </div>
    </div>
  );
};

export const S01NotJustReader: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, timingScale } = useScaledSceneFrame(durationInFrames, 720);

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="01 · POSITIONING"
      title="从读一篇论文，到研究一个电网问题"
    >
      <div
        style={{
          position: "absolute",
          top: 248,
          left: 108,
          right: 108,
          display: "grid",
          gridTemplateColumns: "650px 1fr",
          gap: 42,
        }}
      >
        <Lane
          title="典型 PDF 阅读器"
          steps={LEFT_STEPS}
          accent={COLORS.dim}
          startFrame={20}
          stepStartFrames={[140, 185, 230]}
          timingScale={timingScale}
        />
        <Lane
          title={SYSTEM_NAME}
          steps={RIGHT_STEPS}
          accent={COLORS.cyan}
          startFrame={60}
          stepStartFrames={[289, 329, 438, 470, 540]}
          timingScale={timingScale}
          loop
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 250,
          right: 250,
          bottom: 178,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 24,
          fontFamily: FONT_FAMILY,
          opacity: interpolate(frame, [440, 480], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {["领域知识", "智能体协同", "科研成果"].map((label, index) => (
          <div
            key={label}
            style={{
              padding: "18px 24px",
              borderRadius: 18,
              textAlign: "center",
              color: index === 1 ? COLORS.cyan : COLORS.white,
              background: "rgba(13,45,77,0.8)",
              border: `1px solid ${index === 1 ? COLORS.cyan : COLORS.line}`,
              fontSize: 30,
              fontWeight: 720,
              letterSpacing: 1,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};
