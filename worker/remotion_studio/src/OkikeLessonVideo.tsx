import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";

export interface CaptionWord {
  word: string;
  startFrame: number;
  endFrame: number;
}

export interface StatItem {
  label: string;
  percent: number;
  highlight?: boolean;
}

export interface V5SceneSpec {
  template: string;
  heading: string;
  subtitle?: string;
  bullets?: string[];
  codeSnippet?: string | null;
  defenseLabel?: string | null;
  stats?: StatItem[];
  durationInFrames: number;
}

export interface OkikeV5Props {
  courseTitle: string;
  hostName: string;
  durationInFrames: number;
  audioFile: string;
  introHostVideo: string;
  recapHostVideo: string;
  captionWords: CaptionWord[];
  scenes: V5SceneSpec[];
}

const INK = "#0E0E0E";
const SURFACE = "#161614";
const BORDER = "#2E2E2A";
const LIME = "#E3EE32";
const LAVENDER = "#C4B0F0";
const PAPER = "#F7F7F2";
const MUTED = "#A6A69E";
const DANGER = "#FF5A5F";

const FONT_STACK =
  "'Bricolage Grotesque', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

function splitPair(raw: string): [string, string] {
  const idx = raw.indexOf(":");
  if (idx > 0 && idx < 32) {
    return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
  }
  return [raw.trim(), ""];
}

const KineticCaptions: React.FC<{ words: CaptionWord[]; frame: number }> = ({
  words,
  frame,
}) => {
  if (!words.length) return null;
  let activeIdx = words.findIndex(
    (w) => frame >= w.startFrame && frame <= w.endFrame
  );
  if (activeIdx < 0) {
    const nextIdx = words.findIndex((w) => w.startFrame > frame);
    activeIdx = nextIdx === -1 ? words.length - 1 : Math.max(0, nextIdx - 1);
  }
  const windowStart = Math.floor(activeIdx / 6) * 6;
  const visible = words.slice(windowStart, windowStart + 6);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      <div
        style={{
          background: "rgba(14, 14, 14, 0.92)",
          border: `1px solid ${BORDER}`,
          padding: "8px 20px",
          display: "flex",
          gap: 9,
          alignItems: "center",
          boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
        }}
      >
        {visible.map((w, i) => {
          const isCurrent = frame >= w.startFrame && frame <= w.endFrame;
          return (
            <span
              key={`${w.startFrame}-${i}`}
              style={{
                fontFamily: FONT_STACK,
                fontSize: 21,
                fontWeight: isCurrent ? 800 : 600,
                color: isCurrent ? INK : PAPER,
                background: isCurrent ? LIME : "transparent",
                padding: isCurrent ? "2px 8px" : "2px 2px",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- SCENE 1: HOST INTRO ---------------- */
const SceneHostIntro: React.FC<{
  sc: V5SceneSpec;
  hostVideo: string;
  hostName: string;
}> = ({ sc, hostVideo, hostName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sTitle = spring({ frame, fps, config: { damping: 14 } });
  const sHost = spring({ frame: frame - 3, fps, config: { damping: 15 } });
  const drawPct = interpolate(frame, [6, 36], [260, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: INK,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "76px 56px 90px",
        gap: 48,
      }}
    >
      <div
        style={{
          width: 395,
          height: 395,
          flexShrink: 0,
          position: "relative",
          border: `2px solid ${LIME}`,
          transform: `scale(${interpolate(sHost, [0, 1], [0.92, 1])})`,
          opacity: sHost,
          overflow: "hidden",
          background: "#121210",
        }}
      >
        <OffthreadVideo
          src={staticFile(hostVideo)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: "rgba(14,14,14,0.88)",
            border: `1px solid ${LIME}`,
            padding: "5px 12px",
            fontFamily: MONO_STACK,
            fontSize: 12,
            color: LIME,
            fontWeight: 700,
          }}
        >
          ● {hostName.toUpperCase()}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          transform: `translateY(${interpolate(sTitle, [0, 1], [32, 0])}px)`,
          opacity: sTitle,
        }}
      >
        <svg width="52" height="52" viewBox="0 0 64 64" fill="none" style={{ marginBottom: 16 }}>
          <path
            d="M32 6L10 15V31C10 45 19.5 55.5 32 59C44.5 55.5 54 45 54 31V15L32 6Z"
            stroke={LIME}
            strokeWidth="3.5"
            strokeDasharray="260"
            strokeDashoffset={drawPct}
          />
          <path
            d="M23 32L29.5 38.5L42 25"
            stroke={LAVENDER}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 0.96,
            letterSpacing: "-0.04em",
            margin: 0,
            color: PAPER,
          }}
        >
          {sc.heading}
        </h1>
        {sc.subtitle && (
          <p style={{ fontSize: 23, color: MUTED, marginTop: 18, lineHeight: 1.4, maxWidth: 560 }}>
            {sc.subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 2: FRAMEWORK TRIAD ---------------- */
const SceneFrameworkTriad: React.FC<{ sc: V5SceneSpec }> = ({ sc }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const activePillar = Math.min(2, Math.floor((frame / Math.max(1, durationInFrames)) * 3));
  const camScale = interpolate(frame, [0, durationInFrames], [1, 1.03]);
  const lineDraw = interpolate(frame, [6, 28], [420, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulseT = (frame % 42) / 42;
  const pulseX = interpolate(pulseT, [0, 1], [340, 640]);
  const pulseY = interpolate(pulseT, [0, 1], [465, 220]);

  const items = (sc.bullets || ["Pillar 1", "Pillar 2", "Pillar 3"]).slice(0, 3);
  const positions = [
    { x: 640, y: 210 },
    { x: 315, y: 470 },
    { x: 965, y: 470 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: INK, transform: `scale(${camScale})` }}>
      <div style={{ position: "absolute", top: 68, left: 48 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 12, color: LIME, letterSpacing: "0.14em" }}>
          CORE FRAMEWORK
        </div>
        <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 0" }}>
          {sc.heading}
        </h2>
      </div>

      <svg width="1280" height="720" style={{ position: "absolute", inset: 0 }}>
        <polygon points="640,215 320,465 960,465" fill="rgba(227,238,50,0.04)" stroke={BORDER} strokeWidth="2.5" />
        <line x1="640" y1="215" x2="320" y2="465" stroke={activePillar === 0 ? LIME : LAVENDER} strokeWidth="3" strokeDasharray="420" strokeDashoffset={lineDraw} />
        <line x1="640" y1="215" x2="960" y2="465" stroke={activePillar === 2 ? LIME : LAVENDER} strokeWidth="3" strokeDasharray="420" strokeDashoffset={lineDraw} />
        <line x1="320" y1="465" x2="960" y2="465" stroke={activePillar === 1 ? LIME : LAVENDER} strokeWidth="3" strokeDasharray="640" strokeDashoffset={lineDraw} />
        <circle cx={pulseX} cy={pulseY} r="6" fill={LIME} />
      </svg>

      {items.map((raw, idx) => {
        const [title, desc] = splitPair(raw);
        const pos = positions[idx];
        const pop = spring({ frame: frame - idx * 12, fps, config: { damping: 13 } });
        const isActive = activePillar === idx;
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: pos.x - 170,
              top: pos.y - 68,
              width: 340,
              padding: "18px 20px",
              background: isActive ? "#1D1E17" : SURFACE,
              border: `2px solid ${isActive ? LIME : BORDER}`,
              boxShadow: isActive ? "0 0 34px rgba(227,238,50,0.2)" : "0 12px 26px rgba(0,0,0,0.5)",
              transform: `scale(${interpolate(pop, [0, 1], [0.84, 1]) * (isActive ? 1.05 : 0.96)})`,
              opacity: pop,
            }}
          >
            <div style={{ fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800, color: isActive ? LIME : LAVENDER, marginBottom: 4 }}>
              0{idx + 1} / PILLAR
            </div>
            <div style={{ fontSize: 23, fontWeight: 800, color: PAPER, marginBottom: 4 }}>{title}</div>
            {desc && <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.35 }}>{desc}</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 3: PROCESS / ATTACK FLOW + DEFENSE BARRIER ---------------- */
const SceneProcessFlow: React.FC<{ sc: V5SceneSpec }> = ({ sc }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const hasDefense = Boolean(sc.defenseLabel);
  const slamFrame = Math.round(durationInFrames * 0.52);
  const blocked = hasDefense && frame >= slamFrame;
  const shieldSpring = spring({ frame: frame - slamFrame, fps, config: { damping: 11, stiffness: 180 } });
  const packetX = interpolate(frame, [8, hasDefense ? slamFrame : durationInFrames - 12], [140, hasDefense ? 825 : 1060], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const steps = (sc.bullets || ["Step 1", "Step 2", "Step 3", "Step 4"]).slice(0, 4);

  return (
    <AbsoluteFill style={{ backgroundColor: INK, padding: "76px 52px 96px" }}>
      <div style={{ marginBottom: 52 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 12, color: blocked ? LIME : hasDefense ? DANGER : LAVENDER, letterSpacing: "0.14em", fontWeight: 700 }}>
          {blocked ? "CONTROL ACTIVE • PROTECTED" : hasDefense ? "LIVE FLOW SIMULATION" : "STEP-BY-STEP PROCESS"}
        </div>
        <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 0" }}>
          {sc.heading}
        </h2>
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 48, gap: 22 }}>
        <svg width="1176" height="120" style={{ position: "absolute", top: 32, left: 0, pointerEvents: "none" }}>
          <line x1="80" y1="60" x2="1090" y2="60" stroke={blocked ? BORDER : hasDefense ? DANGER : LIME} strokeWidth="4" strokeDasharray="10 8" />
          {!blocked && <circle cx={packetX} cy="60" r="10" fill={hasDefense ? DANGER : LIME} />}
        </svg>

        {steps.map((raw, idx) => {
          const [title, sub] = splitPair(raw);
          const pop = spring({ frame: frame - idx * 9, fps, config: { damping: 14 } });
          const isSafeEnd = idx === steps.length - 1 && blocked;
          const borderCol = isSafeEnd ? LIME : hasDefense ? DANGER : BORDER;
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                zIndex: 10,
                padding: "22px 18px",
                background: SURFACE,
                border: `2px solid ${borderCol}`,
                transform: `translateY(${interpolate(pop, [0, 1], [28, 0])}px)`,
                opacity: pop,
              }}
            >
              <div style={{ fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700, color: isSafeEnd ? LIME : hasDefense ? DANGER : LAVENDER, marginBottom: 8 }}>
                STEP 0{idx + 1}
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: PAPER, marginBottom: 6 }}>
                {isSafeEnd ? "Protected" : title}
              </div>
              {sub && <div style={{ fontSize: 14, color: MUTED }}>{sub}</div>}
            </div>
          );
        })}

        {blocked && (
          <div
            style={{
              position: "absolute",
              left: 842,
              top: -54,
              zIndex: 30,
              transform: `scale(${interpolate(shieldSpring, [0, 1], [1.7, 1])})`,
              opacity: shieldSpring,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ background: LIME, color: INK, fontFamily: MONO_STACK, fontSize: 12, fontWeight: 800, padding: "7px 14px", whiteSpace: "nowrap" }}>
              🛡 {sc.defenseLabel}
            </div>
            <div style={{ width: 4, height: 225, background: LIME, boxShadow: "0 0 22px rgba(227,238,50,0.7)" }} />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 4: ANIMATED DATA BARS ---------------- */
const SceneStatBars: React.FC<{ sc: V5SceneSpec }> = ({ sc }) => {
  const frame = useCurrentFrame();
  const stats = sc.stats && sc.stats.length > 0
    ? sc.stats
    : [
        { label: "Primary Factor", percent: 82, highlight: true },
        { label: "Secondary Factor", percent: 61 },
        { label: "Supporting Factor", percent: 44 },
      ];

  return (
    <AbsoluteFill style={{ backgroundColor: INK, padding: "80px 64px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 12, color: LAVENDER, letterSpacing: "0.14em", fontWeight: 700 }}>
          REAL-WORLD IMPACT
        </div>
        <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 0" }}>
          {sc.heading}
        </h2>
      </div>
      <div style={{ maxWidth: 1040, display: "flex", flexDirection: "column", gap: 30 }}>
        {stats.map((st, idx) => {
          const grow = interpolate(frame, [6 + idx * 10, 38 + idx * 10], [0, st.percent], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={st.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 22, fontWeight: 700 }}>
                <span>{st.label}</span>
                <span style={{ fontFamily: MONO_STACK, color: st.highlight ? LIME : LAVENDER, fontWeight: 800 }}>
                  {Math.round(grow)}%
                </span>
              </div>
              <div style={{ width: "100%", height: 26, background: SURFACE, border: `1px solid ${BORDER}` }}>
                <div style={{ height: "100%", width: `${grow}%`, background: st.highlight ? LIME : LAVENDER }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 5: COMPARISON SPLIT ---------------- */
const SceneComparisonSplit: React.FC<{ sc: V5SceneSpec }> = ({ sc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = sc.bullets || ["Weak approach", "Manual errors", "Structured approach", "Verified results"];
  const mid = Math.max(1, Math.floor(items.length / 2));
  const left = items.slice(0, mid);
  const right = items.slice(mid);
  const sL = spring({ frame: frame - 4, fps, config: { damping: 14 } });
  const sR = spring({ frame: frame - 16, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ backgroundColor: INK, padding: "76px 60px 96px" }}>
      <div style={{ marginBottom: 34 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 12, color: LIME, letterSpacing: "0.14em" }}>COMPARISON</div>
        <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 0" }}>{sc.heading}</h2>
      </div>
      <div style={{ display: "flex", gap: 32, flex: 1 }}>
        <div style={{ flex: 1, background: SURFACE, border: `2px solid ${DANGER}`, padding: 28, opacity: sL, transform: `translateX(${interpolate(sL, [0, 1], [-30, 0])}px)` }}>
          <div style={{ fontFamily: MONO_STACK, fontSize: 13, color: DANGER, fontWeight: 800, marginBottom: 18 }}>✕ AVOID / VULNERABLE</div>
          {left.map((it, i) => (
            <div key={i} style={{ fontSize: 22, fontWeight: 600, color: PAPER, marginBottom: 16 }}>• {it}</div>
          ))}
        </div>
        <div style={{ flex: 1, background: SURFACE, border: `2px solid ${LIME}`, padding: 28, opacity: sR, transform: `translateX(${interpolate(sR, [0, 1], [30, 0])}px)` }}>
          <div style={{ fontFamily: MONO_STACK, fontSize: 13, color: LIME, fontWeight: 800, marginBottom: 18 }}>✓ RECOMMENDED / SECURE</div>
          {right.map((it, i) => (
            <div key={i} style={{ fontSize: 22, fontWeight: 700, color: PAPER, marginBottom: 16 }}>• {it}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 6: LIVE CODE / TERMINAL DEMO ---------------- */
const SceneCodeDemo: React.FC<{ sc: V5SceneSpec }> = ({ sc }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fullCode = (sc.codeSnippet || "# Example command\nssh-keygen -t ed25519").trim();
  const chars = Math.floor(
    interpolate(frame, [8, Math.max(36, durationInFrames - 22)], [0, fullCode.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  return (
    <AbsoluteFill style={{ backgroundColor: INK, padding: "76px 60px 96px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 12, color: LIME, letterSpacing: "0.14em" }}>LIVE DEMO</div>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 0" }}>{sc.heading}</h2>
      </div>
      <div style={{ background: "#141413", border: `1px solid ${BORDER}`, flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderBottom: `1px solid ${BORDER}`, background: "#1C1C1A" }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: DANGER }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#F59E0B" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: LIME }} />
        </div>
        <pre style={{ margin: 0, padding: "26px 28px", fontFamily: MONO_STACK, fontSize: 24, lineHeight: 1.65, color: LIME, whiteSpace: "pre-wrap" }}>
          {fullCode.slice(0, chars)}
          <span style={{ display: "inline-block", width: 10, height: 24, background: LAVENDER, marginLeft: 4, opacity: frame % 16 < 8 ? 1 : 0 }} />
        </pre>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE 7: HOST RECAP ---------------- */
const SceneHostRecap: React.FC<{ sc: V5SceneSpec; hostVideo: string }> = ({ sc, hostVideo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const points = (sc.bullets || ["Master the core fundamentals", "Apply best practices daily"]).slice(0, 4);

  return (
    <AbsoluteFill style={{ backgroundColor: INK, display: "flex", flexDirection: "row", alignItems: "center", padding: "76px 56px 94px", gap: 44 }}>
      <div style={{ width: 345, height: 345, flexShrink: 0, border: `2px solid ${LIME}`, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(hostVideo)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 13, color: LIME, fontWeight: 800, letterSpacing: "0.14em" }}>
          {sc.heading.toUpperCase()}
        </div>
        {points.map((pt, idx) => {
          const s = spring({ frame: frame - idx * 10, fps, config: { damping: 14 } });
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 20px",
                background: SURFACE,
                borderLeft: `4px solid ${LIME}`,
                transform: `translateX(${interpolate(s, [0, 1], [32, 0])}px)`,
                opacity: s,
              }}
            >
              <span style={{ fontFamily: MONO_STACK, fontSize: 14, fontWeight: 800, color: INK, background: LIME, padding: "4px 9px" }}>
                0{idx + 1}
              </span>
              <span style={{ fontSize: 21, fontWeight: 700, color: PAPER }}>{pt}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const OkikeLessonVideo: React.FC<OkikeV5Props> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progressPct = Math.min(100, (frame / Math.max(1, durationInFrames - 1)) * 100);
  const transitionDur = 12;

  return (
    <AbsoluteFill style={{ backgroundColor: INK, color: PAPER, fontFamily: FONT_STACK, overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&display=swap');`}</style>

      {/* Top Brand Bar */}
      <div style={{ position: "absolute", top: 20, left: 36, right: 36, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 70 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, backgroundColor: LIME }} />
          <span style={{ fontFamily: MONO_STACK, fontSize: 13, letterSpacing: "0.18em", color: MUTED, fontWeight: 700 }}>
            {props.courseTitle}
          </span>
        </div>
      </div>

      {/* Smooth TransitionSeries across all modular scenes */}
      <TransitionSeries>
        {props.scenes.map((sc, idx) => {
          const isLast = idx === props.scenes.length - 1;
          let element: React.ReactNode;
          if (sc.template === "host_intro" || sc.template === "title_hook") {
            element = <SceneHostIntro sc={sc} hostVideo={props.introHostVideo} hostName={props.hostName} />;
          } else if (sc.template === "framework_triad" || sc.template === "concept_cards") {
            element = <SceneFrameworkTriad sc={sc} />;
          } else if (sc.template === "process_flow" || sc.template === "flow_diagram" || sc.template === "timeline_steps") {
            element = <SceneProcessFlow sc={sc} />;
          } else if (sc.template === "stat_bars") {
            element = <SceneStatBars sc={sc} />;
          } else if (sc.template === "comparison_split" || sc.template === "comparison") {
            element = <SceneComparisonSplit sc={sc} />;
          } else if (sc.template === "code_demo" || sc.template === "code_walkthrough") {
            element = <SceneCodeDemo sc={sc} />;
          } else {
            element = <SceneHostRecap sc={sc} hostVideo={props.recapHostVideo} />;
          }

          return (
            <React.Fragment key={idx}>
              <TransitionSeries.Sequence durationInFrames={Math.max(45, sc.durationInFrames)}>
                {element}
              </TransitionSeries.Sequence>
              {!isLast && (
                <TransitionSeries.Transition
                  presentation={idx % 2 === 0 ? slide({ direction: "from-right" }) : fade()}
                  timing={linearTiming({ durationInFrames: transitionDur })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>

      <KineticCaptions words={props.captionWords} frame={frame} />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, background: BORDER, zIndex: 80 }}>
        <div style={{ height: "100%", width: `${progressPct}%`, background: LIME }} />
      </div>

      <Audio src={staticFile(props.audioFile)} />
    </AbsoluteFill>
  );
};
