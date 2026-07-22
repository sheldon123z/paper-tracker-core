import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { AmbientBackground } from "../../shared/components/AmbientBackground";
import { SubtitleTrack } from "../../shared/components/SubtitleTrack";
import { COLORS } from "../../shared/theme";
import captions from "./data/captions.json";
import { DURATION_IN_FRAMES, FPS, SCENES } from "./data/scenes";
import { S00Opening } from "./scenes/S00Opening";
import { S01Overview } from "./scenes/S01Overview";
import { S02LocalImport } from "./scenes/S02LocalImport";
import { S03LibraryScopes } from "./scenes/S03LibraryScopes";
import { S04LocalAssistant } from "./scenes/S04LocalAssistant";
import { S05ResearchWorkflow } from "./scenes/S05ResearchWorkflow";
import { S06Governance } from "./scenes/S06Governance";
import { S07Closing } from "./scenes/S07Closing";

const SceneComponent: React.FC<{
  id: string;
  durationInFrames: number;
}> = ({ id, durationInFrames }) => {
  if (id === "scene-00") {
    return <S00Opening durationInFrames={durationInFrames} />;
  }
  if (id === "scene-01") {
    return <S01Overview durationInFrames={durationInFrames} />;
  }
  if (id === "scene-02") {
    return <S02LocalImport durationInFrames={durationInFrames} />;
  }
  if (id === "scene-03") {
    return <S03LibraryScopes durationInFrames={durationInFrames} />;
  }
  if (id === "scene-04") {
    return <S04LocalAssistant durationInFrames={durationInFrames} />;
  }
  if (id === "scene-05") {
    return <S05ResearchWorkflow durationInFrames={durationInFrames} />;
  }
  if (id === "scene-06") {
    return <S06Governance durationInFrames={durationInFrames} />;
  }
  if (id === "scene-07") {
    return <S07Closing durationInFrames={durationInFrames} />;
  }

  throw new Error(`Unknown workflow scene: ${id}`);
};

export const PaperTrackerWorkflowExplainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <AmbientBackground durationInFrames={DURATION_IN_FRAMES} />
      {SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          premountFor={FPS}
        >
          <SceneComponent
            id={scene.id}
            durationInFrames={scene.durationInFrames}
          />
        </Sequence>
      ))}
      <Audio
        src={staticFile("workflow-explainer/audio/final-mix.wav")}
        volume={1}
      />
      <SubtitleTrack captions={captions} />
    </AbsoluteFill>
  );
};
