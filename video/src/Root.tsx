import "./index.css";
import { Composition, Folder } from "remotion";
import { PaperTrackerInnovationExplainer } from "./videos/innovation-explainer/PaperTrackerInnovationExplainer";
import {
  DURATION_IN_FRAMES as INNOVATION_DURATION_IN_FRAMES,
  FPS as INNOVATION_FPS,
  HEIGHT as INNOVATION_HEIGHT,
  WIDTH as INNOVATION_WIDTH,
} from "./videos/innovation-explainer/data/scenes";
import { PaperTrackerWorkflowExplainer } from "./videos/workflow-explainer/PaperTrackerWorkflowExplainer";
import {
  DURATION_IN_FRAMES as WORKFLOW_DURATION_IN_FRAMES,
  FPS as WORKFLOW_FPS,
  HEIGHT as WORKFLOW_HEIGHT,
  WIDTH as WORKFLOW_WIDTH,
} from "./videos/workflow-explainer/data/scenes";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="Paper-Tracker">
      <Composition
        id="PaperTrackerInnovationExplainer"
        component={PaperTrackerInnovationExplainer}
        durationInFrames={INNOVATION_DURATION_IN_FRAMES}
        fps={INNOVATION_FPS}
        width={INNOVATION_WIDTH}
        height={INNOVATION_HEIGHT}
        defaultProps={{ reviewMode: true }}
      />
      <Composition
        id="PaperTrackerWorkflowExplainer"
        component={PaperTrackerWorkflowExplainer}
        durationInFrames={WORKFLOW_DURATION_IN_FRAMES}
        fps={WORKFLOW_FPS}
        width={WORKFLOW_WIDTH}
        height={WORKFLOW_HEIGHT}
        defaultProps={{}}
      />
    </Folder>
  );
};
