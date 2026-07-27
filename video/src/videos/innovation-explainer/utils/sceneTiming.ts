import { useCurrentFrame } from "remotion";

export const useScaledSceneFrame = (
  durationInFrames: number,
  referenceDurationInFrames: number,
) => {
  const rawFrame = useCurrentFrame();
  const timingScale = durationInFrames / referenceDurationInFrames;
  return {
    frame: rawFrame / timingScale,
    timingScale,
    scaleFrame: (referenceFrame: number) =>
      Math.max(1, Math.round(referenceFrame * timingScale)),
  };
};
