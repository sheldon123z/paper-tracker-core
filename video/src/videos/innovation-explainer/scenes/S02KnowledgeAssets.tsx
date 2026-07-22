import {
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { ConceptCard } from "../components/ConceptCard";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const PDFS = ["论文 A", "论文 B", "论文 C", "论文 D"];

const LibraryEvidenceCard: React.FC<{
  title: string;
  scope: string;
  listMark: string;
  conclusion: string;
  src: string;
  accent: string;
  delay: number;
  timingScale: number;
}> = ({
  title,
  scope,
  listMark,
  conclusion,
  src,
  accent,
  delay,
  timingScale,
}) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        minWidth: 0,
        height: 574,
        padding: "22px 22px 20px",
        borderRadius: 34,
        background:
          "linear-gradient(145deg, rgba(18,59,98,0.96), rgba(6,22,41,0.96))",
        border: `3px solid ${accent}`,
        boxShadow: `0 26px 68px rgba(0,0,0,0.34), 0 0 42px ${accent}22`,
        fontFamily: FONT_FAMILY,
        opacity: interpolate(frame, [delay, delay + 24], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0 ${interpolate(frame, [delay, delay + 24], [22, 0], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}px`,
      }}
    >
      <div
        style={{
          height: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
        }}
      >
        <div style={{ color: COLORS.white, fontSize: 31, fontWeight: 760 }}>
          {title}
        </div>
        <div
          style={{
            padding: "8px 15px",
            borderRadius: 999,
            color: accent,
            background: `${accent}18`,
            border: `1px solid ${accent}77`,
            fontSize: 19,
            fontWeight: 740,
            whiteSpace: "nowrap",
          }}
        >
          真实系统证据
        </div>
      </div>

      <div
        style={{
          position: "relative",
          height: 304,
          marginTop: 12,
          overflow: "hidden",
          borderRadius: 22,
          background: "#DDEAF6",
          border: `2px solid ${accent}88`,
          boxShadow: "inset 0 0 40px rgba(6,22,41,0.14)",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "56% 34%",
            scale: 1.52,
            filter: "contrast(1.12) saturate(1.08) brightness(0.96)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 55%, rgba(6,22,41,0.38))",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 18,
            bottom: 16,
            padding: "10px 16px",
            borderRadius: 14,
            color: COLORS.white,
            background: "rgba(6,22,41,0.9)",
            border: `2px solid ${accent}`,
            fontSize: 22,
            fontWeight: 740,
          }}
        >
          截图中的库范围标识：{listMark}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 14,
        }}
      >
        <div
          style={{
            padding: "12px 15px",
            borderRadius: 16,
            background: `${accent}18`,
            border: `1px solid ${accent}66`,
          }}
        >
          <div style={{ color: COLORS.muted, fontSize: 17 }}>论文库范围</div>
          <div
            style={{
              marginTop: 4,
              color: COLORS.white,
              fontSize: 24,
              fontWeight: 760,
              whiteSpace: "nowrap",
            }}
          >
            {scope}
          </div>
        </div>
        <div
          style={{
            padding: "12px 15px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.045)",
            border: `1px solid ${COLORS.line}`,
          }}
        >
          <div style={{ color: COLORS.muted, fontSize: 17 }}>列表库标识</div>
          <div
            style={{
              marginTop: 4,
              color: accent,
              fontSize: 24,
              fontWeight: 760,
              whiteSpace: "nowrap",
            }}
          >
            {listMark}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          color: COLORS.white,
          fontSize: 25,
          fontWeight: 720,
          textAlign: "center",
        }}
      >
        {conclusion}
      </div>
    </div>
  );
};

const KnowledgeZone: React.FC<{
  title: string;
  detail: string;
  type: GlyphType;
  accent: string;
  startFrame: number;
  timingScale: number;
}> = ({ title, detail, type, accent, startFrame, timingScale }) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        height: 190,
        padding: "0 26px",
        borderRadius: 28,
        background:
          "linear-gradient(145deg, rgba(18,59,98,0.9), rgba(6,22,41,0.9))",
        border: `1px solid ${accent}77`,
        display: "flex",
        alignItems: "center",
        gap: 20,
        opacity: interpolate(frame, [startFrame, startFrame + 28], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0 ${interpolate(
          frame,
          [startFrame, startFrame + 28],
          [22, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px`,
      }}
    >
      <div
        style={{
          width: 66,
          height: 66,
          borderRadius: 20,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accent,
          background: `${accent}18`,
          border: `1px solid ${accent}55`,
        }}
      >
        <FeatureGlyph type={type} size={46} color={accent} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: COLORS.white,
            fontSize: 31,
            lineHeight: 1.2,
            fontWeight: 740,
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 12,
            color: COLORS.muted,
            fontSize: 20,
            lineHeight: 1.35,
            whiteSpace: "nowrap",
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
};

export const S02KnowledgeAssets: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, timingScale, scaleFrame } = useScaledSceneFrame(
    durationInFrames,
    780,
  );
  const conceptOpacity = interpolate(frame, [350, 400], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="02 · KNOWLEDGE ASSET"
      title="一次整理，沉淀电力科研知识资产"
    >
      <div style={{ opacity: conceptOpacity }}>
        <div
          style={{
            position: "absolute",
            top: 292,
            left: 112,
            width: 310,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            fontFamily: FONT_FAMILY,
          }}
        >
          {PDFS.map((name, index) => (
            <div
              key={name}
              style={{
                height: 82,
                borderRadius: 18,
                padding: "0 22px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                color: "#173A59",
                background: "rgba(244,248,255,0.94)",
                boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
                opacity: interpolate(
                  frame,
                  [20 + index * 14, 44 + index * 14],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                ),
                translate: `${interpolate(
                  frame,
                  [20 + index * 14, 44 + index * 14],
                  [-26, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                )}px 0`,
              }}
            >
              <FeatureGlyph type="document" size={42} color="#2B77B7" />
              <span style={{ fontSize: 24, fontWeight: 720 }}>{name}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 510,
            top: 348,
            width: 340,
          }}
        >
          <ConceptCard
            title="结构化信息"
            detail="可检索 · 可关联 · 可复核"
            type="evidence"
            startFrame={63}
            timingScale={timingScale}
            accent={COLORS.blue}
          />
          <div
            style={{
              marginTop: 20,
              padding: "16px 22px",
              borderRadius: 16,
              background: COLORS.amberSoft,
              border: `1px solid ${COLORS.amber}55`,
              color: COLORS.amber,
              fontFamily: FONT_FAMILY,
              fontSize: 23,
              textAlign: "center",
              fontWeight: 700,
              opacity: interpolate(frame, [243, 271], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            人工复核 · 重复合并
          </div>
        </div>

        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <defs>
            <marker
              id="knowledge-arrow"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
            >
              <path d="M 0 0 L 12 6 L 0 12 Z" fill={COLORS.cyan} />
            </marker>
          </defs>
          <path
            d="M 430 485 C 470 485, 480 460, 510 460"
            fill="none"
            stroke={COLORS.blue}
            strokeWidth="3"
            strokeDasharray="10 10"
            opacity={interpolate(frame, [80, 125], [0, 0.9], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <path
            d="M 850 475 L 1015 475"
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="4"
            markerEnd="url(#knowledge-arrow)"
            opacity={interpolate(frame, [243, 281], [0, 0.95], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        </svg>

        <div
          style={{
            position: "absolute",
            left: 868,
            top: 402,
            width: 132,
            padding: "9px 12px",
            borderRadius: 999,
            color: COLORS.cyan,
            background: "rgba(6,22,41,0.92)",
            border: `1px solid ${COLORS.cyan}66`,
            fontFamily: FONT_FAMILY,
            fontSize: 18,
            fontWeight: 700,
            textAlign: "center",
            opacity: interpolate(frame, [243, 271], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          按权限入库
        </div>

        <div
          style={{
            position: "absolute",
            left: 1030,
            right: 112,
            top: 250,
            height: 500,
            borderRadius: 70,
            border: `2px solid ${COLORS.cyan}88`,
            boxShadow: "inset 0 0 80px rgba(45,212,207,0.06)",
            padding: "54px 48px 44px",
            fontFamily: FONT_FAMILY,
            opacity: interpolate(frame, [180, 240], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              color: COLORS.cyan,
              fontSize: 21,
              letterSpacing: 4,
              fontWeight: 700,
            }}
          >
            组织知识资产
          </div>
          <div
            style={{
              marginTop: 28,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
            }}
          >
            <KnowledgeZone
              title="公共知识区"
              detail="跨部门授权共享"
              type="library"
              startFrame={245}
              timingScale={timingScale}
              accent={COLORS.cyan}
            />
            <KnowledgeZone
              title="部门知识区"
              detail="部门边界内沉淀"
              type="governance"
              startFrame={265}
              timingScale={timingScale}
              accent={COLORS.blue}
            />
          </div>
          <div
            style={{
              marginTop: 32,
              textAlign: "center",
              color: COLORS.white,
              fontSize: 32,
              fontWeight: 760,
              letterSpacing: 1,
              opacity: interpolate(frame, [260, 300], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            复核去重 → 按授权进入公共库或部门库
          </div>
        </div>
      </div>

      <Sequence
        from={scaleFrame(380)}
        durationInFrames={scaleFrame(400)}
        premountFor={30}
      >
        <div
          style={{
            position: "absolute",
            left: 92,
            right: 92,
            top: 236,
            bottom: 154,
            fontFamily: FONT_FAMILY,
          }}
        >
          <div
            style={{
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.cyan,
              fontSize: 25,
              fontWeight: 740,
              letterSpacing: 1,
              opacity: interpolate(frame, [380, 408], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {frame >= 553
              ? "电网论文沉淀为可授权复用的领域知识资产"
              : "同一论文库入口 · 授权范围决定可见内容"}
          </div>
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 28,
            }}
          >
            <LibraryEvidenceCard
              title="公共论文库"
              scope="公共数据库"
              listMark="公共库"
              conclusion="在授权范围内共享与复用"
              src="shared/stills/public-library.png"
              accent={COLORS.cyan}
              delay={8}
              timingScale={timingScale}
            />
            <LibraryEvidenceCard
              title="部门私有论文库"
              scope="A 私有库"
              listMark="部门库"
              conclusion="只在部门边界内沉淀与复用"
              src="shared/stills/department-library.png"
              accent={COLORS.blue}
              delay={20}
              timingScale={timingScale}
            />
          </div>
        </div>
      </Sequence>
    </SceneFrame>
  );
};
