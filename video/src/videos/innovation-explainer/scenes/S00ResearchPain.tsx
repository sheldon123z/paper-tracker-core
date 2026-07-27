import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const PainPanel: React.FC<{
  eyebrow: string;
  title: string;
  detail: string;
  type: GlyphType;
  accent: string;
}> = ({ eyebrow, title, detail, type, accent }) => (
  <div
    style={{
      minHeight: 360,
      padding: "46px 48px",
      borderRadius: 34,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      background:
        "linear-gradient(145deg, rgba(18,59,98,0.82), rgba(6,22,41,0.90))",
      border: `1px solid ${accent}66`,
      boxShadow: "0 24px 64px rgba(0,0,0,0.24)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div
        style={{
          width: 94,
          height: 94,
          borderRadius: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}14`,
          border: `1px solid ${accent}55`,
        }}
      >
        <FeatureGlyph type={type} size={58} color={accent} />
      </div>
      <div>
        <div
          style={{
            color: accent,
            fontSize: 19,
            letterSpacing: 2.4,
            fontWeight: 720,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ marginTop: 8, fontSize: 40, fontWeight: 770 }}>
          {title}
        </div>
      </div>
    </div>
    <div
      style={{
        marginTop: 38,
        color: COLORS.white,
        fontSize: 29,
        lineHeight: 1.65,
        fontWeight: 560,
      }}
    >
      {detail}
    </div>
  </div>
);

export const S00ResearchPain: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const contentOpacity = interpolate(frame, [10, 40], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const conclusionOpacity = interpolate(
    frame,
    [Math.round(durationInFrames * 0.48), Math.round(durationInFrames * 0.57)],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="01 · RESEARCH FRICTION"
      title="资料分散，让科研时间耗在重复调研"
    >
      <div
        style={{
          position: "absolute",
          top: 286,
          left: 150,
          right: 150,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 34,
          fontFamily: FONT_FAMILY,
          opacity: contentOpacity,
        }}
      >
        <PainPanel
          eyebrow="PAPER GROWTH"
          title="论文与方向持续增加"
          detail="电网稳定、新能源消纳、运行控制等研究资料不断增长，查找范围也随之扩大。"
          type="document"
          accent={COLORS.blue}
        />
        <PainPanel
          eyebrow="REPETITIVE WORK"
          title="整理工作反复发生"
          detail="科研人员重复查找、摘录、对比和汇总，结论又散落在文件夹、笔记与临时报告中。"
          type="person"
          accent={COLORS.amber}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 410,
          right: 410,
          bottom: 175,
          minHeight: 104,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          borderRadius: 26,
          border: `1px solid ${COLORS.cyan}66`,
          background: "rgba(6,22,41,0.94)",
          boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
          fontFamily: FONT_FAMILY,
          opacity: conclusionOpacity,
        }}
      >
        <span style={{ color: COLORS.white, fontSize: 46, fontWeight: 760 }}>
          资料增加
        </span>
        <span style={{ color: COLORS.rose, fontSize: 60, fontWeight: 800 }}>
          ≠
        </span>
        <span style={{ color: COLORS.cyan, fontSize: 46, fontWeight: 760 }}>
          知识沉淀
        </span>
      </div>
    </SceneFrame>
  );
};
