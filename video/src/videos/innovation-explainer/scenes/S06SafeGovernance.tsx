import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  FeatureGlyph,
  type GlyphType,
} from "../../../shared/components/FeatureGlyph";
import { SceneFrame } from "../../../shared/components/SceneFrame";
import { COLORS, FONT_FAMILY } from "../../../shared/theme";
import { useScaledSceneFrame } from "../utils/sceneTiming";

const Arrow: React.FC<{ startFrame: number; timingScale: number }> = ({
  startFrame,
  timingScale,
}) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        color: COLORS.cyan,
        fontSize: 34,
        fontWeight: 700,
        textAlign: "center",
        opacity: interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      →
    </div>
  );
};

const AccessCell: React.FC<{
  type: GlyphType;
  title: string;
  detail?: string;
  accent: string;
  startFrame: number;
  timingScale: number;
  titleSize?: number;
}> = ({
  type,
  title,
  detail,
  accent,
  startFrame,
  timingScale,
  titleSize = 25,
}) => {
  const frame = useCurrentFrame() / timingScale;

  return (
    <div
      style={{
        height: 136,
        borderRadius: 24,
        padding: "0 20px",
        background:
          "linear-gradient(145deg, rgba(18,59,98,0.9), rgba(6,22,41,0.88))",
        border: `1px solid ${accent}66`,
        display: "flex",
        alignItems: "center",
        gap: 17,
        opacity: interpolate(frame, [startFrame, startFrame + 28], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `${interpolate(
          frame,
          [startFrame, startFrame + 28],
          [-18, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px 0`,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 17,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}18`,
          border: `1px solid ${accent}55`,
        }}
      >
        <FeatureGlyph type={type} size={40} color={accent} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: COLORS.white,
            fontSize: titleSize,
            lineHeight: 1.22,
            fontWeight: 730,
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {detail ? (
          <div
            style={{
              marginTop: 7,
              color: COLORS.muted,
              fontSize: 17,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const S06SafeGovernance: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { frame, timingScale } = useScaledSceneFrame(durationInFrames, 360);
  const columns = "250px 44px 410px 44px 280px 44px 280px";

  return (
    <SceneFrame
      durationInFrames={durationInFrames}
      eyebrow="06 · LOCAL GOVERNANCE"
      title="电力科研数据不出本地，智能体不越权限"
    >
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 250,
          height: 530,
          borderRadius: 54,
          border: `2px solid ${COLORS.cyan}88`,
          background: "rgba(6,22,41,0.3)",
          boxShadow:
            "0 0 100px rgba(45,212,207,0.1), inset 0 0 80px rgba(45,212,207,0.04)",
          opacity: interpolate(frame, [0, 45], [0.1, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 45], [1.025, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 25,
            left: 54,
            color: COLORS.cyan,
            fontSize: 19,
            letterSpacing: 4,
            fontWeight: 700,
          }}
        >
          本地安全边界
        </div>

        <div
          style={{
            position: "absolute",
            top: 62,
            left: 52,
            right: 52,
            display: "grid",
            gridTemplateColumns: columns,
            justifyContent: "center",
            alignItems: "center",
            color: COLORS.muted,
            fontSize: 18,
            fontWeight: 650,
            textAlign: "center",
          }}
        >
          <div>用户身份</div>
          <div />
          <div>可访问的论文范围</div>
          <div />
          <div>授权范围内分析</div>
          <div />
          <div>可追溯输出</div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 105,
            left: 52,
            right: 52,
            display: "grid",
            gridTemplateColumns: columns,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <AccessCell
            type="person"
            title="公共库用户"
            accent={COLORS.blue}
            startFrame={42}
            timingScale={timingScale}
          />
          <Arrow startFrame={58} timingScale={timingScale} />
          <AccessCell
            type="library"
            title="公共论文库"
            detail="只读取公共论文"
            accent={COLORS.blue}
            startFrame={52}
            timingScale={timingScale}
          />
          <Arrow startFrame={68} timingScale={timingScale} />
          <AccessCell
            type="model"
            title="本地分析"
            detail="不读取未授权内容"
            accent={COLORS.cyan}
            startFrame={62}
            timingScale={timingScale}
          />
          <Arrow startFrame={78} timingScale={timingScale} />
          <AccessCell
            type="report"
            title="可追溯结果"
            accent={COLORS.blue}
            startFrame={72}
            timingScale={timingScale}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: 258,
            left: 52,
            right: 52,
            display: "grid",
            gridTemplateColumns: columns,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <AccessCell
            type="person"
            title="部门授权用户"
            accent={COLORS.cyan}
            startFrame={88}
            timingScale={timingScale}
          />
          <Arrow startFrame={104} timingScale={timingScale} />
          <AccessCell
            type="library"
            title="公共库 + 本部门私有库"
            detail="部门知识不跨越权限边界"
            accent={COLORS.cyan}
            startFrame={98}
            timingScale={timingScale}
            titleSize={24}
          />
          <Arrow startFrame={114} timingScale={timingScale} />
          <AccessCell
            type="model"
            title="本地分析"
            detail="仍在授权范围内"
            accent={COLORS.cyan}
            startFrame={108}
            timingScale={timingScale}
          />
          <Arrow startFrame={124} timingScale={timingScale} />
          <AccessCell
            type="report"
            title="可追溯结果"
            accent={COLORS.cyan}
            startFrame={118}
            timingScale={timingScale}
          />
        </div>

        <div
          style={{
            position: "absolute",
            left: 300,
            right: 300,
            bottom: 24,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          {["本地离线", "分级授权", "全程留痕"].map((label, index) => (
            <div
              key={label}
              style={{
                padding: "14px 18px",
                borderRadius: 16,
                textAlign: "center",
                background: index === 1 ? COLORS.cyanSoft : COLORS.blueSoft,
                border: `1px solid ${index === 1 ? COLORS.cyan : COLORS.blue}77`,
                color: COLORS.white,
                fontSize: 24,
                fontWeight: 740,
                opacity: interpolate(
                  frame,
                  [[12, 98, 110][index], [32, 118, 130][index]],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                ),
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
};
