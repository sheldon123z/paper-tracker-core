import { Easing, interpolate } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const SHIFTS: { from: string; to: string; type: GlyphType }[] = [
  { from: "电网论文", to: "领域知识资产", type: "grid" },
  { from: "被动工具", to: "科研智能体", type: "model" },
  { from: "个人积累", to: "组织科研能力", type: "governance" },
];
const SHIFT_START_FRAMES = [78, 158, 233];

export const S07ValueClosing: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame } = useScaledSceneFrame(durationInFrames, 420);

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow={SYSTEM_NAME}
      title="持续助力新型电力系统研究"
      showHeader={false}
    >
      <div
        style={{
          position: "absolute",
          left: 200,
          right: 200,
          top: 60,
          height: 870,
          borderRadius: "50%",
          border: `2px solid ${COLORS.cyan}`,
          opacity: interpolate(frame, [0, 52], [0.12, 0.58], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 52], [1.08, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          boxShadow:
            "0 0 100px rgba(45,212,207,0.12), inset 0 0 80px rgba(45,212,207,0.05)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 154,
          left: 230,
          right: 230,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 23,
            letterSpacing: 8,
            fontWeight: 720,
            opacity: interpolate(frame, [10, 35], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {SYSTEM_NAME}
        </div>
        <div
          style={{
            marginTop: 22,
            color: COLORS.white,
            fontSize: 88,
            lineHeight: 1.18,
            fontWeight: 780,
            opacity: interpolate(frame, [18, 48], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          持续助力新型电力系统研究
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 365,
          right: 365,
          top: 392,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          fontFamily: FONT_FAMILY,
        }}
      >
        {SHIFTS.map((shift, index) => (
          <div
            key={shift.from}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 1.2fr",
              alignItems: "center",
              minHeight: 96,
              padding: "14px 24px",
              borderRadius: 22,
              background: "rgba(13,45,77,0.72)",
              border: `1px solid ${index === 2 ? COLORS.cyan : COLORS.line}`,
              opacity: interpolate(
                frame,
                [SHIFT_START_FRAMES[index], SHIFT_START_FRAMES[index] + 30],
                [0, 1],
                {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
              translate: `${interpolate(
                frame,
                [SHIFT_START_FRAMES[index], SHIFT_START_FRAMES[index] + 30],
                [-24, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px 0`,
            }}
          >
            <div
              style={{ color: COLORS.muted, fontSize: 31, textAlign: "right" }}
            >
              {shift.from}
            </div>
            <div
              style={{ color: COLORS.cyan, fontSize: 42, textAlign: "center" }}
            >
              →
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                color: COLORS.white,
                fontSize: 37,
                fontWeight: 760,
              }}
            >
              <FeatureGlyph type={shift.type} size={48} color={COLORS.cyan} />
              {shift.to}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 320,
          right: 320,
          textAlign: "center",
          color: COLORS.muted,
          fontFamily: FONT_FAMILY,
          fontSize: 29,
          letterSpacing: 1.4,
          opacity: interpolate(frame, [300, 326], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        本地离线运行 · 电力知识积累 · 智能体主动推进 · 专家判断创新
      </div>
    </SceneFrame>
  );
};
