import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { SERVICE_NAME } from "../brand";

const PositionCard: React.FC<{
  label: string;
  title: string;
  items: string[];
  conclusion: string;
  type: GlyphType;
  accent: string;
}> = ({ label, title, items, conclusion, type, accent }) => (
  <div
    style={{
      minHeight: 470,
      padding: "40px 46px",
      borderRadius: 34,
      background:
        "linear-gradient(145deg, rgba(18,59,98,0.80), rgba(6,22,41,0.90))",
      border: `1px solid ${accent}66`,
      boxShadow: "0 28px 72px rgba(0,0,0,0.26)",
      fontFamily: FONT_FAMILY,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <div
        style={{
          width: 86,
          height: 86,
          borderRadius: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}14`,
          border: `1px solid ${accent}55`,
        }}
      >
        <FeatureGlyph type={type} size={54} color={accent} />
      </div>
      <div>
        <div
          style={{
            color: accent,
            fontSize: 19,
            letterSpacing: 2.2,
            fontWeight: 720,
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 7, fontSize: 38, fontWeight: 770 }}>
          {title}
        </div>
      </div>
    </div>

    <div
      style={{
        marginTop: 38,
        display: "grid",
        gap: 15,
      }}
    >
      {items.map((item) => (
        <div
          key={item}
          style={{
            minHeight: 58,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 20px",
            borderRadius: 16,
            background: `${accent}0d`,
            border: `1px solid ${accent}33`,
            color: COLORS.white,
            fontSize: 27,
            fontWeight: 620,
          }}
        >
          <span style={{ color: accent, fontSize: 22 }}>●</span>
          {item}
        </div>
      ))}
    </div>

    <div
      style={{
        marginTop: 28,
        color: accent,
        fontSize: 25,
        lineHeight: 1.5,
        textAlign: "center",
        fontWeight: 720,
      }}
    >
      {conclusion}
    </div>
  </div>
);

export const S01NotJustReader: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [10, 42], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="02 · FROM READING TO RESEARCH"
      title="从阅读单篇论文，到研究一个工程技术问题"
    >
      <div
        style={{
          position: "absolute",
          top: 276,
          left: 150,
          right: 150,
          display: "grid",
          gridTemplateColumns: "1fr 90px 1fr",
          gap: 26,
          alignItems: "center",
          opacity,
        }}
      >
        <PositionCard
          label="TYPICAL PDF READER"
          title="以单篇文件为中心"
          items={["打开与阅读", "标注与摘录", "形成个人笔记"]}
          conclusion="价值通常停留在一次阅读"
          type="document"
          accent={COLORS.dim}
        />
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 62,
            fontWeight: 300,
            textAlign: "center",
          }}
        >
          →
        </div>
        <PositionCard
          label={SERVICE_NAME}
          title="以工程问题为中心"
          items={["汇聚授权专业文献", "组织跨论文证据", "沉淀分析与成果"]}
          conclusion="同一工程研究上下文持续积累与复用"
          type="workflow"
          accent={COLORS.cyan}
        />
      </div>
    </SceneFrame>
  );
};
