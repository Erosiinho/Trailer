import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import type { TrailerProps } from "../src/storyboard";
import { fadeThrough } from "./fadeThrough";
import { Phone } from "./Phone";
import { FADE, FEATURE, sceneFrames, totalFrames } from "./timing";

type Theme = TrailerProps["story"]["theme"];

export function Trailer(props: TrailerProps) {
  const { story, capture, music } = props;
  const { theme } = story;
  useFont(theme.font);

  const durations = sceneFrames(props);
  const scenes: ReactNode[] = [
    <Hook key="hook" lines={story.hook} theme={theme} />,
    <Title key="title" name={story.app.name} tagline={story.app.tagline} icon={capture.icon} theme={theme} />,
    ...story.scenes.map((scene, i) => {
      const shot = capture.scenes[scene.id];
      return shot ? (
        <Feature
          key={scene.id}
          index={i}
          count={story.scenes.length}
          headline={scene.headline}
          caption={scene.caption}
          theme={theme}
          phone={(scroll) => <Phone id={scene.id} shot={shot} width={580} scroll={scroll} />}
          scrollTo={shot.scrollTo}
        />
      ) : (
        <AbsoluteFill key={scene.id} />
      );
    }),
    <Stack key="stack" items={story.stack} theme={theme} />,
    <Outro key="outro" name={story.app.name} line={story.outro.line} url={story.outro.url} icon={capture.icon} theme={theme} />,
  ];

  const total = totalFrames(props);
  return (
    <AbsoluteFill style={{ background: theme.background, color: theme.text, fontFamily: `"${theme.font}", Inter, system-ui, sans-serif` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at 50% 34%, color-mix(in srgb, ${theme.accent} ${theme.mode === "dark" ? 16 : 5}%, transparent), transparent 70%)`,
        }}
      />
      <TransitionSeries>
        {scenes.map((scene, i) => [
          i > 0 && (
            <TransitionSeries.Transition key={`t${i}`} presentation={fadeThrough()} timing={linearTiming({ durationInFrames: FADE })} />
          ),
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={durations[i]!}>
            {scene}
          </TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      {music && (
        <Audio
          src={staticFile(music)}
          volume={(f) => interpolate(f, [0, 20, total - 45, total], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
    </AbsoluteFill>
  );
}

/* ---------- motion ---------- */

/** Rises in from below with a soft blur, `delay` frames after the scene starts. */
function useRise(delay: number, distance = 36) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.9 }, durationInFrames: 28 });
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * distance}px)`,
    filter: `blur(${(1 - p) * 10}px)`,
  } satisfies CSSProperties;
}

function Rise({ delay, distance, style, children }: { delay: number; distance?: number; style?: CSSProperties; children: ReactNode }) {
  const motion = useRise(delay, distance);
  return <div style={{ ...style, ...motion }}>{children}</div>;
}

/* ---------- scenes ---------- */

function Hook({ lines, theme }: { lines: string[]; theme: Theme }) {
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 104px" }}>
      {lines.map((line, i) => (
        <Rise key={i} delay={10 + i * 30}>
          <p
            style={{
              margin: 0, fontSize: 84, fontWeight: 600, lineHeight: 1.12, letterSpacing: "-0.025em",
              color: i === lines.length - 1 && lines.length > 1 ? theme.muted : theme.text,
              marginTop: i ? 18 : 0,
            }}
          >
            {line}
          </p>
        </Rise>
      ))}
    </AbsoluteFill>
  );
}

function Icon({ src, size }: { src: string; size: number }) {
  return (
    <Img
      src={staticFile(src)}
      style={{ width: size, height: size, borderRadius: size * 0.225, boxShadow: "0 30px 60px -20px rgba(0,0,0,0.45)" }}
    />
  );
}

function Title({ name, tagline, icon, theme }: { name: string; tagline: string; icon: string | null; theme: Theme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 4, fps, config: { damping: 14, mass: 0.8 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 80px" }}>
      {icon && (
        <div style={{ transform: `scale(${0.6 + pop * 0.4})`, opacity: Math.min(1, pop * 1.5), marginBottom: 56 }}>
          <Icon src={icon} size={196} />
        </div>
      )}
      <Rise delay={12}>
        <h1 style={{ margin: 0, fontSize: 148, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{name}</h1>
      </Rise>
      <Rise delay={24}>
        <p style={{ margin: "32px 0 0", fontSize: 48, color: theme.muted, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{tagline}</p>
      </Rise>
    </AbsoluteFill>
  );
}

interface FeatureProps {
  index: number;
  count: number;
  headline: string;
  caption: string;
  theme: Theme;
  phone: (scroll: number) => ReactNode;
  scrollTo: number;
}

function Feature({ index, count, headline, caption, theme, phone, scrollTo }: FeatureProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 34 });
  const scroll = interpolate(frame, [40, FEATURE - 22], [0, scrollTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  // A slow push-in over the whole scene.
  const push = interpolate(frame, [0, FEATURE], [0.97, 1.0]);

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 150, left: 90, right: 90, textAlign: "center" }}>
        <Rise delay={0} distance={24}>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: "0.18em", color: theme.accent }}>
            {String(index + 1).padStart(2, "0")}
            <span style={{ color: theme.muted, opacity: 0.6 }}> / {String(count).padStart(2, "0")}</span>
          </p>
        </Rise>
        <Rise delay={5}>
          <h2 style={{ margin: "22px 0 0", fontSize: 80, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.04 }}>{headline}</h2>
        </Rise>
        <Rise delay={12}>
          <p style={{ margin: "24px auto 0", maxWidth: 820, fontSize: 38, color: theme.muted, lineHeight: 1.3 }}>{caption}</p>
        </Rise>
      </div>
      <div
        style={{
          position: "absolute", top: 590,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 160}px) scale(${push})`,
          transformOrigin: "50% 0",
        }}
      >
        {phone(scroll)}
      </div>
    </AbsoluteFill>
  );
}

function Stack({ items, theme }: { items: string[]; theme: Theme }) {
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px" }}>
      <Rise delay={2}>
        <p style={{ margin: "0 0 56px", fontSize: 34, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.muted }}>
          Built with
        </p>
      </Rise>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 22, maxWidth: 900 }}>
        {items.map((item, i) => (
          <Rise key={item} delay={10 + i * 4} distance={24}>
            <span
              style={{
                display: "inline-block", padding: "22px 40px", borderRadius: 999, fontSize: 42, fontWeight: 550,
                background: theme.surface, border: `1.5px solid color-mix(in srgb, ${theme.muted} 22%, transparent)`,
              }}
            >
              {item}
            </span>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Outro({ name, line, url, icon, theme }: { name: string; line: string; url?: string; icon: string | null; theme: Theme }) {
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 90px" }}>
      {icon && (
        <Rise delay={2}>
          <div style={{ marginBottom: 44 }}>
            <Icon src={icon} size={140} />
          </div>
        </Rise>
      )}
      <Rise delay={8}>
        <h1 style={{ margin: 0, fontSize: 110, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{name}</h1>
      </Rise>
      <Rise delay={18}>
        <p style={{ margin: "30px 0 0", fontSize: 46, color: theme.muted, lineHeight: 1.25 }}>{line}</p>
      </Rise>
      {url && (
        <Rise delay={30}>
          <p style={{ margin: "64px 0 0", fontSize: 36, fontWeight: 600, color: theme.accent, letterSpacing: "0.01em" }}>{url}</p>
        </Rise>
      )}
    </AbsoluteFill>
  );
}

/* ---------- font ---------- */

/** Loads a Google Fonts family before the first frame; falls back silently if it does not exist. */
function useFont(family: string) {
  const [handle] = useState(() => delayRender(`font ${family}`));
  useState(() => {
    const name = encodeURIComponent(family).replace(/%20/g, "+");
    const urls = [
      `https://fonts.googleapis.com/css2?family=${name}:wght@400;500;600;700&display=block`,
      `https://fonts.googleapis.com/css2?family=${name}&display=block`,
    ];
    (async () => {
      for (const url of urls) {
        const res = await fetch(url).catch(() => null);
        if (!res?.ok) continue;
        const style = document.createElement("style");
        style.textContent = await res.text();
        document.head.appendChild(style);
        await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px "${family}"`))).catch(() => {});
        break;
      }
    })().finally(() => continueRender(handle));
  });
}
