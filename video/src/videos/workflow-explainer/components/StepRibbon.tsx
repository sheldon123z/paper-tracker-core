import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

export const StepRibbon: React.FC<{
  labels: string[];
  current: number;
}> = ({ labels, current }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        top: 76,
        left: 0,
        right: 0,
        zIndex: 35,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        opacity: interpolate(frame, [5, 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0 ${interpolate(frame, [5, 20], [-12, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}px`,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(6,22,41,0.82)",
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
          backdropFilter: "blur(10px)",
        }}
      >
        {labels.map((label, index) => (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                minWidth: 138,
                padding: "11px 20px",
                borderRadius: 999,
                textAlign: "center",
                color: index === current ? COLORS.white : COLORS.muted,
                background:
                  index === current
                    ? "linear-gradient(135deg, rgba(88,175,255,0.45), rgba(45,212,207,0.35))"
                    : "transparent",
                fontSize: 24,
                fontWeight: index === current ? 720 : 520,
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
            {index < labels.length - 1 ? (
              <div
                style={{
                  width: 24,
                  height: 1,
                  background: index < current ? COLORS.cyan : COLORS.line,
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
