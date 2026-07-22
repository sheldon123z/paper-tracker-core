import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SYSTEM_NAME_LINES } from "../../../shared/brand";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const BrandPatch: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        top: 8,
        width: 244,
        height: 252,
        borderRadius: 22,
        background: "linear-gradient(145deg, #F8FBFF, #EFF6FD)",
        border: "1px solid rgba(121,160,198,0.16)",
        color: "#102B47",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 26px",
        boxShadow: "0 10px 26px rgba(30,74,114,0.08)",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          fontSize: 19,
          lineHeight: 1.45,
          letterSpacing: 1,
          fontWeight: 800,
        }}
      >
        {SYSTEM_NAME_LINES.map((line) => (
          <div key={line} style={{ whiteSpace: "nowrap" }}>
            {line}
          </div>
        ))}
      </div>
      <div
        style={{
          width: 54,
          height: 3,
          borderRadius: 999,
          marginTop: 18,
          background: "linear-gradient(90deg, #3D8EF7, #21BFB8)",
        }}
      />
      <div
        style={{
          marginTop: 15,
          fontSize: 14,
          color: "#5C7893",
          lineHeight: 1.6,
          letterSpacing: 0.7,
        }}
      >
        科研论文知识工作台
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "#8AA0B5",
          letterSpacing: 1.5,
        }}
      >
        RESEARCH KNOWLEDGE WORKSPACE
      </div>
    </div>
  );
};

const RecordingChrome: React.FC<{ label: string }> = ({ label }) => {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 30,
          pointerEvents: "none",
          boxShadow:
            "0 34px 90px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 22,
          top: 20,
          borderRadius: 999,
          padding: "10px 16px",
          background: "rgba(6,22,41,0.76)",
          border: `1px solid ${COLORS.line}`,
          color: COLORS.white,
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          fontWeight: 650,
          letterSpacing: 1.2,
          backdropFilter: "blur(8px)",
        }}
      >
        {label}
      </div>
    </>
  );
};

export const ScreenRecordingFrame: React.FC<{
  src: string;
  label: string;
  trimBeforeSeconds?: number;
  zoomFrom?: number;
  zoomTo?: number;
  objectPosition?: string;
  brandPatch?: boolean;
  segmentDurationInFrames: number;
}> = ({
  src,
  label,
  trimBeforeSeconds = 0,
  zoomFrom = 1,
  zoomTo = 1.025,
  objectPosition = "center center",
  brandPatch = true,
  segmentDurationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        inset: "58px 62px 20px 62px",
        borderRadius: 28,
        overflow: "hidden",
        background: "#EAF2F9",
      }}
    >
      <AbsoluteFill
        style={{
          scale: interpolate(
            frame,
            [0, segmentDurationInFrames],
            [zoomFrom, zoomTo],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.22, 1, 0.36, 1),
            },
          ),
        }}
      >
        <Video
          src={staticFile(src)}
          trimBefore={Math.round(trimBeforeSeconds * fps)}
          muted
          objectFit="cover"
          style={{
            width: "100%",
            height: "100%",
            objectPosition,
            filter: "contrast(1.025) saturate(1.015)",
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(118deg, rgba(88,175,255,0.22), rgba(45,212,207,0.04) 46%, transparent 72%)",
          opacity: interpolate(frame, [0, 14], [0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      {brandPatch ? <BrandPatch /> : null}
      <RecordingChrome label={label} />
    </div>
  );
};

export const StillFrame: React.FC<{
  src: string;
  label: string;
  objectPosition?: string;
  brandPatch?: boolean;
  segmentDurationInFrames: number;
}> = ({
  src,
  label,
  objectPosition = "center center",
  brandPatch = true,
  segmentDurationInFrames,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        inset: "58px 62px 20px 62px",
        borderRadius: 28,
        overflow: "hidden",
        background: "#EAF2F9",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          filter: "contrast(1.025) saturate(1.015)",
          scale: interpolate(frame, [0, segmentDurationInFrames], [1, 1.025], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(118deg, rgba(88,175,255,0.22), rgba(45,212,207,0.04) 46%, transparent 72%)",
          opacity: interpolate(frame, [0, 14], [0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      {brandPatch ? <BrandPatch /> : null}
      <RecordingChrome label={label} />
    </div>
  );
};
