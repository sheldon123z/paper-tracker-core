import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { SERVICE_NAME } from "../brand";

export const SIntroStrategicPositioning: React.FC<{
  durationInFrames: number;
}> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const panelOpacity = interpolate(
    frame,
    [0, 18, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
        opacity: panelOpacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "108px 210px 132px",
          borderRadius: 62,
          border: `2px solid ${COLORS.cyan}66`,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.54), rgba(6,22,41,0.66))",
          boxShadow:
            "0 0 110px rgba(45,212,207,0.11), inset 0 0 90px rgba(45,212,207,0.04)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 185,
          left: 260,
          right: 260,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 24,
            fontWeight: 740,
            letterSpacing: 7,
            opacity: interpolate(frame, [4, 18], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          MAJOR ENGINEERING · 重大工程技术
        </div>
        <div
          style={{
            marginTop: 35,
            fontSize: 52,
            lineHeight: 1.18,
            fontWeight: 800,
            opacity: interpolate(frame, [18, 45], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [18, 45], [18, 0], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          {SERVICE_NAME}
        </div>
        <div
          style={{
            marginTop: 42,
            color: COLORS.white,
            fontSize: 58,
            lineHeight: 1.45,
            fontWeight: 710,
            opacity: interpolate(frame, [48, 78], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          研究课题正进入更加复杂的新阶段
        </div>
        <div
          style={{
            marginTop: 20,
            color: COLORS.muted,
            fontSize: 29,
            lineHeight: 1.5,
            fontWeight: 620,
            opacity: interpolate(frame, [164, 186], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          资料更庞杂 · 技术迭代节奏更快
        </div>

        <div
          style={{
            margin: "44px auto 0",
            width: 950,
            display: "grid",
            gridTemplateColumns: "1fr 48px 1fr 48px 1fr",
            alignItems: "center",
            opacity: interpolate(frame, [164, 182], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${interpolate(frame, [164, 182], [12, 0], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px)`,
          }}
        >
          {["资料庞杂", "→", "技术迭代加快", "→", "研究复杂度上升"].map(
            (item, index) => {
              const revealStart = 170 + index * 11;
              const reveal = interpolate(
                frame,
                [revealStart, revealStart + 14],
                [0, 1],
                {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );

              return (
                <div
                  key={`${item}-${index}`}
                  style={{
                    color: index % 2 === 0 ? COLORS.white : COLORS.cyan,
                    fontSize: index % 2 === 0 ? 23 : 27,
                    fontWeight: index % 2 === 0 ? 700 : 500,
                    padding: index % 2 === 0 ? "13px 18px" : 0,
                    borderRadius: 999,
                    border:
                      index % 2 === 0 ? `1px solid ${COLORS.line}` : "none",
                    background:
                      index % 2 === 0 ? "rgba(6,22,41,0.72)" : "transparent",
                    opacity: reveal,
                    transform: `translateY(${8 * (1 - reveal)}px)`,
                  }}
                >
                  {item}
                </div>
              );
            },
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
