import { Video } from "@remotion/media";
import type { CSSProperties } from "react";
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SYSTEM_NAME } from "../../../shared/brand";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const EvidenceBrandPatch: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 40,
        width: 350,
        height: 135,
        boxSizing: "border-box",
        padding: "58px 24px 16px",
        borderRadius: "0 0 22px 0",
        background:
          "linear-gradient(145deg, rgba(248,251,255,0.99), rgba(232,244,253,0.99))",
        borderRight: "1px solid rgba(121,160,198,0.18)",
        borderBottom: "1px solid rgba(121,160,198,0.18)",
        color: "#102B47",
        fontFamily: FONT_FAMILY,
        fontSize: 18,
        lineHeight: 1.35,
        fontWeight: 800,
        letterSpacing: 0.6,
        whiteSpace: "nowrap",
        boxShadow: "0 10px 26px rgba(30,74,114,0.08)",
      }}
    >
      {SYSTEM_NAME}
    </div>
  );
};

export const ScreenEvidenceFrame: React.FC<{
  src: string;
  label: string;
  kind?: "image" | "video";
  durationInFrames: number;
  trimBeforeSeconds?: number;
  mediaScale?: number;
  mediaX?: number;
  mediaY?: number;
  objectPosition?: string;
  brandPatch?: boolean;
  style?: CSSProperties;
}> = ({
  src,
  label,
  kind = "image",
  durationInFrames,
  trimBeforeSeconds = 0,
  mediaScale = 1,
  mediaX = 0,
  mediaY = 0,
  objectPosition = "center center",
  brandPatch = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mediaStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition,
    scale: mediaScale,
    translate: `${mediaX}px ${mediaY}px`,
    filter: "contrast(1.025) saturate(1.015)",
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 32,
        background: "#EAF2F9",
        border: `1px solid ${COLORS.line}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
        opacity: interpolate(
          frame,
          [0, 18, durationInFrames - 14, durationInFrames - 1],
          [0, 1, 1, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        ),
        scale: interpolate(frame, [0, durationInFrames], [0.985, 1.025], {
          easing: Easing.bezier(0.45, 0, 0.55, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        ...style,
      }}
    >
      {kind === "video" ? (
        <Video
          src={staticFile(src)}
          trimBefore={Math.round(trimBeforeSeconds * fps)}
          muted
          style={mediaStyle}
        />
      ) : (
        <Img src={staticFile(src)} style={mediaStyle} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(135deg, rgba(88,175,255,0.18), transparent 30%, transparent 74%, rgba(45,212,207,0.10))",
        }}
      />
      {brandPatch ? <EvidenceBrandPatch /> : null}
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 22,
          padding: "11px 18px",
          borderRadius: 999,
          background: "rgba(6,22,41,0.86)",
          border: `1px solid ${COLORS.line}`,
          color: COLORS.white,
          fontFamily: FONT_FAMILY,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 1.2,
          boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
        }}
      >
        {label}
      </div>
    </div>
  );
};
