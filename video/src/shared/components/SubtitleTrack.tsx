import type { Caption } from "@remotion/captions";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";

const SubtitleCard: React.FC<{
  text: string;
  durationInFrames: number;
  fadeIn: boolean;
  fadeOut: boolean;
}> = ({ text, durationInFrames, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const fadeInOpacity = fadeIn
    ? interpolate(frame, [0, 5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;
  const fadeOutOpacity = fadeOut
    ? interpolate(
        frame,
        [Math.max(0, durationInFrames - 6), durationInFrames - 1],
        [1, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        },
      )
    : 1;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          maxWidth: 1530,
          marginBottom: 52,
          padding: "16px 38px 19px",
          borderRadius: 18,
          background: "rgba(6,22,41,0.91)",
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 16px 42px rgba(0,0,0,0.35)",
          color: COLORS.white,
          fontFamily: FONT_FAMILY,
          fontSize: 46,
          lineHeight: 1.38,
          fontWeight: 620,
          letterSpacing: 0.5,
          textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          opacity: Math.min(fadeInOpacity, fadeOutOpacity),
          translate: `0 ${
            fadeIn
              ? interpolate(frame, [0, 6], [8, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : 0
          }px`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const SubtitleTrack: React.FC<{
  captions: readonly Caption[];
}> = ({ captions }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ zIndex: 80, pointerEvents: "none" }}>
      {captions.map((caption, index) => {
        const from = Math.round((caption.startMs / 1000) * fps);
        const endFrame = Math.round((caption.endMs / 1000) * fps);
        const durationInFrames = Math.max(1, endFrame - from);
        const previous = captions[index - 1];
        const next = captions[index + 1];
        const fadeIn = !previous || caption.startMs - previous.endMs > 250;
        const fadeOut = !next || next.startMs - caption.endMs > 250;

        return (
          <Sequence
            key={`${caption.startMs}-${index}`}
            from={from}
            durationInFrames={durationInFrames}
            premountFor={fps}
          >
            <SubtitleCard
              text={caption.text}
              durationInFrames={durationInFrames}
              fadeIn={fadeIn}
              fadeOut={fadeOut}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
