import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

type ThreeFrames = readonly [number, number, number];

type PainSolutionRow = {
  pain: string;
  painDetail: string;
  painType: GlyphType;
  method: string;
  methodDetail: string;
  methodType: GlyphType;
};

export const PAIN_SOLUTION_ROWS: readonly PainSolutionRow[] = [
  {
    pain: "分散论文",
    painDetail: "论文、成果与研究记录散落在人员、部门和文件中",
    painType: "document",
    method: "领域知识资产",
    methodDetail: "统一解析、关联，并按权限持续沉淀",
    methodType: "grid",
  },
  {
    pain: "个人积累",
    painDetail: "相似调研反复发生，经验与成果难以持续复用",
    painType: "person",
    method: "组织工程创新能力",
    methodDetail: "让研究上下文与成果在组织内持续积累",
    methodType: "governance",
  },
  {
    pain: "被动查找",
    painDetail: "依赖人工检索、摘录和汇总，难以围绕目标连续推进",
    painType: "question",
    method: "智能体按流程推进",
    methodDetail: "在目标约束下分阶段执行，并接受专家审阅",
    methodType: "model",
  },
];

export const PainSolutionStageFrame: React.FC<{
  children: ReactNode;
  frame: number;
  phase: "pain" | "solution";
}> = ({ children, frame, phase }) => {
  const headerOpacity = 1;
  const solutionPhase = phase === "solution" ? enter(frame, 0, 18) : 0;

  return (
    <AbsoluteFill
      style={{
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 68,
          left: 108,
          right: 108,
          zIndex: 30,
          opacity: headerOpacity,
          textShadow: "0 3px 20px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 22,
            fontWeight: 650,
            letterSpacing: 5.5,
          }}
        >
          RESEARCH PAIN → SERVICE METHOD
        </div>
        <div
          style={{
            marginTop: 12,
            maxWidth: 1420,
            fontSize: 70,
            fontWeight: 760,
            letterSpacing: 1,
            lineHeight: 1.16,
          }}
        >
          从科研痛点到对应解决路径
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 180,
          right: 108,
          zIndex: 31,
          display: "flex",
          gap: 10,
          opacity: headerOpacity,
          fontFamily: FONT_FAMILY,
        }}
      >
        {[
          { label: "01 识别痛点", active: 1 - solutionPhase },
          { label: "02 对应方法", active: solutionPhase },
        ].map(({ active, label }) => (
          <div
            key={label}
            style={{
              padding: "11px 18px",
              borderRadius: 999,
              border: `1px solid rgba(45,212,207,${0.18 + active * 0.58})`,
              background: `rgba(13,45,77,${0.42 + active * 0.38})`,
              color: active > 0.5 ? COLORS.white : COLORS.dim,
              fontSize: 18,
              fontWeight: 720,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {children}
    </AbsoluteFill>
  );
};

type PainSolutionMatrixProps =
  | {
      variant: "pain-only";
      frame: number;
      rowRevealFrames: ThreeFrames;
      rowFocusFrames: ThreeFrames;
    }
  | {
      variant: "mapping";
      frame: number;
      methodRevealFrames: ThreeFrames;
    };

const enter = (frame: number, start: number, duration = 18) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const focus = (frame: number, start: number) =>
  interpolate(
    frame,
    [start - 8, start + 14, start + 52, start + 78],
    [0, 1, 0.72, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

const painFocus = (frame: number, start: number) =>
  interpolate(
    frame,
    [start - 8, start + 12, start + 32, start + 50],
    [0, 1, 0.72, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

export const PainSolutionMatrix: React.FC<PainSolutionMatrixProps> = (
  props,
) => (
  <div
    style={{
      position: "absolute",
      top: 252,
      left: 250,
      right: 250,
      display: "grid",
      gap: 15,
      fontFamily: FONT_FAMILY,
    }}
  >
    <div
      style={{
        minHeight: 32,
        display: "grid",
        gridTemplateColumns: "1fr 88px 1.25fr",
        alignItems: "center",
        padding: "0 30px",
        color: COLORS.dim,
        fontSize: 17,
        fontWeight: 720,
        letterSpacing: 3.5,
      }}
    >
      <div style={{ textAlign: "right", paddingRight: 18 }}>科研痛点</div>
      <div />
      <div style={{ paddingLeft: 18 }}>问题表现 → 对应解决方法</div>
    </div>
    {PAIN_SOLUTION_ROWS.map((row, index) => {
      const painOpacity =
        props.variant === "pain-only"
          ? enter(props.frame, props.rowRevealFrames[index])
          : 1;
      const methodStart =
        props.variant === "mapping" ? props.methodRevealFrames[index] : 0;
      const connectorProgress =
        props.variant === "mapping" ? enter(props.frame, methodStart, 28) : 0;
      const methodOpacity =
        props.variant === "mapping"
          ? enter(props.frame, methodStart + 14, 26)
          : 0;
      const painDetailExit =
        props.variant === "mapping" ? enter(props.frame, methodStart, 14) : 0;
      const focusStrength =
        props.variant === "mapping"
          ? focus(props.frame, methodStart)
          : painFocus(props.frame, props.rowFocusFrames[index]);
      const painActivation = Math.max(focusStrength, methodOpacity);
      const restingIconColor = index === 2 ? COLORS.rose : COLORS.amber;
      const painTextColor = interpolateColors(
        painActivation,
        [0, 1],
        [COLORS.muted, COLORS.white],
      );
      const painIconColor = interpolateColors(
        painActivation,
        [0, 1],
        [restingIconColor, COLORS.cyan],
      );

      return (
        <div
          key={row.pain}
          style={{
            position: "relative",
            minHeight: 120,
            display: "grid",
            gridTemplateColumns: "1fr 88px 1.25fr",
            alignItems: "center",
            padding: "0 30px",
            borderRadius: 26,
            overflow: "hidden",
            background: `linear-gradient(135deg, rgba(18,59,98,${
              0.66 + focusStrength * 0.13
            }), rgba(6,22,41,0.88))`,
            border: `1px solid rgba(45,212,207,${
              0.18 + focusStrength * 0.58 + methodOpacity * 0.1
            })`,
            boxShadow: `0 16px 42px rgba(0,0,0,0.18), 0 0 ${
              44 * focusStrength
            }px rgba(45,212,207,${0.15 * focusStrength})`,
            opacity: painOpacity,
            transform: `translateY(${12 * (1 - painOpacity)}px)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 18,
              bottom: 18,
              width: 4,
              borderRadius: 999,
              background: COLORS.cyan,
              opacity: focusStrength,
              transform: `scaleY(${0.5 + focusStrength * 0.5})`,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 17,
              color: painTextColor,
              fontSize: 31,
              fontWeight: 680,
            }}
          >
            <FeatureGlyph type={row.painType} size={43} color={painIconColor} />
            {row.pain}
          </div>

          <div
            style={{
              position: "relative",
              width: 62,
              height: 24,
              justifySelf: "center",
              opacity:
                props.variant === "mapping"
                  ? 0.18 + connectorProgress * 0.82
                  : 0.18,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 7,
                top: 11,
                height: 2,
                borderRadius: 999,
                background: "rgba(111,151,184,0.32)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 10,
                width: `${connectorProgress * 52}px`,
                height: 4,
                borderRadius: 999,
                background: COLORS.cyan,
                boxShadow: `0 0 14px rgba(45,212,207,${
                  0.25 + focusStrength * 0.4
                })`,
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 5,
                width: 13,
                height: 13,
                borderTop: `3px solid ${COLORS.cyan}`,
                borderRight: `3px solid ${COLORS.cyan}`,
                transform: "rotate(45deg)",
                opacity: connectorProgress,
              }}
            />
          </div>

          <div style={{ position: "relative", minHeight: 76 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                color: COLORS.muted,
                fontSize: 23,
                lineHeight: 1.45,
                opacity: 1 - painDetailExit,
                transform: `translateX(${-8 * painDetailExit}px)`,
              }}
            >
              {row.painDetail}
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                gap: 17,
                opacity: methodOpacity,
                transform: `translateX(${18 * (1 - methodOpacity)}px)`,
              }}
            >
              <FeatureGlyph
                type={row.methodType}
                size={45}
                color={COLORS.cyan}
              />
              <div>
                <div
                  style={{
                    color: COLORS.white,
                    fontSize: 34,
                    fontWeight: 770,
                  }}
                >
                  {row.method}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    color: COLORS.muted,
                    fontSize: 19,
                    lineHeight: 1.35,
                  }}
                >
                  {row.methodDetail}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);
