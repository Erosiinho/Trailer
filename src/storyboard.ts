import { z } from "zod";

/**
 * The storyboard: everything Claude works out from the app's source, and the single input of the
 * capture and render steps. It is saved as `storyboard.json` so it can be edited by hand and replayed.
 */

const Action = z.object({
  type: z.enum(["click", "fill", "press", "wait", "scroll"]),
  selector: z.string().optional().describe("Playwright selector (CSS, text=…, role=…). Required for click, fill and scroll"),
  value: z.string().optional().describe("Text for fill, key for press (e.g. Enter)"),
  ms: z.number().optional().describe("Duration for wait"),
});
export type Action = z.infer<typeof Action>;

const Mock = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "ANY"]),
  path: z
    .string()
    .describe("Request pathname as the browser sends it, `:param` or `*` for one segment, `**` for the rest (e.g. /api/sessions/:id)"),
  status: z.number().default(200),
  contentType: z.string().default("application/json"),
  body: z
    .string()
    .describe("Response body as a string (JSON text for JSON). Dates may use {{now}}, {{now-3d}}, {{now+2h}}, {{now-90m}}"),
});
export type Mock = z.infer<typeof Mock>;

const Scene = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).describe("kebab-case, used as the screenshot file name"),
  route: z.string().describe("Path to open, relative to the dev server (e.g. /sessions/demo)"),
  headline: z.string().describe("2-5 words shown above the phone, the benefit not the feature name"),
  caption: z.string().describe("One sentence, at most 14 words"),
  actions: z.array(Action).default([]).describe("Interactions before the screenshot (open a panel, select a tab…)"),
  waitFor: z.string().optional().describe("Selector that must be visible before acting"),
  focus: z.string().optional().describe("Selector of the element the camera scrolls to during the scene"),
});
export type Scene = z.infer<typeof Scene>;

export const Storyboard = z.object({
  app: z.object({
    name: z.string(),
    tagline: z.string().describe("At most 7 words"),
    icon: z.string().optional().describe("Path of a square icon (png or svg), relative to the app folder"),
  }),
  hook: z.array(z.string()).min(1).max(3).describe("1-3 short lines stating the problem the app solves, shown before the name"),
  theme: z.object({
    mode: z.enum(["dark", "light"]),
    background: z.string().describe("Video background, hex"),
    surface: z.string().describe("Slightly raised surface (chips), hex"),
    text: z.string().describe("hex"),
    muted: z.string().describe("hex"),
    accent: z.string().describe("The app's brand color, hex"),
    font: z.string().describe("A Google Fonts family for the video's text, ideally the app's own"),
  }),
  dev: z.object({
    cwd: z.string().describe("Folder to run the command in, relative to the app folder"),
    command: z.string().describe("Shell command starting the front-end dev server; {port} is replaced by the port"),
    port: z.number(),
    env: z.record(z.string(), z.string()).default({}),
  }),
  viewport: z.object({ width: z.number(), height: z.number() }).default({ width: 390, height: 844 }),
  colorScheme: z.enum(["light", "dark"]).default("light").describe("prefers-color-scheme used for the screenshots"),
  locale: z.string().default("en-US").describe("Browser locale for the screenshots, matching the app's UI language"),
  apiPrefixes: z.array(z.string()).describe("Path prefixes of backend calls (e.g. /api). Unmocked calls under them answer 404"),
  mocks: z.array(Mock).describe("First match wins: put specific paths before wildcards"),
  localStorage: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  scenes: z.array(Scene).min(2).max(6),
  stack: z.array(z.string()).min(2).max(8).describe("Technologies, short names"),
  outro: z.object({
    line: z.string().describe("A closing line, at most 8 words"),
    url: z.string().optional(),
  }),
});
export type Storyboard = z.infer<typeof Storyboard>;

/** What the capture step measured on each screen, read by the video. */
export type SceneCapture = {
  /** Page size in CSS pixels. */
  width: number;
  height: number;
  viewportHeight: number;
  /** Scroll position (CSS px) the camera moves to; 0 when the scene stays still. */
  scrollTo: number;
  /** Page background behind the status bar. */
  background: string;
  /** Fixed and sticky elements (tab bars, docks) captured apart, laid over the screen. */
  overlay: boolean;
};

export type Capture = {
  scenes: Record<string, SceneCapture>;
  icon: string | null;
};

/** Everything the Remotion composition receives. */
export type TrailerProps = {
  story: Storyboard;
  capture: Capture;
  music: string | null;
};
