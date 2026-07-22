import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

const PARTICLES = [
  [118, 164, 3],
  [248, 762, 2],
  [356, 274, 2],
  [512, 912, 3],
  [686, 142, 2],
  [804, 690, 2],
  [1010, 244, 3],
  [1192, 884, 2],
  [1368, 188, 2],
  [1490, 642, 3],
  [1664, 316, 2],
  [1818, 822, 2],
] as const;

export const AmbientBackground: React.FC<{
  durationInFrames: number;
}> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 72% 20%, rgba(45,212,207,0.10), transparent 28%), radial-gradient(circle at 18% 78%, rgba(88,175,255,0.12), transparent 32%), linear-gradient(135deg, #061629 0%, #0A2442 58%, #061629 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.3,
          backgroundImage:
            "linear-gradient(rgba(130,186,235,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(130,186,235,0.08) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          translate: `${interpolate(
            frame,
            [0, durationInFrames],
            [0, -48],
          )}px ${interpolate(frame, [0, durationInFrames], [0, -24])}px`,
        }}
      />
      {PARTICLES.map(([x, y, size], index) => (
        <div
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: size * 2,
            height: size * 2,
            borderRadius: "50%",
            background: index % 3 === 0 ? COLORS.cyan : COLORS.blue,
            opacity: interpolate(
              (frame + index * 23) % 120,
              [0, 60, 120],
              [0.16, 0.52, 0.16],
            ),
            boxShadow: `0 0 ${size * 8}px currentColor`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
