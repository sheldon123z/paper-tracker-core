import { useCurrentFrame } from "remotion";
import {
  PainSolutionMatrix,
  PainSolutionStageFrame,
} from "./PainSolutionMatrix";

export const S01NotJustReader: React.FC<{
  durationInFrames: number;
}> = () => {
  const frame = useCurrentFrame();
  return (
    <PainSolutionStageFrame frame={frame} phase="solution">
      <PainSolutionMatrix
        variant="mapping"
        frame={frame}
        methodRevealFrames={[12, 82, 152]}
      />
    </PainSolutionStageFrame>
  );
};
