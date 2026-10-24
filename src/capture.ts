import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Page, type Route } from "playwright";
import type { Capture, SceneCapture, Storyboard } from "./storyboard.js";

const SERVER_TIMEOUT_MS = 120_000;
/** Taller pages are cut: the camera never scrolls that far. */
const MAX_PAGE_HEIGHT = 6000;

export interface CaptureResult {
  capture: Capture;
  /** Problems worth a second look: unmocked calls, page errors, failed actions. */
  issues: string[];
}

/** Starts the front-end dev server, screenshots every scene with mocked backend calls. */
export async function capture(appDir: string, story: Storyboard, projectDir: string, url?: string): Promise<CaptureResult> {
  const screensDir = path.join(projectDir, "screens");
  await mkdir(screensDir, { recursive: true });
  const issues: string[] = [];

  // A free port rather than the storyboard's, which another dev server may hold.
  const port = story.dev.command.includes("{port}") ? await freePort() : story.dev.port;
  const started = url ? null : await startServer(appDir, story, port);
  const server = started?.child ?? null;
  const base = url ?? started!.base;
  const browser = await chromium.launch({
    // A fake microphone, so recording screens can be shown.
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });

  try {
    const context = await browser.newContext({
      viewport: story.viewport,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: story.colorScheme,
      locale: story.locale,
      serviceWorkers: "block",
      permissions: ["microphone", "notifications"],
    });
    // tsx compiles with keepNames, so functions passed to page.evaluate call a `__name` helper.
    await context.addInitScript("globalThis.__name = (fn) => fn;");
    if (story.localStorage.length) {
      await context.addInitScript((entries) => {
        for (const { key, value } of entries) localStorage.setItem(key, value);
      }, story.localStorage);
    }

    const unmocked = new Set<string>();
    await context.route("**/*", (route) => handle(route, story, unmocked));

    const scenes: Record<string, SceneCapture> = {};
    for (const scene of story.scenes) {
      const page = await context.newPage();
      page.on("pageerror", (e) => issues.push(`[${scene.id}] page error: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && issues.push(`[${scene.id}] console error: ${m.text().slice(0, 300)}`));

      await page.goto(base + scene.route, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      if (scene.waitFor) {
        await page
          .locator(scene.waitFor)
          .first()
          .waitFor({ state: "visible", timeout: 8000 })
          .catch(() => issues.push(`[${scene.id}] waitFor "${scene.waitFor}" never became visible`));
      }
      for (const action of scene.actions) {
        await act(page, action).catch((e: Error) =>
          issues.push(`[${scene.id}] action ${action.type} ${action.selector ?? ""} failed: ${e.message.split("\n")[0]}`),
        );
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);

      scenes[scene.id] = await shoot(page, scene.focus, path.join(screensDir, scene.id), (msg) => issues.push(`[${scene.id}] ${msg}`));
      await page.close();
      console.log(`  ✓ ${scene.id}`);
    }
    for (const call of unmocked) issues.push(`unmocked call answered 404: ${call}`);

    return { capture: { scenes, icon: await copyIcon(appDir, story, projectDir) }, issues };
  } finally {
    await browser.close();
    stopServer(server);
  }
}

async function handle(route: Route, story: Storyboard, unmocked: Set<string>) {
  const request = route.request();
  const { pathname, search } = new URL(request.url());
  const mock = story.mocks.find(
    (m) => (m.method === "ANY" || m.method === request.method()) && pathRegex(m.path).test(pathname),
  );
  if (mock) return route.fulfill({ status: mock.status, contentType: mock.contentType, body: fillDates(mock.body) });
  if (story.apiPrefixes.some((p) => pathname.startsWith(p))) {
    unmocked.add(`${request.method()} ${pathname}${search}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  }
  return route.continue();
}

/** `/api/sessions/:id/**` → regex on the pathname. */
function pathRegex(pattern: string) {
  const source = pattern
    .split(/(\*\*|\*|:[A-Za-z_]\w*)/)
    .map((part) => {
      if (part === "**") return ".*";
      if (part === "*" || part.startsWith(":")) return "[^/]+";
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}/?$`);
}

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;

/** {{now}}, {{now-3d}}, {{now+90m}} → ISO date. */
function fillDates(body: string) {
  return body.replace(/\{\{now(?:([+-]\d+)([smhdw]))?\}\}/g, (_, n?: string, unit?: keyof typeof UNIT_MS) =>
    new Date(Date.now() + (n ? Number(n) * UNIT_MS[unit!] : 0)).toISOString(),
  );
}

async function act(page: Page, action: Storyboard["scenes"][number]["actions"][number]) {
  const target = () => {
    if (!action.selector) throw new Error("selector missing");
    return page.locator(action.selector).first();
  };
  switch (action.type) {
    case "click": await target().click({ timeout: 5000 }); break;
    case "fill": await target().fill(action.value ?? "", { timeout: 5000 }); break;
    case "press": await page.keyboard.press(action.value ?? "Enter"); break;
    case "scroll": await target().scrollIntoViewIfNeeded({ timeout: 5000 }); break;
    case "wait": await page.waitForTimeout(action.ms ?? 1000); break;
  }
  await page.waitForTimeout(400);
}

/**
 * Two images per scene: the full page without its fixed/sticky bars, and those bars alone on a
 * transparent viewport-sized image. The video scrolls the first under the second, like the real app.
 */
async function shoot(page: Page, focus: string | undefined, file: string, report: (msg: string) => void): Promise<SceneCapture> {
  const viewport = page.viewportSize()!;
  const metrics = await page.evaluate(() => {
    let fixed = 0;
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const pos = getComputedStyle(el).position;
      if ((pos === "fixed" || pos === "sticky") && el.offsetWidth && el.offsetHeight) {
        el.dataset.trailerFixed = "";
        fixed++;
        // A frosted bar blurs what scrolls under it; the video can't, so it gets an opaque fill.
        const style = getComputedStyle(el);
        if (style.backdropFilter !== "none") {
          const [r, g, b] = (style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
          const srgb = style.backgroundColor.startsWith("color(srgb");
          if (r != null && g != null && b != null) {
            const k = srgb ? 255 : 1;
            el.style.setProperty("background-color", `rgb(${r * k}, ${g * k}, ${b * k})`, "important");
          }
        }
      }
    }
    const transparent = (c: string) => c === "transparent" || c === "rgba(0, 0, 0, 0)";
    // What shows at the top of the page: the first painted background from the element there up
    // to html, since apps often paint it on a wrapper (#app, a layout div) rather than on body.
    let background = "#ffffff";
    for (let el = document.elementFromPoint(document.documentElement.clientWidth / 2, 1); el; el = el.parentElement) {
      const style = getComputedStyle(el);
      // A gradient wins over the color under it: take its first stop.
      const stop = style.backgroundImage.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0];
      const bg = stop ?? style.backgroundColor;
      if (!transparent(bg)) {
        background = bg;
        break;
      }
    }
    return {
      fixed,
      height: document.documentElement.scrollHeight,
      width: document.documentElement.clientWidth,
      background,
    };
  });
  const height = Math.min(metrics.height, MAX_PAGE_HEIGHT);

  let scrollTo = 0;
  if (focus) {
    const top = await page
      .locator(focus)
      .first()
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY, undefined, { timeout: 3000 })
      .catch(() => null);
    if (top == null) report(`focus "${focus}" not found`);
    else scrollTo = Math.round(Math.max(0, Math.min(top - viewport.height * 0.22, height - viewport.height)));
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  // `transition: all` also animates visibility, which would keep hidden elements on screen a while.
  const noTransitions = "*, *::before, *::after { transition: none !important; }";
  const hideBars = await page.addStyleTag({ content: `${noTransitions} [data-trailer-fixed] { visibility: hidden !important; }` });
  await page.screenshot({ path: `${file}.png`, fullPage: true, clip: { x: 0, y: 0, width: metrics.width, height } });
  await hideBars.evaluate((el) => (el as Element).remove());

  if (metrics.fixed) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
    await page.waitForTimeout(300);
    const onlyBars = await page.addStyleTag({
      // html and body pseudo-elements escape `body *`: a fixed full-screen ::before wash would
      // otherwise cover the whole screen.
      content: `${noTransitions}
        html, body { background: transparent !important; }
        html::before, html::after, body::before, body::after { visibility: hidden !important; }
        body * { visibility: hidden !important; }
        [data-trailer-fixed], [data-trailer-fixed] * { visibility: visible !important; }`,
    });
    await page.screenshot({ path: `${file}.overlay.png`, omitBackground: true });
    await onlyBars.evaluate((el) => (el as Element).remove());
  }

  return {
    width: metrics.width,
    height,
    viewportHeight: viewport.height,
    scrollTo,
    background: metrics.background,
    overlay: metrics.fixed > 0,
  };
}

async function copyIcon(appDir: string, story: Storyboard, projectDir: string) {
  if (!story.app.icon) return null;
  const source = path.resolve(appDir, story.app.icon);
  if (!existsSync(source)) return null;
  const name = `icon${path.extname(source)}`;
  await copyFile(source, path.join(projectDir, name));
  return name;
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(appDir: string, story: Storyboard, port: number) {
  const command = story.dev.command.replaceAll("{port}", String(port));
  const cwd = path.resolve(appDir, story.dev.cwd);
  console.log(`  $ ${command}  (in ${path.relative(appDir, cwd) || "."})`);

  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    env: { ...process.env, ...story.dev.env, PORT: String(port), BROWSER: "none", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout!.on("data", (d: Buffer) => (log = (log + d.toString()).slice(-4000)));
  child.stderr!.on("data", (d: Buffer) => (log = (log + d.toString()).slice(-4000)));

  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`dev server exited (${child.exitCode}):\n${log}`);
    // Dev servers bind to IPv4 or IPv6 depending on how "localhost" resolves.
    for (const base of [`http://127.0.0.1:${port}`, `http://[::1]:${port}`]) {
      if (await fetch(`${base}/`).then(() => true, () => false)) return { child, base };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stopServer(child);
  throw new Error(`dev server not reachable on port ${port} after ${SERVER_TIMEOUT_MS / 1000}s:\n${log}`);
}

function stopServer(child: ChildProcess | null) {
  if (!child?.pid || child.exitCode != null) return;
  // The whole process group: the shell and the dev server it started.
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

export async function writeJson(file: string, data: unknown) {
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
}
