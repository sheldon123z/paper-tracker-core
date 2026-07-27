import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";

const REFERENCE_DURATION_IN_FRAMES = 30 * 30;
const TOOL_USE_REVEAL_FRAME = 286;
const CHECKPOINT_REVEAL_FRAME = 414;
const AGUI_REVEAL_FRAME = 546;

const KEYWORD_WINDOWS = {
  agentic: [20, 46, 120, 154],
  langGraph: [116, 146, 236, 270],
  supervisor: [170, 202, 276, 310],
  toolUse: [282, 314, 378, 408],
  checkpoint: [414, 446, 540, 576],
  agui: [546, 578, 786, 826],
} as const;

const focusValue = (
  frame: number,
  window: readonly [number, number, number, number],
) =>
  interpolate(frame, window, [0.18, 1, 1, 0.42], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const revealValue = (frame: number, start: number) =>
  interpolate(frame, [start, start + 34], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ArchitectureArrow: React.FC<{
  frame: number;
  revealAt: number;
}> = ({ frame, revealAt }) => {
  const reveal = revealValue(frame, revealAt);

  return (
    <div
      style={{
        color: COLORS.cyan,
        fontSize: 48,
        textAlign: "center",
        opacity: reveal,
        translate: `${-10 * (1 - reveal)}px 0`,
      }}
    >
      →
    </div>
  );
};

const GoalCard: React.FC<{ frame: number }> = ({ frame }) => {
  const reveal = revealValue(frame, 18);

  return (
    <div
      style={{
        minHeight: 372,
        boxSizing: "border-box",
        padding: "30px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        borderRadius: 28,
        opacity: reveal,
        translate: `0 ${10 * (1 - reveal)}px`,
        color: COLORS.white,
        background: "linear-gradient(145deg, #0b2d4e, #071d35)",
        border: `1px solid ${COLORS.blue}88`,
        boxShadow: "0 22px 60px rgba(0,0,0,0.24)",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 24,
          background: COLORS.blueSoft,
          border: `1px solid ${COLORS.blue}66`,
        }}
      >
        <FeatureGlyph type="question" size={54} color={COLORS.blue} />
      </div>
      <div
        style={{
          marginTop: 22,
          color: COLORS.blue,
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: 2.2,
        }}
      >
        RESEARCH GOAL
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 31,
          lineHeight: 1.28,
          fontWeight: 810,
        }}
      >
        科研目标
      </div>
      <div
        style={{
          marginTop: 18,
          color: COLORS.muted,
          fontSize: 20,
          lineHeight: 1.55,
        }}
      >
        授权论文库
        <br />
        专业科研模板
        <br />
        用户约束条件
      </div>
    </div>
  );
};

const KeywordBadge: React.FC<{
  english: string;
  chinese: string;
  focus: number;
  accent?: string;
}> = ({ english, chinese, focus, accent = COLORS.cyan }) => (
  <div
    style={{
      padding: "9px 15px",
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      borderRadius: 999,
      color: focus > 0.62 ? COLORS.white : COLORS.muted,
      background: `${accent}${focus > 0.62 ? "28" : "10"}`,
      border: `1px solid ${accent}${focus > 0.62 ? "aa" : "44"}`,
      boxShadow: focus > 0.62 ? `0 0 30px ${accent}22` : "none",
      fontSize: 16,
      fontWeight: 780,
      letterSpacing: 0.8,
    }}
  >
    <span style={{ color: accent }}>{english}</span>
    <span>·</span>
    <span>{chinese}</span>
  </div>
);

const ToolStage: React.FC<{
  label: string;
  type: GlyphType;
  index: number;
  frame: number;
}> = ({ label, type, index, frame }) => {
  const reveal = revealValue(frame, TOOL_USE_REVEAL_FRAME + 16 + index * 24);
  const selectedIndex = Math.min(
    3,
    Math.max(0, Math.floor((frame - (TOOL_USE_REVEAL_FRAME + 16)) / 24)),
  );
  const active = frame >= TOOL_USE_REVEAL_FRAME + 16 && index === selectedIndex;

  return (
    <div
      style={{
        minHeight: 82,
        boxSizing: "border-box",
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 17,
        opacity: reveal,
        translate: `0 ${8 * (1 - reveal)}px`,
        color: active ? COLORS.cyan : COLORS.white,
        background: active ? COLORS.cyanSoft : "rgba(6,22,41,0.68)",
        border: `1px solid ${active ? COLORS.cyan : COLORS.line}`,
      }}
    >
      <FeatureGlyph
        type={type}
        size={30}
        color={active ? COLORS.cyan : COLORS.blue}
      />
      <div style={{ fontSize: 17, fontWeight: 750 }}>{label}</div>
    </div>
  );
};

const LangGraphPane: React.FC<{ frame: number }> = ({ frame }) => {
  const langGraphReveal = revealValue(frame, 116);
  const langGraphFocus = focusValue(frame, KEYWORD_WINDOWS.langGraph);
  const supervisorReveal = revealValue(frame, 176);
  const supervisorFocus = focusValue(frame, KEYWORD_WINDOWS.supervisor);
  const toolReveal = revealValue(frame, TOOL_USE_REVEAL_FRAME);
  const toolFocus = focusValue(frame, KEYWORD_WINDOWS.toolUse);
  const checkpointReveal = revealValue(frame, CHECKPOINT_REVEAL_FRAME);
  const checkpointFocus = focusValue(frame, KEYWORD_WINDOWS.checkpoint);

  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 430,
        boxSizing: "border-box",
        padding: "20px 22px",
        borderRadius: 30,
        opacity: langGraphReveal,
        color: COLORS.white,
        background:
          "linear-gradient(145deg, rgba(18,59,98,0.88), rgba(6,22,41,0.94))",
        border: `1px solid rgba(45,212,207,${0.28 + langGraphFocus * 0.56})`,
        boxShadow:
          langGraphFocus > 0.62
            ? "0 24px 70px rgba(45,212,207,0.12)"
            : "0 22px 60px rgba(0,0,0,0.24)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <KeywordBadge
          english="LangGraph"
          chinese="有状态任务图"
          focus={langGraphFocus}
        />
        <div
          style={{
            color: COLORS.muted,
            fontSize: 15,
            lineHeight: 1.3,
            textAlign: "right",
          }}
        >
          状态贯穿任务全程
          <br />
          阶段可以续接
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          minHeight: 88,
          boxSizing: "border-box",
          padding: "14px 18px",
          display: "grid",
          gridTemplateColumns: "56px 1fr auto",
          gap: 14,
          alignItems: "center",
          borderRadius: 18,
          opacity: supervisorReveal,
          translate: `0 ${8 * (1 - supervisorReveal)}px`,
          background:
            supervisorFocus > 0.62
              ? "linear-gradient(120deg, rgba(45,212,207,0.19), rgba(18,59,98,0.84))"
              : "rgba(6,22,41,0.72)",
          border: `1px solid ${supervisorFocus > 0.62 ? COLORS.cyan : COLORS.line}`,
          boxShadow:
            supervisorFocus > 0.62
              ? "0 14px 36px rgba(45,212,207,0.12)"
              : "none",
        }}
      >
        <FeatureGlyph type="model" size={46} color={COLORS.cyan} />
        <div>
          <div style={{ color: COLORS.white, fontSize: 23, fontWeight: 810 }}>
            Supervisor
          </div>
          <div style={{ marginTop: 4, color: COLORS.muted, fontSize: 16 }}>
            按科研模板编排阶段并调度工具
          </div>
        </div>
        <KeywordBadge
          english="Supervisor"
          chinese="智能体编排"
          focus={supervisorFocus}
        />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "14px 16px",
          borderRadius: 19,
          opacity: toolReveal,
          translate: `0 ${8 * (1 - toolReveal)}px`,
          background: "rgba(6,22,41,0.56)",
          border: `1px solid ${toolFocus > 0.62 ? COLORS.amber : COLORS.line}`,
          boxShadow:
            toolFocus > 0.62 ? "0 14px 38px rgba(244,197,106,0.10)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <KeywordBadge
            english="Tool Use"
            chinese="专业工具增强执行"
            focus={toolFocus}
            accent={COLORS.amber}
          />
          <div style={{ color: COLORS.muted, fontSize: 15 }}>
            检索、筛选、分析与合成
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 9,
          }}
        >
          <ToolStage label="检索" type="library" index={0} frame={frame} />
          <ToolStage label="筛选" type="evidence" index={1} frame={frame} />
          <ToolStage label="分析" type="grid" index={2} frame={frame} />
          <ToolStage label="报告" type="report" index={3} frame={frame} />
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          minHeight: 54,
          boxSizing: "border-box",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          borderRadius: 16,
          opacity: checkpointReveal,
          translate: `0 ${8 * (1 - checkpointReveal)}px`,
          color: COLORS.white,
          background:
            checkpointFocus > 0.62
              ? "rgba(88,175,255,0.18)"
              : "rgba(6,22,41,0.72)",
          border: `1px solid ${checkpointFocus > 0.62 ? COLORS.blue : COLORS.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FeatureGlyph type="document" size={32} color={COLORS.blue} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 780 }}>持久化检查点</div>
            <div style={{ marginTop: 2, color: COLORS.muted, fontSize: 14 }}>
              记录任务状态，为复杂长任务的中断续接提供基础
            </div>
          </div>
        </div>
        <KeywordBadge
          english="Checkpoint"
          chinese="状态续接"
          focus={checkpointFocus}
          accent={COLORS.blue}
        />
      </div>
    </div>
  );
};

const AguiPane: React.FC<{ frame: number }> = ({ frame }) => {
  const reveal = revealValue(frame, AGUI_REVEAL_FRAME);
  const focus = focusValue(frame, KEYWORD_WINDOWS.agui);
  const rows = ["执行步骤", "工具动作", "中间结果", "专家反馈"];

  return (
    <div
      style={{
        minHeight: 372,
        boxSizing: "border-box",
        padding: "26px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderRadius: 28,
        opacity: reveal,
        translate: `0 ${10 * (1 - reveal)}px`,
        color: COLORS.white,
        background: "linear-gradient(145deg, #0b2d4e, #071d35)",
        border: `1px solid ${focus > 0.62 ? COLORS.cyan : COLORS.line}`,
        boxShadow:
          focus > 0.62
            ? "0 22px 62px rgba(45,212,207,0.14)"
            : "0 22px 60px rgba(0,0,0,0.24)",
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
          borderRadius: 22,
          background: COLORS.cyanSoft,
          border: `1px solid ${COLORS.cyan}66`,
        }}
      >
        <FeatureGlyph type="person" size={48} color={COLORS.cyan} />
      </div>
      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KeywordBadge english="AG-UI" chinese="流式交互" focus={focus} />
      </div>
      <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
        {rows.map((row, index) => {
          const rowReveal = revealValue(
            frame,
            AGUI_REVEAL_FRAME + 32 + index * 34,
          );
          return (
            <div
              key={row}
              style={{
                minHeight: 46,
                boxSizing: "border-box",
                padding: "9px 12px",
                display: "flex",
                alignItems: "center",
                gap: 11,
                borderRadius: 13,
                opacity: rowReveal,
                color: COLORS.white,
                background: "rgba(6,22,41,0.68)",
                border: `1px solid ${COLORS.line}`,
                fontSize: 18,
                fontWeight: 690,
              }}
            >
              <span style={{ color: COLORS.cyan, fontSize: 18 }}>●</span>
              {row}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 17,
          color: COLORS.cyan,
          fontSize: 19,
          lineHeight: 1.45,
          textAlign: "center",
          fontWeight: 760,
        }}
      >
        可观察 · 可干预 · 可追溯
      </div>
    </div>
  );
};

export const S05AgentArchitecture: React.FC<{
  durationInFrames: number;
}> = ({ durationInFrames }) => {
  const rawFrame = useCurrentFrame();
  const frame =
    rawFrame * (REFERENCE_DURATION_IN_FRAMES / Math.max(1, durationInFrames));
  const agenticReveal = revealValue(frame, 20);
  const agenticFocus = focusValue(frame, KEYWORD_WINDOWS.agentic);
  const opacity = interpolate(
    rawFrame,
    [0, 24, durationInFrames - 18, durationInFrames - 1],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="05 · AGENTIC ARCHITECTURE"
      title="有状态、可观察、可续接的智能体架构"
    >
      <div
        style={{
          position: "absolute",
          left: 112,
          right: 112,
          top: 244,
          bottom: 238,
          boxSizing: "border-box",
          padding: "22px 26px 26px",
          overflow: "hidden",
          borderRadius: 34,
          opacity,
          color: COLORS.white,
          background:
            "linear-gradient(145deg, rgba(13,45,77,0.92), rgba(6,22,41,0.95))",
          border: `1px solid rgba(45,212,207,${0.26 + agenticFocus * 0.48})`,
          boxShadow:
            agenticFocus > 0.62
              ? "0 30px 86px rgba(45,212,207,0.12)"
              : "0 30px 84px rgba(0,0,0,0.32)",
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            minHeight: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            opacity: agenticReveal,
          }}
        >
          <KeywordBadge
            english="Agentic Workflow"
            chinese="智能体工作流"
            focus={agenticFocus}
          />
          <div
            style={{
              color: COLORS.muted,
              fontSize: 19,
              lineHeight: 1.35,
              textAlign: "right",
            }}
          >
            从科研目标进入有状态任务图，再把执行过程流式交还专家
          </div>
        </div>

        <div
          style={{
            marginTop: 17,
            display: "grid",
            gridTemplateColumns: "292px 70px 1fr 70px 292px",
            gap: 12,
            alignItems: "center",
          }}
        >
          <GoalCard frame={frame} />
          <ArchitectureArrow frame={frame} revealAt={106} />
          <LangGraphPane frame={frame} />
          <ArchitectureArrow frame={frame} revealAt={AGUI_REVEAL_FRAME - 20} />
          <AguiPane frame={frame} />
        </div>
      </div>
    </SceneFrame>
  );
};
