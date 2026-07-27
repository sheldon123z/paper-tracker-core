import { Easing, interpolate, useCurrentFrame } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { captionStart, getSceneCues } from "../data/cues";

const NODES: { label: string; type: GlyphType }[] = [
  { label: "论文", type: "document" },
  { label: "知识库", type: "library" },
  { label: "本地分析", type: "model" },
  { label: "研究成果", type: "report" },
];

export const S07Closing: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-07", durationInFrames);
  const platformStart = captionStart(cues, 0);
  const knowledgeStart = captionStart(cues, 1);
  const outcomeStart = captionStart(cues, 2);
  const nodeStarts = [
    platformStart + 8,
    knowledgeStart,
    outcomeStart,
    outcomeStart + 22,
  ];

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow={SYSTEM_NAME}
      title="让科研知识持续积累与复用"
      showHeader={false}
    >
      <div
        style={{
          position: "absolute",
          left: 310,
          top: 154,
          width: 1300,
          height: 660,
          borderRadius: "50%",
          border: `2px solid ${COLORS.cyan}`,
          opacity: interpolate(frame, [0, 70], [0.12, 0.68], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 70], [1.12, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          boxShadow:
            "0 0 100px rgba(45,212,207,0.14), inset 0 0 90px rgba(45,212,207,0.05)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 194,
          left: 460,
          right: 460,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: FONT_FAMILY,
        }}
      >
        {NODES.map((node, index) => (
          <div
            key={node.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              color: COLORS.muted,
              opacity: interpolate(
                frame,
                [nodeStarts[index], nodeStarts[index] + 24],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            <FeatureGlyph type={node.type} size={50} />
            <div style={{ fontSize: 19 }}>{node.label}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: "400px 180px auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          opacity: interpolate(frame, [20, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [20, 54], [22, 0], {
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
            fontWeight: 700,
          }}
        >
          {SYSTEM_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            color: COLORS.white,
            fontSize: 96,
            lineHeight: 1.18,
            fontWeight: 760,
          }}
        >
          让科研知识持续积累与复用
        </div>
        <div
          style={{
            marginTop: 30,
            color: COLORS.muted,
            fontSize: 40,
            lineHeight: 1.5,
          }}
        >
          本地离线运行 · 分级知识管理 · 本地智能分析 · 研究成果输出
        </div>
      </div>
    </SceneFrame>
  );
};
