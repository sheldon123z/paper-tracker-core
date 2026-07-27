import { interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenRecordingFrame } from "../components/ScreenRecordingFrame";
import { captionStart, getSceneCues, makeEntranceRange } from "../data/cues";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const ITEMS: { title: string; detail: string; type: GlyphType }[] = [
  { title: "部门与账号", detail: "组织边界清晰", type: "library" },
  { title: "会话与审计", detail: "过程留痕可查", type: "governance" },
  { title: "使用统计", detail: "运行情况可见", type: "report" },
];

export const S06Governance: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const cues = getSceneCues("scene-06", durationInFrames);
  const animationDuration = Math.max(1, Math.round(durationInFrames * 0.057));
  const firstCaptionStart = captionStart(cues, 0);
  const secondCaptionStart = captionStart(cues, 1);
  const cardStartFrames = [
    firstCaptionStart,
    Math.round(
      firstCaptionStart + (secondCaptionStart - firstCaptionStart) / 2,
    ),
    secondCaptionStart,
  ];
  const itemEntranceRanges = ITEMS.map((_, index) =>
    makeEntranceRange(
      cardStartFrames[index],
      durationInFrames,
      animationDuration,
    ),
  );
  const badgeEntranceRange = makeEntranceRange(
    captionStart(cues, 2),
    durationInFrames,
    Math.max(1, Math.round(durationInFrames * 0.095)),
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="06 · GOVERNANCE"
      title="组织化管理与全程追溯"
      showHeader={false}
    >
      <ScreenRecordingFrame
        src="shared/recordings/15-access-control.mp4"
        trimBeforeSeconds={7}
        label="权限与会话管理"
        segmentDurationInFrames={durationInFrames}
        zoomTo={1.035}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 45,
          left: 116,
          right: 116,
          top: 164,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
          fontFamily: FONT_FAMILY,
        }}
      >
        {ITEMS.map((item, index) => (
          <div
            key={item.title}
            style={{
              minHeight: 150,
              padding: "24px 30px",
              borderRadius: 24,
              background: "rgba(6,22,41,0.88)",
              border: `1px solid ${index === 1 ? COLORS.cyan : COLORS.line}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              gap: 24,
              opacity: interpolate(frame, itemEntranceRanges[index], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `0 ${interpolate(
                frame,
                itemEntranceRanges[index],
                [24, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px`,
            }}
          >
            <FeatureGlyph type={item.type} size={54} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 720 }}>{item.title}</div>
              <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 19 }}>
                {item.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 46,
          right: 122,
          bottom: 190,
          padding: "18px 26px",
          borderRadius: 999,
          background:
            "linear-gradient(135deg, rgba(88,175,255,0.40), rgba(45,212,207,0.35))",
          border: `1px solid ${COLORS.cyan}`,
          color: COLORS.white,
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 720,
          letterSpacing: 2,
          opacity: interpolate(frame, badgeEntranceRange, [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        可管理 · 可查询 · 可追溯
      </div>
    </SceneFrame>
  );
};
