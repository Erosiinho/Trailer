import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { analyze, review } from "./analyze.js";
import { capture, writeJson } from "./capture.js";
import { render } from "./render.js";
import { Storyboard, type Capture, type TrailerProps } from "./storyboard.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `trailer: a vertical promo video from an app folder

Usage: trailer <app-folder> [options]

  --fresh            redo the analysis even if a storyboard exists
  --skip-capture     reuse the screenshots already taken
  --reviews <n>      rounds of visual review by Claude after capture (default 1, 0 to skip)
  --url <url>        screenshot an app already running instead of starting its dev server
  --lang <code>      language of the video's copy (default en)
  --music <file>     soundtrack (mp3, wav, m4a), faded in and out
  --out <file>       output video (default projects/<app>/trailer.mp4)
  --studio           open Remotion Studio on the project instead of rendering
  -h, --help

Each app gets a folder in projects/<app>/: storyboard.json (edit it and rerun to change the copy,
mocks or scenes), screens/, and the video.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fresh: { type: "boolean", default: false },
    "skip-capture": { type: "boolean", default: false },
    reviews: { type: "string", default: "1" },
    url: { type: "string" },
    lang: { type: "string", default: "en" },
    music: { type: "string" },
    out: { type: "string" },
    studio: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

/** Libraries unpacked by scripts/browser-libs.sh, for machines where Chromium's are missing. */
function useBundledBrowserLibs() {
  const libs = path.join(ROOT, ".browser-libs");
  if (!existsSync(libs)) return;
  const dir = path.join(libs, "root/usr/lib/x86_64-linux-gnu");
  process.env.LD_LIBRARY_PATH = [dir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  process.env.FONTCONFIG_FILE ??= path.join(libs, "fonts.conf");
}

async function main() {
  useBundledBrowserLibs();
  const [target] = positionals;
  if (values.help || !target) {
    console.log(HELP);
    process.exit(target || values.help ? 0 : 1);
  }
  const appDir = path.resolve(target);
  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) throw new Error(`not a folder: ${appDir}`);

  const slug = path.basename(appDir).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const projectDir = path.join(ROOT, "projects", slug);
  const screensDir = path.join(projectDir, "screens");
  const storyFile = path.join(projectDir, "storyboard.json");
  const captureFile = path.join(projectDir, "capture.json");
  await mkdir(projectDir, { recursive: true });

  // 1. Storyboard
  let story: Storyboard;
  if (existsSync(storyFile) && !values.fresh) {
    story = Storyboard.parse(JSON.parse(await readFile(storyFile, "utf8")));
    console.log(`Storyboard: ${rel(storyFile)} (--fresh to redo it)`);
  } else {
    console.log(`Reading ${appDir} with Claude… (a few minutes)`);
    story = await analyze(appDir, values.lang);
    await writeJson(storyFile, story);
    console.log(`Storyboard written: ${rel(storyFile)}`);
  }
  console.log(`  ${story.app.name}: ${story.app.tagline}`);
  story.scenes.forEach((s, i) => console.log(`  ${i + 1}. ${s.headline} (${s.route})`));

  // 2. Screenshots, then Claude checks them and fixes the storyboard if needed.
  let shots: Capture;
  if (values["skip-capture"] && existsSync(captureFile)) {
    shots = JSON.parse(await readFile(captureFile, "utf8"));
  } else {
    let rounds = Number(values.reviews);
    for (;;) {
      console.log("Capturing screens…");
      const { capture: result, issues } = await capture(appDir, story, projectDir, values.url);
      shots = result;
      await writeJson(captureFile, shots);
      if (issues.length) console.log(issues.map((i) => `  ! ${i}`).join("\n"));
      if (rounds-- <= 0) break;

      console.log("Claude is reviewing the screenshots…");
      const report = issues.length ? issues.map((i) => `- ${i}`).join("\n") : "No technical issue detected.";
      const fixed = await review(appDir, story, report, screensDir);
      if (JSON.stringify(fixed) === JSON.stringify(story)) {
        console.log("  Screens approved.");
        break;
      }
      story = fixed;
      await writeJson(storyFile, story);
      console.log("  Storyboard corrected, capturing again.");
    }
  }

  // 3. Video
  let music: string | null = null;
  if (values.music) {
    music = `music${path.extname(values.music)}`;
    await copyFile(path.resolve(values.music), path.join(projectDir, music));
  }
  const props: TrailerProps = { story, capture: shots!, music };
  const propsFile = path.join(projectDir, "props.json");
  await writeJson(propsFile, props);

  if (values.studio) {
    const studio = spawn(
      path.join(ROOT, "node_modules/.bin/remotion"),
      ["studio", "remotion/index.ts", "--public-dir", projectDir, "--props", propsFile],
      { cwd: ROOT, stdio: "inherit" },
    );
    await new Promise((r) => studio.on("close", r));
    return;
  }

  const output = path.resolve(values.out ?? path.join(projectDir, "trailer.mp4"));
  console.log("Rendering…");
  await render(props, projectDir, output);
  console.log(`Done: ${output}`);
}

function rel(file: string) {
  return path.relative(process.cwd(), file);
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
