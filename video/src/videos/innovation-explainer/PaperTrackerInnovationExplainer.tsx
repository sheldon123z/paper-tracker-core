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
import { S04ResearchAgent } from "./scenes/S04ResearchAgent";
import { S05EfficiencyMechanism } from "./scenes/S05EfficiencyMechanism";
import { S06SafeGovernance } from "./scenes/S06SafeGovernance";
import { S07ValueClosing } from "./scenes/S07ValueClosing";
import { S08FinalSummary } from "./scenes/S08FinalSummary";
import { SIntroTitle } from "./scenes/SIntroTitle";

const sceneComponents: Record<
  string,
  React.FC<{ durationInFrames: number }>
> = {
  "scene-intro": SIntroTitle,
  "scene-00": S00ResearchPain,
  "scene-01": S01NotJustReader,
  "scene-02": S02KnowledgeAssets,
  "scene-03": S03EvidenceSynthesis,
  "scene-04": S04ResearchAgent,
  "scene-05": S05EfficiencyMechanism,
  "scene-06": S06SafeGovernance,
  "scene-07": S07ValueClosing,
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

export const PaperTrackerInnovationExplainer: React.FC = () => {
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
      <Audio
        src={staticFile("innovation-explainer/audio/final-mix.wav")}
        volume={1}
      />
      <SubtitleTrack captions={captions} />
    </AbsoluteFill>
  );
};
