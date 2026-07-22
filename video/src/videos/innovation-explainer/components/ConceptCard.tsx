import type { ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";

export const ConceptCard: React.FC<{
  title: string;
  detail?: string;
  type: GlyphType;
  startFrame?: number;
  timingScale?: number;
  accent?: string;
  compact?: boolean;
  children?: ReactNode;
}> = ({
  title,
  detail,
  type,
  startFrame = 0,
  timingScale = 1,
  accent = COLORS.cyan,
  compact = false,
  children,
}) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        minHeight: compact ? 118 : 164,
        padding: compact ? "18px" : "28px 30px",
        borderRadius: 26,
        background:
          "linear-gradient(145deg, rgba(18,59,98,0.86), rgba(6,22,41,0.86))",
        border: `1px solid ${accent}66`,
        boxShadow: "0 22px 58px rgba(0,0,0,0.26)",
        display: "flex",
        alignItems: "center",
        gap: compact ? 14 : 24,
        fontFamily: FONT_FAMILY,
        opacity: interpolate(frame, [startFrame, startFrame + 22], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0 ${interpolate(
          frame,
          [startFrame, startFrame + 22],
          [24, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px`,
      }}
    >
      <div
        style={{
          width: compact ? 52 : 72,
          height: compact ? 52 : 72,
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}18`,
          border: `1px solid ${accent}55`,
          flex: "0 0 auto",
        }}
      >
        <FeatureGlyph type={type} size={compact ? 36 : 50} color={accent} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: COLORS.white,
            fontSize: compact ? 28 : 34,
            lineHeight: 1.25,
            fontWeight: 720,
          }}
        >
          {title}
        </div>
        {detail ? (
          <div
            style={{
              marginTop: 8,
              color: COLORS.muted,
              fontSize: compact ? 18 : 23,
              lineHeight: compact ? 1.4 : 1.5,
              whiteSpace: compact ? "nowrap" : "normal",
            }}
          >
            {detail}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};
