import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";

/**
 * The outgoing scene fades out completely before the next one fades in. Scenes share the same
 * layout (headline on top, phone below), so a plain cross-fade would show two of each at once.
 */
function FadeThrough({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Record<string, never>>) {
  const opacity =
    presentationDirection === "exiting"
      ? interpolate(presentationProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" })
      : interpolate(presentationProgress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

export function fadeThrough(): TransitionPresentation<Record<string, never>> {
  return { component: FadeThrough, props: {} };
}
