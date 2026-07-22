import { Easing, interpolate, Sequence } from "remotion";
import { FeatureGlyph } from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { ScreenEvidenceFrame } from "../components/ScreenEvidenceFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const PAPER_NODES = [
  ["频率稳定", 250, 320],
  ["新能源消纳", 350, 575],
  ["协同控制", 650, 675],
  ["源网荷储", 1180, 665],
  ["运行优化", 1430, 500],
  ["安全约束", 1380, 290],
] as const;

const ResearchQuestionNode: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 785,
      top: 338,
      width: 350,
      height: 250,
      borderRadius: "50%",
      background:
        "radial-gradient(circle, rgba(45,212,207,0.26), rgba(13,45,77,0.82) 62%)",
      border: `2px solid ${COLORS.cyan}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      fontFamily: FONT_FAMILY,
      boxShadow: "0 0 80px rgba(45,212,207,0.16)",
    }}
  >
    <FeatureGlyph type="question" size={70} color={COLORS.cyan} />
    <div
      style={{
        marginTop: 12,
        color: COLORS.white,
        fontSize: 31,
        fontWeight: 760,
      }}
    >
      高比例新能源接入
    </div>
    <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 20 }}>
      频率稳定 · 协同控制 · 工程约束
    </div>
  </div>
);

export const S03EvidenceSynthesis: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, scaleFrame } = useScaledSceneFrame(durationInFrames, 960);
  const problemOpacity = interpolate(frame, [12, 30, 160, 180], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const traditionalOpacity = interpolate(
    frame,
    [165, 185, 285, 315],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const networkOpacity = interpolate(
    frame,
    [305, 340, 700, 730],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="03 · EVIDENCE SYNTHESIS"
      title="围绕电力科研问题，组织跨文献证据"
    >
      <div style={{ opacity: problemOpacity }}>
        <ResearchQuestionNode />
      </div>
      <div
        style={{
          position: "absolute",
          top: 258,
          left: 120,
          right: 120,
          height: 500,
          opacity: traditionalOpacity,
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
          }}
        >
          {["搜索", "逐篇打开", "人工摘录", "维护对比表", "重新汇总"].map(
            (label, index) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 20 }}
              >
                <div
                  style={{
                    width: 245,
                    minHeight: 210,
                    borderRadius: 26,
                    background: "rgba(13,45,77,0.78)",
                    border: `1px solid ${index >= 2 ? COLORS.amber + "66" : COLORS.line}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 18,
                    opacity: interpolate(
                      frame,
                      [175 + index * 16, 199 + index * 16],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      },
                    ),
                  }}
                >
                  <FeatureGlyph
                    type={
                      index === 0
                        ? "question"
                        : index === 3
                          ? "table"
                          : "document"
                    }
                    size={62}
                    color={index >= 2 ? COLORS.amber : COLORS.dim}
                  />
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{label}</div>
                </div>
                {index < 4 ? (
                  <span
                    style={{
                      color: COLORS.amber,
                      fontSize: 34,
                      opacity: interpolate(
                        frame,
                        [183 + (index + 1) * 16, 199 + (index + 1) * 16],
                        [0, 1],
                        {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        },
                      ),
                    }}
                  >
                    →
                  </span>
                ) : null}
              </div>
            ),
          )}
        </div>
        <div
          style={{
            marginTop: 50,
            textAlign: "center",
            color: COLORS.amber,
            fontSize: 34,
            fontWeight: 720,
          }}
        >
          大量时间消耗在查找、摘录与信息搬运
        </div>
      </div>

      <div style={{ opacity: networkOpacity }}>
        <ResearchQuestionNode />

        <div
          style={{
            position: "absolute",
            left: 600,
            top: 250,
            width: 720,
            height: 440,
            borderRadius: "50%",
            border: `2px solid ${COLORS.blue}88`,
            boxShadow: "inset 0 0 70px rgba(88,175,255,0.05)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 700,
            top: 270,
            width: 520,
            color: COLORS.blue,
            fontFamily: FONT_FAMILY,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 2,
            textAlign: "center",
          }}
        >
          本地 LLM · 电力领域知识 · 当前授权论文库
        </div>

        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {PAPER_NODES.map(([, x, y], index) => (
            <path
              key={`${x}-${y}`}
              d={`M ${x + 70} ${y + 45} C ${(x + 960) / 2} ${y}, 960 440, 960 465`}
              fill="none"
              stroke={index % 2 === 0 ? COLORS.blue : COLORS.cyan}
              strokeWidth="2.5"
              opacity={interpolate(
                frame,
                [330 + index * 12, 350 + index * 12],
                [0, 0.75],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}
            />
          ))}
        </svg>

        {PAPER_NODES.map(([label, left, top], index) => (
          <div
            key={label}
            style={{
              position: "absolute",
              left,
              top,
              width: 140,
              height: 90,
              borderRadius: 18,
              background: "rgba(13,45,77,0.9)",
              border: `1px solid ${index % 2 === 0 ? COLORS.blue : COLORS.cyan}66`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              fontFamily: FONT_FAMILY,
              opacity: interpolate(
                frame,
                [320 + index * 12, 342 + index * 12],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            <FeatureGlyph
              type="document"
              size={36}
              color={index % 2 === 0 ? COLORS.blue : COLORS.cyan}
            />
            <div style={{ marginTop: 5, fontSize: 18, fontWeight: 700 }}>
              {label}
            </div>
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            left: 460,
            right: 460,
            bottom: 182,
            padding: "20px 34px",
            borderRadius: 22,
            textAlign: "center",
            color: COLORS.white,
            background: "rgba(6,22,41,0.9)",
            border: `1px solid ${COLORS.cyan}`,
            fontFamily: FONT_FAMILY,
            fontSize: 36,
            fontWeight: 760,
            opacity: interpolate(frame, [500, 550], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          LLM 组织电力证据 · 专家作出判断
        </div>
      </div>

      <Sequence
        from={scaleFrame(720)}
        durationInFrames={scaleFrame(220)}
        premountFor={30}
      >
        <ScreenEvidenceFrame
          src="shared/recordings/10-assistant-result.mp4"
          kind="video"
          label="真实系统证据 · 电力领域跨论文分析"
          durationInFrames={scaleFrame(220)}
          trimBeforeSeconds={0}
          style={{
            position: "absolute",
            left: 165,
            right: 165,
            top: 238,
            bottom: 174,
          }}
          mediaScale={1.42}
          mediaX={-250}
          mediaY={8}
          objectPosition="right center"
          brandPatch
        />
      </Sequence>
    </SceneFrame>
  );
};
