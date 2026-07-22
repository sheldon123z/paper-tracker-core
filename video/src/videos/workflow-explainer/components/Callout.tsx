import { Easing, interpolate, useCurrentFrame } from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

export const Callout: React.FC<{
  title: string;
  detail?: string;
  align?: "left" | "right";
  enterAt?: number;
}> = ({ title, detail, align = "right", enterAt = 0 }) => {
  const frame = useCurrentFrame();
  const entranceFrame = frame - enterAt;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 42,
        top: 168,
        [align]: 94,
        width: 360,
        padding: "20px 24px",
        borderRadius: 22,
        background: "rgba(6,22,41,0.86)",
        border: `1px solid ${COLORS.line}`,
        boxShadow: "0 18px 48px rgba(0,0,0,0.32)",
        backdropFilter: "blur(12px)",
        fontFamily: FONT_FAMILY,
        opacity: interpolate(entranceFrame, [0, 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: `${interpolate(
          entranceFrame,
          [0, 15],
          [align === "right" ? 26 : -26, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px 0`,
      }}
    >
      <div
        style={{
          color: COLORS.cyan,
          fontSize: 15,
          letterSpacing: 3,
          marginBottom: 10,
          fontWeight: 700,
        }}
      >
        {SYSTEM_NAME}
      </div>
      <div
        style={{
          color: COLORS.white,
          fontSize: 34,
          lineHeight: 1.25,
          fontWeight: 720,
        }}
      >
        {title}
      </div>
      {detail ? (
        <div
          style={{
            color: COLORS.muted,
            fontSize: 19,
            lineHeight: 1.5,
            marginTop: 12,
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
};
