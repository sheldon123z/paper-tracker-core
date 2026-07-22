import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";

export const SceneFrame: React.FC<{
  durationInFrames: number;
  eyebrow: string;
  title: string;
  children: ReactNode;
  showHeader?: boolean;
}> = ({ durationInFrames, eyebrow, title, children, showHeader = true }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT_FAMILY,
        color: COLORS.white,
      }}
    >
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "linear-gradient(118deg, rgba(88,175,255,0.12), rgba(45,212,207,0.03) 44%, transparent 74%)",
          opacity: Math.max(
            interpolate(frame, [0, 14], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            interpolate(
              frame,
              [durationInFrames - 10, durationInFrames - 1],
              [0, 0.18],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          ),
        }}
      />
      {showHeader ? (
        <div
          style={{
            position: "absolute",
            top: 68,
            left: 108,
            right: 108,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            textShadow: "0 3px 20px rgba(0,0,0,0.45)",
            opacity: interpolate(frame, [8, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [8, 28], [18, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          <div
            style={{
              color: COLORS.cyan,
              fontSize: 22,
              letterSpacing: 5.5,
              fontWeight: 650,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              maxWidth: 1540,
              fontSize: 78,
              letterSpacing: 1,
              lineHeight: 1.16,
              fontWeight: 760,
            }}
          >
            {title}
          </div>
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};
