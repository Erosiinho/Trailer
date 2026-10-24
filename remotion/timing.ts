import type { TrailerProps } from "../src/storyboard";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** Cross-fade between two scenes. */
export const FADE = 18;

export const hookFrames = (lines: number) => 36 + lines * 34;
export const TITLE = 90;
export const FEATURE = 150;
export const STACK = 96;
export const OUTRO = 120;

export function sceneFrames(props: TrailerProps) {
  return [
    hookFrames(props.story.hook.length),
    TITLE,
    ...props.story.scenes.map(() => FEATURE),
    STACK,
    OUTRO,
  ];
}

export function totalFrames(props: TrailerProps) {
  const scenes = sceneFrames(props);
  return scenes.reduce((a, b) => a + b, 0) - FADE * (scenes.length - 1);
}
