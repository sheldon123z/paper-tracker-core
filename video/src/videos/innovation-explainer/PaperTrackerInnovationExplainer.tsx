import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { AmbientBackground } from "../../shared/components/AmbientBackground";
import { SubtitleTrack } from "../../shared/components/SubtitleTrack";
import captions from "./data/captions.json";
import { DURATION_IN_FRAMES, SCENES } from "./data/scenes";
import { S00ResearchPain } from "./scenes/S00ResearchPain";
import { S01NotJustReader } from "./scenes/S01NotJustReader";
import { S02KnowledgeAssets } from "./scenes/S02KnowledgeAssets";
import { S03EvidenceSynthesis } from "./scenes/S03EvidenceSynthesis";
import { S04ResearchAgentCore } from "./scenes/S04ResearchAgentCore";
import { S05AgentArchitecture } from "./scenes/S05AgentArchitecture";
import { S06SafeGovernance } from "./scenes/S06SafeGovernance";
import { S08FinalSummary } from "./scenes/S08FinalSummary";
import { SIntroStrategicPositioning } from "./scenes/SIntroStrategicPositioning";

const sceneComponents: Record<
  string,
  React.FC<{ durationInFrames: number }>
> = {
  "scene-intro": SIntroStrategicPositioning,
  "scene-00": S00ResearchPain,
  "scene-01": S01NotJustReader,
  "scene-02": S02KnowledgeAssets,
  "scene-04": S04ResearchAgentCore,
  "scene-architecture": S05AgentArchitecture,
  "scene-03": S03EvidenceSynthesis,
  "scene-06": S06SafeGovernance,
  "scene-outro": S08FinalSummary,
};

const SceneComponent: React.FC<{
  id: string;
  durationInFrames: number;
}> = ({ id, durationInFrames }) => {
  const Component = sceneComponents[id];
  if (!Component) {
    throw new Error(`Unknown innovation scene: ${id}`);
  }

  return <Component durationInFrames={durationInFrames} />;
};

export type PaperTrackerInnovationExplainerProps = {
  reviewMode: boolean;
};

export const PaperTrackerInnovationExplainer: React.FC<
  PaperTrackerInnovationExplainerProps
> = ({ reviewMode }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <AmbientBackground durationInFrames={DURATION_IN_FRAMES} />
      {SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          premountFor={fps}
        >
          <SceneComponent
            id={scene.id}
            durationInFrames={scene.durationInFrames}
          />
        </Sequence>
      ))}
      {!reviewMode ? (
        <Audio
          src={staticFile("innovation-explainer/audio/final-mix.wav")}
          volume={1}
        />
      ) : null}
      <SubtitleTrack
        captions={captions}
        cornerBadge={reviewMode ? "内容审阅版 · 无旁白" : undefined}
        singleLineLimitUnits={38}
      />
    </AbsoluteFill>
  );
};
