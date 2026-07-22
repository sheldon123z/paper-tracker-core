import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const BEFORE: { label: string; type: GlyphType }[] = [
  { label: "找文件", type: "folder" },
  { label: "建表", type: "table" },
  { label: "摘录", type: "note" },
  { label: "对比", type: "evidence" },
  { label: "汇总", type: "report" },
  { label: "重新查找", type: "folder" },
];

const AFTER: { label: string; type: GlyphType }[] = [
  { label: "领域知识", type: "grid" },
  { label: "智能体规划", type: "model" },
  { label: "主动执行", type: "workflow" },
  { label: "成果复用", type: "report" },
];

const FlowRow: React.FC<{
  label: string;
  items: { label: string; type: GlyphType }[];
  accent: string;
  top: number;
  startFrame: number;
  timingScale: number;
}> = ({ label, items, accent, top, startFrame, timingScale }) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 125,
        right: 125,
        display: "grid",
        gridTemplateColumns: "230px 1fr",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div>
        <div
          style={{
            color: accent,
            fontSize: 26,
            fontWeight: 760,
            letterSpacing: 2,
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 9, color: COLORS.muted, fontSize: 20 }}>
          {items.length > 4
            ? "环节多、切换多、重复多"
            : "路径短、过程连续、成果可延续"}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.label}
            style={{ display: "flex", alignItems: "center", gap: 16 }}
          >
            <div
              style={{
                width: items.length > 4 ? 175 : 250,
                height: 130,
                borderRadius: 24,
                background: `${accent}12`,
                border: `1px solid ${accent}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                opacity: interpolate(
                  frame,
                  [startFrame + index * 16, startFrame + 24 + index * 16],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                ),
              }}
            >
              <FeatureGlyph type={item.type} size={45} color={accent} />
              <div
                style={{
                  marginTop: 10,
                  color: COLORS.white,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {item.label}
              </div>
            </div>
            {index < items.length - 1 ? (
              <div
                style={{
                  color: accent,
                  fontSize: 28,
                  opacity: interpolate(
                    frame,
                    [
                      startFrame + 6 + (index + 1) * 16,
                      startFrame + 24 + (index + 1) * 16,
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
    </div>
  );
};

export const S05EfficiencyMechanism: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, timingScale } = useScaledSceneFrame(durationInFrames, 600);

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="05 · EFFECTIVE RESEARCH TIME"
      title="让电力科研时间回到判断与创新"
    >
      <FlowRow
        label="传统方式"
        items={BEFORE}
        accent={COLORS.amber}
        top={290}
        startFrame={20}
        timingScale={timingScale}
      />
      <FlowRow
        label="本平台"
        items={AFTER}
        accent={COLORS.cyan}
        top={490}
        startFrame={145}
        timingScale={timingScale}
      />

      <div
        style={{
          position: "absolute",
          left: 220,
          right: 220,
          bottom: 176,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 18,
          fontFamily: FONT_FAMILY,
          opacity: interpolate(frame, [356, 372], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {["问题定义", "证据判断", "技术选择", "创新思考"].map(
          (label, index) => (
            <div
              key={label}
              style={{
                padding: "19px 18px",
                borderRadius: 20,
                textAlign: "center",
                background: index === 3 ? COLORS.cyanSoft : COLORS.blueSoft,
                border: `1px solid ${index === 3 ? COLORS.cyan : COLORS.blue}66`,
                color: COLORS.white,
                fontSize: 29,
                fontWeight: 760,
                scale: interpolate(
                  frame,
                  [365 + index * 12, 390 + index * 12],
                  [0.94, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                ),
              }}
            >
              {label}
            </div>
          ),
        )}
      </div>

      <div
        style={{
          position: "absolute",
          right: 130,
          top: 232,
          padding: "12px 18px",
          borderRadius: 999,
          background: "rgba(6,22,41,0.9)",
          border: `1px solid ${COLORS.cyan}`,
          color: COLORS.cyan,
          fontFamily: FONT_FAMILY,
          fontSize: 22,
          fontWeight: 720,
          opacity: interpolate(frame, [398, 425], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        智能体主动推进，人负责科研判断
      </div>
    </SceneFrame>
  );
};
