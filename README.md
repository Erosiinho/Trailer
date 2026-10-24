# Trailer

Point it at a web app's folder, get a vertical promo video (1080×1920, about 30 seconds): a hook, the app's name, its key screens in an iPhone frame with headlines, the stack, and a closing card. The tone is sober and elegant, made for a portfolio or a social post.

```sh
./bin/trailer.mjs ../my-app
# → projects/my-app/trailer.mp4
```

## How it works

1. **Analyze.** Claude Code reads the app's source (read-only tools, headless `claude -p`, on your subscription) and writes a **storyboard**: the copy (hook, tagline, a headline and caption per scene, outro), brand colors and font taken from the app's CSS, how to start the front-end dev server, which screens to show and what to click on them, and **mock responses** for every backend call those screens make, filled with realistic demo data.
2. **Capture.** The dev server starts, and Playwright opens each scene on a phone viewport (390×844 at 3×). Backend calls are answered from the mocks, so no database or API needs to run. Each screen is saved twice: the full page, and its fixed bars (tab bar, docks) on their own, so the video can scroll the page under them.
3. **Review.** Claude looks at the screenshots and the capture report (unmocked calls, page errors, failed clicks) and fixes the storyboard if a screen shows an error, an empty state or the wrong thing. Then the screens are captured again.
4. **Render.** A [Remotion](https://www.remotion.dev) composition turns the storyboard and screenshots into an H.264 MP4.

Each app gets a folder in `projects/<app>/`:

```
storyboard.json   the whole plan: edit it and rerun to change copy, colors, scenes or mocks
screens/          the screenshots
capture.json      what was measured on each screen (page height, scroll target, background)
trailer.mp4       the video
```

A storyboard that exists is reused, so after editing it a rerun only captures and renders again.

## Options

```
--fresh            redo the analysis even if a storyboard exists
--skip-capture     reuse the screenshots already taken (copy or timing changes only)
--reviews <n>      rounds of visual review after capture (default 1, 0 to skip)
--url <url>        screenshot an app already running instead of starting its dev server
--lang <code>      language of the video's copy (default en)
--music <file>     soundtrack, faded in and out
--out <file>       output path
--studio           open Remotion Studio to preview and tweak instead of rendering
```

## Requirements

- Node 20+, and `npm install` here.
- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude`). `TRAILER_MODEL` changes the model (default `claude-opus-5-5`).
- The target app's dependencies installed, so its dev server can start.
- Playwright's Chromium (`npx playwright install chromium` if missing). Remotion downloads its own headless browser on the first render.

## Limits

- Web front ends only, captured on a phone viewport.
- No music is chosen for you: pass a royalty-free track with `--music`.
- Mocks come from reading the code, so an unusual API layer can need a manual fix in `storyboard.json`; the capture report lists every call left unmocked.

## Layout

```
src/cli.ts          the pipeline
src/analyze.ts      prompts for the storyboard and the visual review
src/claude.ts       headless Claude Code call with structured output
src/capture.ts      dev server, mocks, screenshots
src/render.ts       Remotion bundle and render
src/storyboard.ts   storyboard schema (zod), shared by every step
remotion/           the video: scenes, phone frame, timing
```
