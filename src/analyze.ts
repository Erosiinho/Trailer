import { execSync } from "node:child_process";
import { agent } from "./claude.js";
import { Storyboard } from "./storyboard.js";

const SYSTEM = `You are the producer of a short vertical promo video (about 30 seconds, 9:16) for a web app.
The tone is sober and elegant, like an Apple product film: few words, confident, no hype, no emoji, no exclamation marks.
You read the app's source code with your tools, then return a storyboard as structured output. You never modify files.`;

function packageManagers() {
  return ["pnpm", "npm", "yarn", "bun"].filter((pm) => {
    try {
      execSync(`command -v ${pm}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}

/** Reads the app folder and drafts the whole storyboard: copy, brand, dev server, mocks, scenes. */
export function analyze(appDir: string, lang: string) {
  const prompt = `Make the storyboard of a promo video for the app in the current folder.

## 1. Understand the app
Read the README, docs, package.json files and the front-end source (router, views, API client, styles).
Work out what the app is for, who it is for, and its 3 to 5 most convincing features.

## 2. Copy (language: ${lang})
- hook: 1 to 3 short lines stating the problem, before the app is named.
- tagline, scene headlines (2-5 words, the benefit), captions (one sentence), outro line.
- Concrete and specific to this app. No generic marketing phrases ("revolutionize", "seamless", "unlock").

## 3. Brand
Take the colors and font from the app's CSS/theme. The video theme should feel like the app: pick mode, a background, a surface, text, muted text, and the brand accent. Use a Google Fonts family (the app's own if it is one).
If the app has an icon (favicon, PWA icon, logo), give its path.

## 4. Running the front end
Screenshots are taken in a headless browser on a phone viewport (390x844), from the front-end dev server only: no backend, no database.
- dev.command starts that dev server on {port} (use dev.port as the port). Dependencies are already installed.
  Package managers available on this machine: ${packageManagers().join(", ") || "none"}. If the project's own package manager is missing, call the local binary directly (e.g. \`node_modules/.bin/vite --port {port} --strictPort\`), from dev.cwd.
- Make sure no dev proxy or env variable is needed to render; the browser intercepts backend calls before they leave.

## 5. Demo data (mocks)
Every backend call the screens make must be mocked, otherwise they show errors or empty states.
- Find the API client and every call made by the screens you picked (including calls on app load, SSE/WebSocket endpoints, and capability/config/user endpoints).
- Answer each with realistic, rich, coherent demo data in the exact shape the front end expects (read the types). It should look like a real user who has used the app for weeks.
- Event streams (text/event-stream): answer with body ":\\n\\n".
- Relative dates: write {{now}}, {{now-3d}}, {{now-6h}} etc. inside the JSON strings; they are replaced by ISO dates at capture time. Screens showing "today" need dates of today.
- If the app needs auth state in localStorage, provide it.
- Content shown in the app (user data, generated text) follows the app's own UI language; set locale accordingly.

## 6. Scenes
3 to 5 scenes, in the order that tells the story best: the core loop first, then depth (results, progress, settings last if at all).
Each scene is one screen: a route, optional actions (clicks to open a panel or a detail, a tab), and a focus element the camera scrolls to if the interesting part is below the fold.
Use selectors that exist in the source (text=…, CSS classes, aria labels). Avoid actions needing real hardware or network.

## 7. Stack
4 to 8 main technologies, short names (e.g. "Vue 3", "Fastify", "PostgreSQL", "Claude").`;

  return agent({ schema: Storyboard, system: SYSTEM, prompt, cwd: appDir });
}

/**
 * Second look: Claude sees the screenshots and the capture report (unmocked calls, page errors,
 * failed actions) and returns a corrected storyboard.
 */
export function review(appDir: string, story: Storyboard, report: string, screensDir: string) {
  const prompt = `You drafted this storyboard for the promo video of the app in the current folder:

\`\`\`json
${JSON.stringify(story, null, 2)}
\`\`\`

The screenshots were taken. Capture report:

${report}

Look at each screenshot in ${screensDir} (<scene id>.png is the full page, <scene id>.overlay.png the fixed bars) with the Read tool, and check them against the source:
- error messages, empty states, spinners or "loading" text mean a mock is missing or has the wrong shape;
- a scene that does not show what its headline promises needs another route, other actions or another focus;
- broken layout, missing data, placeholder text.

Return the full corrected storyboard. Keep what works; change only what is needed.`;

  return agent({ schema: Storyboard, system: SYSTEM, prompt, cwd: appDir, addDirs: [screensDir] });
}
