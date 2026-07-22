import { Easing, interpolate, Sequence } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenEvidenceFrame } from "../components/ScreenEvidenceFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const STAGES: { title: string; result: string; type: GlyphType }[] = [
  { title: "理解目标", result: "识别电力科研问题", type: "grid" },
  { title: "自主规划", result: "拆解研究步骤", type: "model" },
  { title: "主动执行", result: "检索 · 比对 · 追问", type: "workflow" },
];
const STAGE_START_FRAMES = [20, 71, 225];

export const S04ResearchAgent: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, scaleFrame } = useScaledSceneFrame(durationInFrames, 900);
  const conceptOpacity = interpolate(frame, [270, 330], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="04 · RESEARCH AGENT"
      title="从工具辅助，到科研智能体主动推进"
    >
      <div
        style={{
          position: "absolute",
          top: 278,
          left: 110,
          right: 110,
          opacity: conceptOpacity,
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {STAGES.map((stage, index) => (
            <div
              key={stage.title}
              style={{ display: "flex", alignItems: "center", gap: 18 }}
            >
              <div
                style={{
                  width: 330,
                  minHeight: 260,
                  padding: "30px 26px",
                  borderRadius: 30,
                  background: "rgba(13,45,77,0.82)",
                  border: `1px solid ${index === 2 ? COLORS.cyan : COLORS.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  textAlign: "center",
                  opacity: interpolate(
                    frame,
                    [STAGE_START_FRAMES[index], STAGE_START_FRAMES[index] + 32],
                    [0, 1],
                    {
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                  translate: `0 ${interpolate(
                    frame,
                    [STAGE_START_FRAMES[index], STAGE_START_FRAMES[index] + 32],
                    [24, 0],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  )}px`,
                }}
              >
                <FeatureGlyph
                  type={stage.type}
                  size={68}
                  color={index === 2 ? COLORS.cyan : COLORS.blue}
                />
                <div style={{ marginTop: 20, fontSize: 34, fontWeight: 760 }}>
                  {stage.title}
                </div>
                <div
                  style={{ marginTop: 12, color: COLORS.muted, fontSize: 22 }}
                >
                  {stage.result}
                </div>
              </div>
              {index < STAGES.length - 1 ? (
                <div
                  style={{
                    color: COLORS.cyan,
                    fontSize: 40,
                    opacity: interpolate(
                      frame,
                      [
                        STAGE_START_FRAMES[index + 1] - 10,
                        STAGE_START_FRAMES[index + 1] + 8,
                      ],
                      [0, 1],
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
            margin: "46px auto 0",
            width: 1100,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            opacity: interpolate(frame, [190, 245], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["自主拆解任务", "主动组织证据", "全程过程留痕"].map(
            (label, index) => (
              <div
                key={label}
                style={{
                  padding: "18px 20px",
                  borderRadius: 18,
                  textAlign: "center",
                  background:
                    index === 1 ? COLORS.blueSoft : "rgba(6,22,41,0.75)",
                  border: `1px solid ${index === 1 ? COLORS.blue : COLORS.line}`,
                  color: COLORS.white,
                  fontSize: 27,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </div>

      <Sequence
        from={scaleFrame(310)}
        durationInFrames={scaleFrame(560)}
        premountFor={30}
      >
        <ScreenEvidenceFrame
          src="shared/stills/final-report.png"
          label="智能体连续执行 · 形成结构化调研成果"
          durationInFrames={scaleFrame(560)}
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            top: 236,
            bottom: 172,
          }}
          mediaScale={1.03}
          brandPatch
        />
      </Sequence>
      {[
        {
          text: "关键假设 · 冲突证据 · 结论边界",
          frames: [440, 460, 570, 590],
        },
        {
          text: "由科研人员确认 · 专家始终保留判断权",
          frames: [580, 600, 680, 700],
        },
        {
          text: "智能体主动推进 · 专家负责判断",
          frames: [695, 718, 880, 899],
        },
      ].map((cue) => (
        <div
          key={cue.text}
          style={{
            position: "absolute",
            left: 430,
            right: 430,
            bottom: 178,
            zIndex: 6,
            padding: "15px 24px",
            borderRadius: 18,
            textAlign: "center",
            color: COLORS.white,
            background: "rgba(6,22,41,0.92)",
            border: `1px solid ${COLORS.cyan}`,
            fontFamily: FONT_FAMILY,
            fontSize: 28,
            fontWeight: 740,
            opacity: interpolate(frame, cue.frames, [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {cue.text}
        </div>
      ))}
    </SceneFrame>
  );
};
