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

const DEFAULT_SINGLE_LINE_LIMIT = 31;
const MIN_BALANCED_LINE_UNITS = 8;
const BREAK_PUNCTUATION = new Set([
  "，",
  "。",
  "；",
  "：",
  "、",
  "？",
  "！",
  ",",
  ".",
  ";",
  ":",
  "?",
  "!",
]);

const characterWidthUnits = (character: string) => {
  if (/\s/u.test(character)) {
    return 0.32;
  }
  return (character.codePointAt(0) ?? 0) <= 0xff ? 0.58 : 1;
};

const subtitleWidthUnits = (text: string) =>
  Array.from(text).reduce(
    (total, character) => total + characterWidthUnits(character),
    0,
  );

const splitBalancedSubtitle = (text: string, singleLineLimitUnits: number) => {
  const normalized = text.trim();
  if (subtitleWidthUnits(normalized) <= singleLineLimitUnits) {
    return [normalized];
  }

  const characters = Array.from(normalized);
  let best:
    | {
        left: string;
        right: string;
        score: number;
      }
    | undefined;

  for (let index = 1; index < characters.length; index += 1) {
    const left = characters.slice(0, index).join("").trimEnd();
    const right = characters.slice(index).join("").trimStart();
    const leftUnits = subtitleWidthUnits(left);
    const rightUnits = subtitleWidthUnits(right);
    if (
      leftUnits < MIN_BALANCED_LINE_UNITS ||
      rightUnits < MIN_BALANCED_LINE_UNITS
    ) {
      continue;
    }

    const previous = characters[index - 1];
    const next = characters[index];
    const isPunctuationBreak = BREAK_PUNCTUATION.has(previous);
    const isWhitespaceBreak = /\s/u.test(previous) || /\s/u.test(next);
    const startsWithPunctuation = BREAK_PUNCTUATION.has(
      Array.from(right)[0] ?? "",
    );
    const overflowPenalty =
      Math.max(0, Math.max(leftUnits, rightUnits) - singleLineLimitUnits) * 10;
    const boundaryPenalty = isPunctuationBreak ? 0 : isWhitespaceBreak ? 3 : 12;
    const score =
      Math.abs(leftUnits - rightUnits) +
      boundaryPenalty +
      overflowPenalty +
      (startsWithPunctuation ? 30 : 0);

    if (!best || score < best.score) {
      best = { left, right, score };
    }
  }

  if (best) {
    return [best.left, best.right];
  }

  return [normalized];
};

const SubtitleCard: React.FC<{
  text: string;
  durationInFrames: number;
  fadeIn: boolean;
  fadeOut: boolean;
  singleLineLimitUnits: number;
}> = ({ text, durationInFrames, fadeIn, fadeOut, singleLineLimitUnits }) => {
  const frame = useCurrentFrame();
  const lines = splitBalancedSubtitle(text, singleLineLimitUnits);
  const longestLineUnits = Math.max(...lines.map(subtitleWidthUnits), 1);
  const fontSize = Math.max(
    40,
    Math.min(46, Math.floor(1540 / longestLineUnits)),
  );
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
          maxWidth: 1710,
          boxSizing: "border-box",
          marginBottom: 52,
          padding: "16px 38px 19px",
          borderRadius: 18,
          background: "rgba(6,22,41,0.91)",
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 16px 42px rgba(0,0,0,0.35)",
          color: COLORS.white,
          fontFamily: FONT_FAMILY,
          fontSize,
          lineHeight: lines.length > 1 ? 1.28 : 1.38,
          fontWeight: 620,
          letterSpacing: 0.5,
          textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          opacity: Math.min(fadeInOpacity, fadeOutOpacity),
        }}
      >
        {lines.map((line) => (
          <div
            key={line}
            style={{
              whiteSpace: "nowrap",
              wordBreak: "keep-all",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const SubtitleTrack: React.FC<{
  captions: readonly Caption[];
  cornerBadge?: string;
  singleLineLimitUnits?: number;
}> = ({
  captions,
  cornerBadge,
  singleLineLimitUnits = DEFAULT_SINGLE_LINE_LIMIT,
}) => {
  const { durationInFrames: compositionDuration, fps } = useVideoConfig();

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
              singleLineLimitUnits={singleLineLimitUnits}
            />
          </Sequence>
        );
      })}
      {cornerBadge ? (
        <Sequence
          durationInFrames={compositionDuration}
          premountFor={fps}
          style={{ zIndex: 999 }}
        >
          <div
            style={{
              position: "absolute",
              top: 46,
              right: 58,
              padding: "10px 18px",
              borderRadius: 999,
              color: "#FFF7E8",
              background: "rgba(132,74,12,0.9)",
              border: "1px solid rgba(255,193,92,0.72)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
              fontFamily: FONT_FAMILY,
              fontSize: 20,
              fontWeight: 720,
              letterSpacing: 1.2,
            }}
          >
            {cornerBadge}
          </div>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
