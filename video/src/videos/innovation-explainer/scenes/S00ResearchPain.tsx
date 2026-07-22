import type { ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { ConceptCard } from "../components/ConceptCard";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const TOPICS = ["电网稳定", "新能源消纳", "运行控制"];

const SCATTERED = [
  { title: "文件夹", detail: "不同目录反复查找", type: "folder" as const },
  { title: "个人笔记", detail: "观点停留在个人", type: "note" as const },
  { title: "对比表格", detail: "信息依靠手工搬运", type: "table" as const },
  { title: "临时报告", detail: "相似任务重新汇总", type: "report" as const },
];

const TASKS: Array<{ label: string; type: GlyphType }> = [
  { label: "查找", type: "folder" },
  { label: "摘录", type: "note" },
  { label: "对比", type: "table" },
  { label: "汇总", type: "report" },
];

const Surface: React.FC<{
  children: ReactNode;
  accent?: string;
  opacity: number;
}> = ({ children, accent = COLORS.line, opacity }) => (
  <div
    style={{
      height: "100%",
      minWidth: 0,
      padding: "24px 26px",
      borderRadius: 28,
      border: `1px solid ${accent}`,
      background:
        "linear-gradient(145deg, rgba(18,59,98,0.82), rgba(6,22,41,0.9))",
      boxShadow: "0 22px 58px rgba(0,0,0,0.24)",
      opacity,
    }}
  >
    {children}
  </div>
);

const PanelHeading: React.FC<{
  eyebrow: string;
  title: string;
  color?: string;
}> = ({ eyebrow, title, color = COLORS.cyan }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <div
      style={{
        width: 10,
        height: 46,
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 24px ${color}66`,
      }}
    />
    <div>
      <div
        style={{
          color,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 2.4,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ marginTop: 4, fontSize: 30, fontWeight: 760 }}>{title}</div>
    </div>
  </div>
);

const DashedConnector: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 0.78], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width="72"
      height="390"
      viewBox="0 0 72 390"
      style={{ opacity }}
      aria-hidden="true"
    >
      {[
        { d: "M 0 92 C 28 92, 43 154, 72 188", color: COLORS.blue },
        { d: "M 0 195 C 28 195, 44 195, 72 195", color: COLORS.amber },
        { d: "M 0 298 C 28 298, 43 236, 72 202", color: COLORS.blue },
      ].map((path) => (
        <path
          key={path.d}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth="3"
          strokeDasharray="8 11"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

export const S00ResearchPain: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const at = (progress: number) => Math.round(durationInFrames * progress);
  const reveal = (start: number, distance = 20) =>
    interpolate(frame, [start, start + distance], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const leftPanelStart = at(0.035);
  const topicBarStart = at(0.21);
  const centerPanelStart = at(0.43);
  const panelRevealFrames = 24;
  const connectorStart = Math.max(
    leftPanelStart + panelRevealFrames,
    centerPanelStart + panelRevealFrames,
  );
  const rightPanelStart = at(0.59);
  const equationStart = at(0.8);
  const panelDim = interpolate(frame, [at(0.78), at(0.84)], [1, 0.58], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const leftPanelOpacity = reveal(leftPanelStart, panelRevealFrames) * panelDim;
  const centerPanelOpacity =
    reveal(centerPanelStart, panelRevealFrames) * panelDim;
  const rightPanelOpacity =
    reveal(rightPanelStart, panelRevealFrames) * panelDim;

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="POWER SYSTEM RESEARCH"
      title="电力科研论文增长，知识为何仍然分散"
    >
      <div
        style={{
          position: "absolute",
          top: 236,
          left: 108,
          right: 108,
          height: 68,
          display: "grid",
          gridTemplateColumns: "300px repeat(3, 1fr)",
          alignItems: "center",
          gap: 14,
          padding: "0 18px",
          borderRadius: 22,
          border: `1px solid ${COLORS.line}`,
          background: "rgba(6,22,41,0.72)",
          fontFamily: FONT_FAMILY,
          opacity: reveal(topicBarStart, 24),
        }}
      >
        <div style={{ color: COLORS.muted, fontSize: 21, fontWeight: 680 }}>
          研究方向持续扩展
        </div>
        {TOPICS.map((topic, index) => (
          <div
            key={topic}
            style={{
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderRadius: 14,
              color: COLORS.white,
              background: `${index === 1 ? COLORS.amber : COLORS.cyan}12`,
              border: `1px solid ${index === 1 ? COLORS.amber : COLORS.cyan}55`,
              fontSize: 23,
              fontWeight: 710,
            }}
          >
            <span style={{ color: index === 1 ? COLORS.amber : COLORS.cyan }}>
              ●
            </span>
            {topic}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: 328,
          left: 108,
          right: 108,
          height: 390,
          display: "grid",
          gridTemplateColumns: "420px 72px 480px 72px 1fr",
          alignItems: "stretch",
          gap: 18,
          fontFamily: FONT_FAMILY,
        }}
      >
        <Surface opacity={leftPanelOpacity}>
          <PanelHeading eyebrow="PAPER GROWTH" title="论文持续增长" />
          <div
            style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            {Array.from({ length: 6 }, (_, index) => {
              return (
                <div
                  key={index}
                  style={{
                    height: 100,
                    borderRadius: 18,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    color: COLORS.white,
                    background: "rgba(244,248,255,0.075)",
                    border: `1px solid ${COLORS.blue}55`,
                  }}
                >
                  <FeatureGlyph type="document" size={38} color={COLORS.blue} />
                  <span style={{ fontSize: 16, fontWeight: 780 }}>
                    论文 {index + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: COLORS.muted,
              fontSize: 18,
            }}
          >
            <span>数量持续增加</span>
            <span style={{ color: COLORS.cyan, fontSize: 24, fontWeight: 800 }}>
              ↑
            </span>
          </div>
        </Surface>

        <DashedConnector startFrame={connectorStart} />

        <Surface opacity={centerPanelOpacity} accent={`${COLORS.amber}66`}>
          <PanelHeading
            eyebrow="REPETITIVE WORK"
            title="科研人员反复处理"
            color={COLORS.amber}
          />
          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "112px 1fr",
              gap: 20,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 112,
                height: 112,
                borderRadius: "50%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(13,45,77,0.92)",
                border: `1px solid ${COLORS.amber}66`,
              }}
            >
              <FeatureGlyph type="person" size={54} color={COLORS.white} />
              <span style={{ marginTop: 4, fontSize: 16, fontWeight: 720 }}>
                科研人员
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {TASKS.map((task) => (
                <div
                  key={task.label}
                  style={{
                    height: 78,
                    borderRadius: 17,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    background: `${COLORS.amber}0d`,
                    border: `1px solid ${COLORS.amber}44`,
                    color: COLORS.white,
                    fontSize: 21,
                    fontWeight: 720,
                  }}
                >
                  <FeatureGlyph
                    type={task.type}
                    size={32}
                    color={COLORS.amber}
                  />
                  {task.label}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: 20,
              color: COLORS.muted,
              fontSize: 18,
              textAlign: "center",
            }}
          >
            同类任务仍要从头整理
          </div>
        </Surface>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.rose,
            fontSize: 62,
            fontWeight: 300,
            opacity: reveal(rightPanelStart, 24) * panelDim,
          }}
        >
          →
        </div>

        <Surface opacity={rightPanelOpacity} accent={`${COLORS.rose}66`}>
          <PanelHeading
            eyebrow="KNOWLEDGE SILOS"
            title="成果仍散落在个人工具"
            color={COLORS.rose}
          />
          <div
            style={{
              marginTop: 20,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            {SCATTERED.map((item, index) => (
              <ConceptCard
                key={item.title}
                title={item.title}
                detail={item.detail}
                type={item.type}
                startFrame={0}
                accent={index === 2 ? COLORS.amber : COLORS.rose}
                compact
              />
            ))}
          </div>
        </Surface>
      </div>

      <div
        style={{
          position: "absolute",
          left: 280,
          right: 280,
          bottom: 176,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          padding: "18px 34px",
          borderRadius: 24,
          border: `1px solid ${COLORS.cyan}55`,
          background: "rgba(6,22,41,0.94)",
          boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
          fontFamily: FONT_FAMILY,
          opacity: reveal(equationStart, 30),
        }}
      >
        <span style={{ color: COLORS.white, fontSize: 54, fontWeight: 760 }}>
          资料积累
        </span>
        <span style={{ color: COLORS.rose, fontSize: 76, fontWeight: 800 }}>
          ≠
        </span>
        <span style={{ color: COLORS.cyan, fontSize: 54, fontWeight: 760 }}>
          知识积累
        </span>
      </div>
    </SceneFrame>
  );
};
