import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { SERVICE_NAME } from "../brand";

const RESEARCH_SIGNALS: {
  label: string;
  detail: string;
  type: GlyphType;
  accent: string;
}[] = [
  {
    label: "问题更复杂",
    detail: "复杂工况与关键装备",
    type: "grid",
    accent: COLORS.blue,
  },
  {
    label: "资料更庞杂",
    detail: "论文、成果与研究记录",
    type: "document",
    accent: COLORS.amber,
  },
  {
    label: "研判节奏更快",
    detail: "持续分析与快速验证",
    type: "workflow",
    accent: COLORS.cyan,
  },
];

const SERVICE_VALUES: {
  label: string;
  type: GlyphType;
  accent: string;
}[] = [
  { label: "领域知识资产", type: "library", accent: COLORS.blue },
  { label: "专业领域大模型", type: "model", accent: COLORS.cyan },
  { label: "专家在环", type: "person", accent: COLORS.amber },
];

const fadeWindow = (
  frame: number,
  start: number,
  fadeInEnd: number,
  fadeOutStart: number,
  end: number,
) =>
  interpolate(frame, [start, fadeInEnd, fadeOutStart, end], [0, 1, 1, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ResearchContext: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = fadeWindow(frame, 0, 30, 290, 340);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 116,
          left: 210,
          right: 210,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 25,
            fontWeight: 760,
            letterSpacing: 8,
          }}
        >
          MAJOR ENGINEERING · 重大工程技术
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 75,
            lineHeight: 1.16,
            fontWeight: 800,
          }}
        >
          重大工程技术攻关进入新阶段
        </div>
        <div
          style={{
            marginTop: 18,
            color: COLORS.muted,
            fontSize: 31,
            lineHeight: 1.45,
            fontWeight: 560,
          }}
        >
          工程问题、知识规模与协同复杂度同步提升
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 210,
          right: 210,
          top: 492,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        }}
      >
        {RESEARCH_SIGNALS.map((signal, index) => {
          const enter = interpolate(
            frame,
            [70 + index * 56, 104 + index * 56],
            [0, 1],
            {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

          return (
            <div
              key={signal.label}
              style={{
                minHeight: 228,
                boxSizing: "border-box",
                padding: "30px 28px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                borderRadius: 30,
                opacity: enter,
                translate: `0 ${12 * (1 - enter)}px`,
                background:
                  "linear-gradient(145deg, rgba(18,59,98,0.82), rgba(6,22,41,0.92))",
                border: `1px solid ${signal.accent}66`,
                boxShadow: "0 24px 64px rgba(0,0,0,0.24)",
              }}
            >
              <FeatureGlyph
                type={signal.type}
                size={58}
                color={signal.accent}
              />
              <div
                style={{
                  marginTop: 20,
                  fontSize: 34,
                  fontWeight: 780,
                }}
              >
                {signal.label}
              </div>
              <div
                style={{
                  marginTop: 10,
                  color: COLORS.muted,
                  fontSize: 21,
                  lineHeight: 1.4,
                }}
              >
                {signal.detail}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ServicePositioning: React.FC<{
  frame: number;
  durationInFrames: number;
}> = ({ frame, durationInFrames }) => {
  const opacity = fadeWindow(
    frame,
    300,
    350,
    durationInFrames - 24,
    durationInFrames - 1,
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "94px 176px 118px",
          borderRadius: 68,
          border: `2px solid ${COLORS.cyan}66`,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.52), rgba(6,22,41,0.58))",
          boxShadow:
            "0 0 110px rgba(45,212,207,0.11), inset 0 0 90px rgba(45,212,207,0.04)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 170,
          left: 230,
          right: 230,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 29,
            fontWeight: 780,
            letterSpacing: 7,
          }}
        >
          {SERVICE_NAME}
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 74,
            lineHeight: 1.2,
            fontWeight: 800,
          }}
        >
          <div>领域大模型 · 智能体工作流</div>
          <div>可信可控的专业知识服务</div>
        </div>
        <div
          style={{
            marginTop: 24,
            color: COLORS.muted,
            fontSize: 31,
            lineHeight: 1.5,
            fontWeight: 560,
          }}
        >
          面向重大工程技术，连接知识资产与专家判断
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 350,
          right: 350,
          top: 690,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          padding: "22px 26px",
          borderRadius: 28,
          background: "rgba(13,45,77,0.76)",
          border: `1px solid ${COLORS.line}`,
        }}
      >
        {SERVICE_VALUES.map((item) => (
          <div
            key={item.label}
            style={{
              minHeight: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 15,
              color: COLORS.white,
              fontSize: 27,
              fontWeight: 730,
            }}
          >
            <FeatureGlyph type={item.type} size={44} color={item.accent} />
            {item.label}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const SIntroStrategicPositioning: React.FC<{
  durationInFrames: number;
}> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <ResearchContext frame={frame} />
      <ServicePositioning frame={frame} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
