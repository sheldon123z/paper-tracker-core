import { Video } from "@remotion/media";
import {
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const REFERENCE_DURATION = 1020;
const LOCAL_FIRST_END = 270;
const AUTHORIZATION_END = 780;
const GOVERNANCE_START = 780;
const CONCEPTUAL_FADE_START = GOVERNANCE_START - 24;
const REAL_PAGE_CROSSFADE = 24;

const REAL_PAGES: {
  title: string;
  detail: string;
  evidence: string;
  type: GlyphType;
  trimBeforeSeconds: number;
  from: number;
  durationInFrames: number;
}[] = [
  {
    title: "部门与账号",
    detail: "组织归属、账号状态与授权边界",
    evidence: "实机页面 · 账号管理",
    type: "person",
    trimBeforeSeconds: 14.5,
    from: CONCEPTUAL_FADE_START,
    durationInFrames: 118,
  },
  {
    title: "会话与审计",
    detail: "用户会话与关键操作持续留痕",
    evidence: "实机页面 · 登录与操作审计",
    type: "report",
    trimBeforeSeconds: 28.5,
    from: 850,
    durationInFrames: 109,
  },
  {
    title: "AI 调用与使用统计",
    detail: "调用量、Token 与账号使用情况可追踪",
    evidence: "实机页面 · 使用统计",
    type: "table",
    trimBeforeSeconds: 33.5,
    from: 935,
    durationInFrames: 85,
  },
];

const layerOpacity = (frame: number, startFrame: number, endFrame: number) =>
  interpolate(
    frame,
    [startFrame, startFrame + 28, endFrame - 28, endFrame],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

const PhaseBadge: React.FC<{ children: React.ReactNode; accent?: string }> = ({
  children,
  accent = COLORS.cyan,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "11px 20px",
      borderRadius: 999,
      color: accent,
      background: `${accent}16`,
      border: `1px solid ${accent}77`,
      fontSize: 21,
      fontWeight: 760,
      letterSpacing: 2.1,
    }}
  >
    {children}
  </div>
);

const LocalAsset: React.FC<{
  frame: number;
  startFrame: number;
  title: string;
  detail: string;
  type: GlyphType;
  accent: string;
}> = ({ frame, startFrame, title, detail, type, accent }) => {
  const enter = interpolate(frame, [startFrame, startFrame + 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        width: 330,
        height: 104,
        boxSizing: "border-box",
        padding: "19px 23px",
        borderRadius: 23,
        display: "flex",
        alignItems: "center",
        gap: 18,
        background: `${accent}10`,
        border: `1px solid ${accent}66`,
        boxShadow: `0 16px 34px rgba(0,0,0,0.18), 0 0 28px ${accent}12`,
        opacity: enter,
        translate: `0 ${interpolate(enter, [0, 1], [10, 0])}px`,
      }}
    >
      <FeatureGlyph type={type} size={46} color={accent} />
      <div>
        <div style={{ color: COLORS.white, fontSize: 25, fontWeight: 760 }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            color: COLORS.muted,
            fontSize: 18,
            lineHeight: 1.3,
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
};

const LocalFirstLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = layerOpacity(frame, 0, LOCAL_FIRST_END + 24);
  const centerEnter = interpolate(frame, [36, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: 34, top: 30 }}>
        <PhaseBadge>目标部署架构 · LOCAL-FIRST</PhaseBadge>
      </div>

      <div
        style={{
          position: "absolute",
          left: 500,
          top: 135,
          width: 470,
          height: 205,
          boxSizing: "border-box",
          padding: "30px 34px",
          borderRadius: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 27,
          background:
            "linear-gradient(145deg, rgba(18,59,98,0.98), rgba(6,22,41,0.98))",
          border: `2px solid ${COLORS.cyan}`,
          boxShadow: "0 0 72px rgba(45,212,207,0.16)",
          opacity: centerEnter,
          translate: `0 ${interpolate(centerEnter, [0, 1], [10, 0])}px`,
        }}
      >
        <div
          style={{
            width: 82,
            height: 82,
            flex: "0 0 auto",
            borderRadius: 25,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: COLORS.cyanSoft,
            border: `1px solid ${COLORS.cyan}77`,
          }}
        >
          <FeatureGlyph type="model" size={58} color={COLORS.cyan} />
        </div>
        <div>
          <div style={{ color: COLORS.white, fontSize: 34, fontWeight: 790 }}>
            本地科研环境
          </div>
          <div
            style={{
              marginTop: 10,
              color: COLORS.muted,
              fontSize: 22,
              lineHeight: 1.38,
            }}
          >
            本地离线推理，资料、状态与成果闭环流转
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 112, top: 292 }}>
        <LocalAsset
          frame={frame}
          startFrame={112}
          title="论文与元数据"
          detail="原文与结构化资料"
          type="document"
          accent={COLORS.blue}
        />
      </div>
      <div style={{ position: "absolute", right: 112, top: 292 }}>
        <LocalAsset
          frame={frame}
          startFrame={180}
          title="科研过程与成果"
          detail="会话、检查点与报告"
          type="workflow"
          accent={COLORS.amber}
        />
      </div>
    </div>
  );
};

const AUTHORIZATION_STEPS: {
  title: string;
  detail: string;
  type: GlyphType;
  accent: string;
}[] = [
  {
    title: "统一身份",
    detail: "账号、角色与部门属性",
    type: "person",
    accent: COLORS.blue,
  },
  {
    title: "权限继承",
    detail: "用户与智能体同一边界",
    type: "governance",
    accent: COLORS.cyan,
  },
  {
    title: "行级访问控制",
    detail: "匹配请求与数据范围",
    type: "table",
    accent: COLORS.blue,
  },
  {
    title: "部门资料域隔离",
    detail: "非本部门用户默认不可见",
    type: "library",
    accent: COLORS.amber,
  },
];

const AuthorizationStep: React.FC<{
  frame: number;
  index: number;
  title: string;
  detail: string;
  type: GlyphType;
  accent: string;
}> = ({ frame, index, title, detail, type, accent }) => {
  const enterStart = 300 + index * 48;
  const enter = interpolate(frame, [enterStart, enterStart + 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        width: 292,
        height: 238,
        boxSizing: "border-box",
        padding: "28px 24px",
        borderRadius: 28,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "rgba(6,22,41,0.84)",
        border: `2px solid ${accent}77`,
        boxShadow: `0 18px 36px rgba(0,0,0,0.18), 0 0 30px ${accent}16`,
        opacity: enter,
        translate: `0 ${interpolate(enter, [0, 1], [10, 0])}px`,
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}1c`,
          border: `1px solid ${accent}66`,
        }}
      >
        <FeatureGlyph type={type} size={49} color={accent} />
      </div>
      <div
        style={{
          marginTop: 20,
          color: COLORS.white,
          fontSize: 27,
          fontWeight: 780,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 11,
          color: COLORS.muted,
          fontSize: 19,
          lineHeight: 1.35,
        }}
      >
        {detail}
      </div>
    </div>
  );
};

const AuthorizationLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = layerOpacity(
    frame,
    LOCAL_FIRST_END - 24,
    AUTHORIZATION_END + 28,
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: 34, top: 30 }}>
        <PhaseBadge accent={COLORS.blue}>
          授权边界与资料域隔离 · DATA DOMAIN ISOLATION
        </PhaseBadge>
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {AUTHORIZATION_STEPS.map((step, index) => (
          <div
            key={step.title}
            style={{ display: "flex", alignItems: "center", gap: 24 }}
          >
            <AuthorizationStep frame={frame} index={index} {...step} />
            {index < AUTHORIZATION_STEPS.length - 1 ? (
              <div
                style={{
                  color: COLORS.cyan,
                  fontSize: 40,
                  fontWeight: 520,
                  lineHeight: 1,
                  opacity: interpolate(
                    frame,
                    [300 + (index + 1) * 48, 332 + (index + 1) * 48],
                    [0, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                    },
                  ),
                }}
              >
                →
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 220,
          right: 220,
          bottom: 20,
          boxSizing: "border-box",
          padding: "11px 22px 12px",
          borderRadius: 18,
          background: "rgba(45,212,207,0.08)",
          border: `1px solid ${COLORS.cyan}55`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: COLORS.white,
            fontSize: 25,
            fontWeight: 780,
            whiteSpace: "nowrap",
          }}
        >
          部门专属科研资料严格隔离
        </div>
        <div
          style={{
            marginTop: 5,
            color: COLORS.cyan,
            fontSize: 18,
            fontWeight: 720,
            whiteSpace: "nowrap",
          }}
        >
          跨部门默认不可见 · 未经授权不得访问、调用或流转
        </div>
      </div>
    </div>
  );
};

type RealPageDefinition = (typeof REAL_PAGES)[number];

const realPageOpacity = (frame: number, index: number) => {
  const page = REAL_PAGES[index];

  if (index === 0) {
    const nextPage = REAL_PAGES[index + 1];
    return interpolate(
      frame,
      [nextPage.from, nextPage.from + REAL_PAGE_CROSSFADE],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.45, 0, 0.55, 1),
      },
    );
  }

  if (index === REAL_PAGES.length - 1) {
    return interpolate(
      frame,
      [page.from, page.from + REAL_PAGE_CROSSFADE],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.45, 0, 0.55, 1),
      },
    );
  }

  const nextPage = REAL_PAGES[index + 1];
  return interpolate(
    frame,
    [
      page.from,
      page.from + REAL_PAGE_CROSSFADE,
      nextPage.from,
      nextPage.from + REAL_PAGE_CROSSFADE,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.45, 0, 0.55, 1),
    },
  );
};

const realPageLabelOpacity = (frame: number, index: number) => {
  const page = REAL_PAGES[index];
  const halfCrossfade = REAL_PAGE_CROSSFADE / 2;

  if (index === 0) {
    const nextPage = REAL_PAGES[index + 1];
    return interpolate(
      frame,
      [nextPage.from, nextPage.from + halfCrossfade],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.45, 0, 0.55, 1),
      },
    );
  }

  if (index === REAL_PAGES.length - 1) {
    return interpolate(
      frame,
      [page.from + halfCrossfade, page.from + REAL_PAGE_CROSSFADE],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.45, 0, 0.55, 1),
      },
    );
  }

  const nextPage = REAL_PAGES[index + 1];
  return interpolate(
    frame,
    [
      page.from + halfCrossfade,
      page.from + REAL_PAGE_CROSSFADE,
      nextPage.from,
      nextPage.from + halfCrossfade,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.45, 0, 0.55, 1),
    },
  );
};

const RealPageNarrative: React.FC<{ page: RealPageDefinition }> = ({
  page,
}) => (
  <div
    style={{
      position: "absolute",
      left: 24,
      bottom: 86,
      zIndex: 8,
      width: 390,
      minHeight: 188,
      boxSizing: "border-box",
      padding: "24px 26px",
      borderRadius: 28,
      color: COLORS.white,
      background:
        "linear-gradient(145deg, rgba(6,22,41,0.97), rgba(11,49,81,0.96))",
      border: `1px solid ${COLORS.cyan}88`,
      boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 15,
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          borderRadius: 18,
          background: COLORS.cyanSoft,
          border: `1px solid ${COLORS.cyan}77`,
        }}
      >
        <FeatureGlyph type={page.type} size={42} color={COLORS.cyan} />
      </div>
      <div
        style={{
          color: COLORS.cyan,
          fontSize: 17,
          lineHeight: 1.3,
          fontWeight: 770,
          letterSpacing: 1.4,
        }}
      >
        {page.evidence}
      </div>
    </div>
    <div
      style={{
        marginTop: 19,
        color: COLORS.white,
        fontSize: 35,
        lineHeight: 1.16,
        fontWeight: 800,
      }}
    >
      {page.title}
    </div>
    <div
      style={{
        marginTop: 11,
        color: COLORS.muted,
        fontSize: 21,
        lineHeight: 1.42,
      }}
    >
      {page.detail}
    </div>
  </div>
);

const SensitiveInformationMask: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        right: 18,
        top: 15,
        zIndex: 5,
        width: 250,
        height: 48,
        borderRadius: 14,
        background: "rgba(232,241,249,0.97)",
        border: "1px solid rgba(13,45,77,0.12)",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 10,
        bottom: 6,
        zIndex: 5,
        width: 260,
        height: 68,
        borderRadius: 15,
        background: "rgba(232,241,249,0.98)",
        border: "1px solid rgba(13,45,77,0.1)",
      }}
    />
  </>
);

const EvolutionOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 104,
        top: 82,
        zIndex: 6,
        width: 1450,
        height: 500,
        overflow: "hidden",
        borderRadius: 34,
        background: "rgba(6,22,41,0.96)",
        border: `1px solid ${COLORS.cyan}77`,
        boxShadow: "0 28px 80px rgba(0,0,0,0.3)",
      }}
    >
      <LocalFirstLayer frame={frame} />
      <AuthorizationLayer frame={frame} />
    </div>
  );
};

const ConceptualPermissionCanvas: React.FC<{ frame: number }> = ({ frame }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 4,
      overflow: "hidden",
      opacity: interpolate(
        frame,
        [CONCEPTUAL_FADE_START, GOVERNANCE_START],
        [1, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.45, 0, 0.55, 1),
        },
      ),
      background: "linear-gradient(145deg, #061629, #0b3655)",
    }}
  >
    <EvolutionOverlay frame={frame} />
  </div>
);

const RealPermissionPages: React.FC<{
  durationInFrames: number;
  frame: number;
  premountFor: number;
}> = ({ durationInFrames, frame, premountFor }) => {
  const { fps } = useVideoConfig();
  const timingScale = durationInFrames / REFERENCE_DURATION;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        overflow: "hidden",
        opacity: interpolate(
          frame,
          [CONCEPTUAL_FADE_START, GOVERNANCE_START],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          },
        ),
        background: "#EAF2F9",
      }}
    >
      {REAL_PAGES.map((page, index) => (
        <Sequence
          key={page.title}
          from={Math.round(page.from * timingScale)}
          durationInFrames={Math.max(
            1,
            Math.round(page.durationInFrames * timingScale),
          )}
          premountFor={premountFor}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              background: "#EAF2F9",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                opacity: realPageOpacity(frame, index),
              }}
            >
              <Video
                src={staticFile("shared/recordings/15-access-control.mp4")}
                trimBefore={Math.round(page.trimBeforeSeconds * fps)}
                playbackRate={0.3}
                muted
                objectFit="cover"
                style={{
                  width: "100%",
                  height: "100%",
                  objectPosition: "center 45%",
                  filter: "contrast(1.035) saturate(0.94)",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 3,
                pointerEvents: "none",
                opacity: realPageOpacity(frame, index),
                background:
                  "linear-gradient(90deg, rgba(6,22,41,0.10), transparent 36%, rgba(6,22,41,0.025))",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 8,
                opacity: realPageLabelOpacity(frame, index),
                pointerEvents: "none",
              }}
            >
              <RealPageNarrative page={page} />
            </div>
          </div>
        </Sequence>
      ))}

      <SensitiveInformationMask />
      <div
        style={{
          position: "absolute",
          right: 25,
          top: 22,
          zIndex: 9,
          padding: "11px 18px",
          borderRadius: 999,
          color: COLORS.white,
          background: "rgba(6,22,41,0.92)",
          border: `1px solid ${COLORS.cyan}`,
          fontSize: 20,
          fontWeight: 740,
          letterSpacing: 1.2,
        }}
      >
        权限管理 · 实际运行画面
      </div>
    </div>
  );
};

const PersistentPermissionPage: React.FC<{
  durationInFrames: number;
  frame: number;
  premountFor: number;
}> = ({ durationInFrames, frame, premountFor }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        top: 245,
        bottom: 178,
        overflow: "hidden",
        borderRadius: 38,
        background: "#EAF2F9",
        border: `2px solid ${COLORS.cyan}88`,
        boxShadow: "0 32px 92px rgba(0,0,0,0.34)",
        fontFamily: FONT_FAMILY,
      }}
    >
      <RealPermissionPages
        durationInFrames={durationInFrames}
        frame={frame}
        premountFor={premountFor}
      />
      <ConceptualPermissionCanvas frame={frame} />
    </div>
  );
};

export const S06SafeGovernance: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, scaleFrame } = useScaledSceneFrame(
    durationInFrames,
    REFERENCE_DURATION,
  );
  const premountFor = Math.max(1, Math.min(scaleFrame(30), durationInFrames));

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="01 · SECURITY BY DESIGN"
      title="安全内生：本地闭环与可信治理"
    >
      <PersistentPermissionPage
        durationInFrames={durationInFrames}
        frame={frame}
        premountFor={premountFor}
      />
    </SceneFrame>
  );
};
