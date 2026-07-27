import { Video } from "@remotion/media";
import { Easing, Img, interpolate, staticFile, useVideoConfig } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const REFERENCE_DURATION_IN_FRAMES = 20 * 30;

const PROCESS_STEPS = [
  {
    number: "01",
    eyebrow: "LOCAL PARSING",
    title: "本地解析",
    detail: "正文提取 · OCR · 结构化信息",
    type: "document" as GlyphType,
    accent: COLORS.blue,
    enterAt: 8,
    focusWindow: [14, 36, 112, 140] as const,
  },
  {
    number: "02",
    eyebrow: "REVIEW & DEDUPLICATION",
    title: "复核与多重去重",
    detail: "关键信息复核 · 指纹与标识联合判断",
    type: "evidence" as GlyphType,
    accent: COLORS.cyan,
    enterAt: 102,
    focusWindow: [118, 142, 232, 258] as const,
  },
] as const;

const phaseOpacity = (
  frame: number,
  start: number,
  fadeInEnd: number,
  fadeOutStart: number,
  end: number,
) =>
  interpolate(frame, [start, fadeInEnd, fadeOutStart, end], [0, 1, 1, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ProcessCard: React.FC<{
  step: (typeof PROCESS_STEPS)[number];
  frame: number;
}> = ({ step, frame }) => {
  const enter = interpolate(frame, [step.enterAt, step.enterAt + 28], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const focus = interpolate(frame, step.focusWindow, [0.24, 1, 1, 0.24], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        minHeight: 168,
        boxSizing: "border-box",
        padding: "20px 22px",
        display: "grid",
        gridTemplateColumns: "68px 1fr",
        gap: 18,
        alignItems: "center",
        borderRadius: 28,
        opacity: enter,
        translate: `0 ${10 * (1 - enter) - 5 * focus}px`,
        color: COLORS.white,
        background:
          focus > 0.55
            ? "linear-gradient(145deg, #123f69, #0a2d4d)"
            : "linear-gradient(145deg, #0a2a49, #071f38)",
        border: `1px solid ${focus > 0.55 ? step.accent : "rgba(130,186,235,0.28)"}`,
        boxShadow:
          focus > 0.55
            ? `0 22px 58px ${step.accent}1f`
            : "0 16px 42px rgba(0,0,0,0.2)",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 22,
          background: `${step.accent}14`,
          border: `1px solid ${step.accent}66`,
        }}
      >
        <FeatureGlyph type={step.type} size={42} color={step.accent} />
      </div>
      <div>
        <div
          style={{
            color: step.accent,
            fontSize: 15,
            fontWeight: 790,
            letterSpacing: 2.1,
          }}
        >
          {step.number} · {step.eyebrow}
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 28,
            lineHeight: 1.2,
            fontWeight: 810,
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            marginTop: 9,
            color: COLORS.muted,
            fontSize: 18,
            lineHeight: 1.5,
          }}
        >
          {step.detail}
        </div>
      </div>
    </div>
  );
};

const ImportEvidence: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const reviewOpacity = interpolate(frame, [132, 168], [0, 1], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        overflow: "hidden",
        borderRadius: 24,
        background: "#dce7f1",
        border: "1px solid rgba(130,186,235,0.36)",
        boxShadow: "0 20px 54px rgba(0,0,0,0.24)",
      }}
    >
      <Video
        src={staticFile("shared/recordings/03-import-analyzing.mp4")}
        trimBefore={Math.round(21.8 * fps)}
        playbackRate={0.24}
        muted
        objectFit="cover"
        style={{
          width: "100%",
          height: "100%",
          objectPosition: "50% 32%",
          scale: 1.12,
          filter: "contrast(1.03) saturate(0.94)",
        }}
      />
      <Video
        src={staticFile("shared/recordings/04-import-review.mp4")}
        trimBefore={Math.round(41.5 * fps)}
        playbackRate={0.22}
        muted
        objectFit="cover"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectPosition: "50% 32%",
          scale: 1.12,
          opacity: reviewOpacity,
          filter: "contrast(1.03) saturate(0.94)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 18,
          top: 18,
          padding: "9px 14px",
          borderRadius: 999,
          color: COLORS.white,
          background: "rgba(6,22,41,0.90)",
          border: `1px solid ${COLORS.cyan}88`,
          fontSize: 16,
          fontWeight: 760,
        }}
      >
        真实系统页面 · {reviewOpacity > 0.5 ? "去重与复核" : "本地解析 / OCR"}
      </div>

      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {["解析进度", "OCR 状态", "去重结果"].map((label, index) => (
          <div
            key={label}
            style={{
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 13,
              color:
                index === (reviewOpacity > 0.5 ? 2 : 1)
                  ? COLORS.cyan
                  : COLORS.white,
              background: "rgba(6,22,41,0.90)",
              border: `1px solid ${
                index === (reviewOpacity > 0.5 ? 2 : 1)
                  ? COLORS.cyan
                  : COLORS.line
              }`,
              fontSize: 16,
              fontWeight: 720,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

const ProcessSchematic: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = phaseOpacity(frame, 0, 22, 244, 270);
  const arrowOpacity = interpolate(frame, [112, 142], [0.25, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 150,
        right: 150,
        top: 232,
        bottom: 252,
        boxSizing: "border-box",
        padding: "28px 34px 30px",
        overflow: "hidden",
        borderRadius: 32,
        opacity,
        color: COLORS.white,
        background: "linear-gradient(145deg, #0b2d4e, #071d35)",
        border: "1px solid rgba(130,186,235,0.34)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.cyan,
              fontSize: 18,
              fontWeight: 790,
              letterSpacing: 3.2,
            }}
          >
            PROCESS SCHEMATIC · 流程示意
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 31,
              lineHeight: 1.25,
              fontWeight: 800,
            }}
          >
            从原始 PDF 到可复核的结构化论文记录
          </div>
        </div>
        <div
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            color: COLORS.muted,
            background: "rgba(6,22,41,0.72)",
            border: `1px solid ${COLORS.line}`,
            fontSize: 18,
            fontWeight: 680,
          }}
        >
          本地完成
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          height: 382,
          display: "grid",
          gridTemplateColumns: "500px 1fr",
          gap: 20,
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <ProcessCard step={PROCESS_STEPS[0]} frame={frame} />
          <div
            style={{
              position: "absolute",
              left: 282,
              top: 306,
              color: COLORS.cyan,
              fontSize: 34,
              opacity: arrowOpacity,
            }}
          >
            ↓
          </div>
          <ProcessCard step={PROCESS_STEPS[1]} frame={frame} />
        </div>
        <ImportEvidence frame={frame} />
      </div>
    </div>
  );
};

const LibraryEvidence: React.FC<{
  frame: number;
  src: string;
  title: string;
  detail: string;
  scope: string;
  start: number;
  fadeInEnd: number;
  fadeOutStart: number;
  end: number;
}> = ({
  frame,
  src,
  title,
  detail,
  scope,
  start,
  fadeInEnd,
  fadeOutStart,
  end,
}) => {
  const opacity = phaseOpacity(frame, start, fadeInEnd, fadeOutStart, end);
  const enter = interpolate(frame, [start, fadeInEnd + 8], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 150,
        right: 150,
        top: 232,
        bottom: 252,
        overflow: "hidden",
        borderRadius: 32,
        opacity,
        translate: `0 ${8 * (1 - enter)}px`,
        background: "#0a2947",
        border: "1px solid rgba(130,186,235,0.34)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          height: 82,
          boxSizing: "border-box",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: COLORS.white,
          background: "linear-gradient(90deg, #0b3154, #0a2947)",
          borderBottom: "1px solid rgba(130,186,235,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              color: COLORS.cyan,
              background: COLORS.cyanSoft,
              border: "1px solid rgba(45,212,207,0.48)",
              fontSize: 17,
              fontWeight: 780,
              letterSpacing: 1.6,
            }}
          >
            真实系统页面
          </div>
          <div style={{ fontSize: 30, fontWeight: 810 }}>{title}</div>
          <div style={{ color: COLORS.muted, fontSize: 20 }}>{detail}</div>
        </div>
        <div
          style={{
            padding: "9px 16px",
            borderRadius: 999,
            color: COLORS.white,
            background: "rgba(6,22,41,0.72)",
            border: `1px solid ${COLORS.line}`,
            fontSize: 18,
            fontWeight: 720,
          }}
        >
          {scope}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 82,
          bottom: 0,
          overflow: "hidden",
          background: "#eaf2f9",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "87% 34%",
            scale: 1.23,
            filter: "contrast(1.035) saturate(1.02)",
          }}
        />

        {/* Keep only the legacy branding/account details out of the evidence pane. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "15.5%",
            background:
              "linear-gradient(90deg, #edf5fb 0%, #edf5fb 86%, #e8f2f9 100%)",
            borderRight: "1px solid rgba(121,160,198,0.14)",
          }}
        />
      </div>
    </div>
  );
};

export const S02KnowledgeAssets: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame } = useScaledSceneFrame(
    durationInFrames,
    REFERENCE_DURATION_IN_FRAMES,
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="03 · DOMAIN KNOWLEDGE ASSET"
      title="一次整理，沉淀电力科研知识资产"
    >
      <ProcessSchematic frame={frame} />
      <LibraryEvidence
        frame={frame}
        src="shared/stills/public-library.png"
        title="公共论文库"
        detail="可共享资料按授权范围复用"
        scope="公共范围"
        start={246}
        fadeInEnd={270}
        fadeOutStart={408}
        end={432}
      />
      <LibraryEvidence
        frame={frame}
        src="shared/stills/department-library.png"
        title="部门私有论文库"
        detail="部门资料在授权边界内持续积累"
        scope="部门范围"
        start={408}
        fadeInEnd={432}
        fadeOutStart={586}
        end={600}
      />
    </SceneFrame>
  );
};
