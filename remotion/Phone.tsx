import { Img, staticFile } from "remotion";
import type { SceneCapture } from "../src/storyboard";

/** Status bar height of the viewport, in CSS pixels of the captured page. */
const STATUS_BAR = 50;
const BEZEL = 13;

interface Props {
  id: string;
  shot: SceneCapture;
  /** Phone width in video pixels. */
  width: number;
  /** Current scroll of the page, in CSS pixels. */
  scroll: number;
}

/** An iPhone drawn in CSS around the captured page, scrolled to `scroll`. */
export function Phone({ id, shot, width, scroll }: Props) {
  const screenW = width - BEZEL * 2;
  const scale = screenW / shot.width;
  const bar = STATUS_BAR * scale;
  const viewportH = shot.viewportHeight * scale;
  const ink = isDark(shot.background) ? "#ffffff" : "#0b0b0d";

  return (
    <div
      style={{
        width,
        padding: BEZEL,
        borderRadius: 88,
        background: "linear-gradient(145deg, #2a2b30, #0b0b0d 40%, #1c1d21)",
        boxShadow: "0 60px 120px -30px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06) inset",
      }}
    >
      <div
        style={{
          position: "relative",
          height: bar + viewportH,
          borderRadius: 76,
          overflow: "hidden",
          background: shot.background,
        }}
      >
        <div style={{ position: "absolute", top: bar, left: 0, right: 0, height: viewportH, overflow: "hidden" }}>
          <Img
            src={staticFile(`screens/${id}.png`)}
            style={{ width: screenW, display: "block", transform: `translateY(${-scroll * scale}px)` }}
          />
          {shot.overlay && (
            <Img
              src={staticFile(`screens/${id}.overlay.png`)}
              style={{ position: "absolute", inset: 0, width: screenW, height: viewportH }}
            />
          )}
        </div>
        <StatusBar height={bar} scale={scale} ink={ink} background={shot.background} />
      </div>
    </div>
  );
}

function StatusBar({ height, scale, ink, background }: { height: number; scale: number; ink: string; background: string }) {
  const s = (n: number) => n * scale;
  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0, right: 0, height, background,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${s(4)}px ${s(30)}px 0 ${s(36)}px`, color: ink,
        fontFamily: "-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: s(16), fontWeight: 600, letterSpacing: -0.2 }}>9:41</span>
      <div
        style={{
          position: "absolute", left: "50%", top: s(11), transform: "translateX(-50%)",
          width: s(122), height: s(35), borderRadius: s(20), background: "#000",
        }}
      />
      <svg width={s(70)} height={s(13)} viewBox="0 0 70 13" fill={ink}>
        {/* signal */}
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="6" width="3" height="6" rx="1" />
        <rect x="10" y="3.5" width="3" height="8.5" rx="1" />
        <rect x="15" y="1" width="3" height="11" rx="1" />
        {/* wifi */}
        <path d="M31.5 3.2a10 10 0 0 1 13 0l-1.4 1.5a8 8 0 0 0-10.2 0zM34 6a6.2 6.2 0 0 1 8 0l-1.4 1.5a4.2 4.2 0 0 0-5.2 0zM36.6 8.8a2.3 2.3 0 0 1 2.8 0L38 10.4z" />
        {/* battery */}
        <rect x="50" y="1" width="17" height="10.5" rx="3" fill="none" stroke={ink} strokeOpacity="0.4" />
        <rect x="51.8" y="2.8" width="13.4" height="6.9" rx="1.6" />
        <rect x="68" y="4.2" width="1.5" height="4" rx="0.7" fillOpacity="0.4" />
      </svg>
    </div>
  );
}

function isDark(color: string) {
  // oklch()/oklab() start with the perceived lightness, 0 to 1 (or a percentage).
  const ok = color.match(/^okl(?:ch|ab)\(\s*([\d.]+)(%?)/);
  if (ok) return Number(ok[1]) / (ok[2] ? 100 : 1) < 0.6;
  const rgb = color.startsWith("#")
    ? (color.slice(1).length === 3 ? color.slice(1).split("").map((c) => c + c) : color.slice(1).match(/../g)!).map((h) => parseInt(h, 16))
    : (color.match(/[\d.]+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
  const [r, g, b] = rgb as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}
