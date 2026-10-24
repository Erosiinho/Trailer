import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TrailerProps } from "./storyboard.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Renders the Remotion composition to an H.264 MP4, files in `projectDir` served as static files. */
export async function render(props: TrailerProps, projectDir: string, output: string) {
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion/index.ts"),
    publicDir: projectDir,
  });
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Trailer", inputProps });

  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 18,
    imageFormat: "jpeg",
    jpegQuality: 95,
    outputLocation: output,
    inputProps,
    concurrency: Math.max(1, Math.floor(cpus().length / 2)),
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct % 10 === 0 && pct !== last) {
        last = pct;
        process.stdout.write(`  ${pct}%${pct === 100 ? "\n" : ""}`);
      }
    },
  });
}
