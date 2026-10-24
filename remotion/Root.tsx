import { Composition } from "remotion";
import type { TrailerProps } from "../src/storyboard";
import { Trailer } from "./Trailer";
import { FPS, HEIGHT, WIDTH, totalFrames } from "./timing";

/** Shown in the Studio before real props are passed (`trailer <app> --studio` passes them). */
const placeholder: TrailerProps = {
  story: {
    app: { name: "App", tagline: "Run `trailer <app-folder> --studio`" },
    hook: ["Point it at an app.", "Get a promo video."],
    theme: {
      mode: "dark", background: "#0e0f12", surface: "#1a1c21", text: "#f4f5f7",
      muted: "#9097a3", accent: "#8ea2ff", font: "Inter",
    },
    dev: { cwd: ".", command: "", port: 5173, env: {} },
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    locale: "en-US",
    apiPrefixes: [],
    mocks: [],
    localStorage: [],
    scenes: [],
    stack: ["Remotion", "Playwright", "Claude"],
    outro: { line: "Made with Trailer" },
  },
  capture: { scenes: {}, icon: null },
  music: null,
};

export function Root() {
  return (
    <Composition
      id="Trailer"
      component={Trailer}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={totalFrames(placeholder)}
      defaultProps={placeholder}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props) })}
    />
  );
}
