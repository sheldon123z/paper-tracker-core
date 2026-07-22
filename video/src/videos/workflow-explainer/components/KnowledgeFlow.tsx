import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";

const NODES: { label: string; detail: string; type: GlyphType }[] = [
  { label: "授权论文库", detail: "检索与筛选", type: "library" },
  { label: "本地模型", detail: "提炼与对比", type: "model" },
  { label: "结构化结果", detail: "建议与追问", type: "report" },
];

export const KnowledgeFlow: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        inset: "170px 116px 138px",
        display: "grid",
        gridTemplateColumns: "1fr 1.12fr",
        gap: 48,
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          padding: "70px 42px",
          borderRadius: 32,
          background: "rgba(13,45,77,0.72)",
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 28px 70px rgba(0,0,0,0.28)",
        }}
      >
        {NODES.map((node, index) => (
          <div
            key={node.label}
            style={{ display: "flex", alignItems: "center", gap: 26 }}
          >
            <div
              style={{
                width: 190,
                minHeight: 210,
                padding: "28px 20px",
                borderRadius: 24,
                background:
                  index === 1
                    ? "linear-gradient(155deg, rgba(88,175,255,0.22), rgba(45,212,207,0.16))"
                    : "rgba(6,22,41,0.64)",
                border: `1px solid ${index === 1 ? COLORS.cyan : COLORS.line}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                opacity: interpolate(
                  frame,
                  [index * 14, index * 14 + 20],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
                translate: `0 ${interpolate(
                  frame,
                  [index * 14, index * 14 + 20],
                  [22, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                )}px`,
              }}
            >
              <FeatureGlyph type={node.type} size={68} />
              <div style={{ marginTop: 18, fontSize: 26, fontWeight: 720 }}>
                {node.label}
              </div>
              <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 18 }}>
                {node.detail}
              </div>
            </div>
            {index < NODES.length - 1 ? (
              <div
                style={{
                  width: 42,
                  height: 2,
                  background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.cyan})`,
                  scale: `${interpolate(
                    frame,
                    [index * 14 + 15, index * 14 + 35],
                    [0, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  )} 1`,
                  transformOrigin: "left center",
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div
        style={{
          height: 560,
          borderRadius: 30,
          overflow: "hidden",
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 28px 70px rgba(0,0,0,0.28)",
          opacity: interpolate(frame, [18, 38], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `${interpolate(frame, [18, 38], [26, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px 0`,
        }}
      >
        <Img
          src={staticFile("shared/stills/local-model-status.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </div>
  );
};
