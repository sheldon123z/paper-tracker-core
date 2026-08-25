import { useCurrentFrame } from "remotion";
import {
  PainSolutionMatrix,
  PainSolutionStageFrame,
} from "./PainSolutionMatrix";

export const S00ResearchPain: React.FC<{ durationInFrames: number }> = () => {
  const frame = useCurrentFrame();
  return (
    <PainSolutionStageFrame frame={frame} phase="pain">
      <PainSolutionMatrix
        variant="pain-only"
        frame={frame}
        rowRevealFrames={[18, 48, 78]}
        rowFocusFrames={[112, 162, 216]}
      />
    </PainSolutionStageFrame>
  );
};
