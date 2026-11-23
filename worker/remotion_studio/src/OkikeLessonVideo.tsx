import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

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
  sourceCitation?: string;
  resolvedAssets?: Record<string, string>;
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
const SURFACE = "#181816";
const BORDER = "#3A3A35";
const LIME = "#E3EE32";
const LAVENDER = "#C4B0F0";
const PAPER = "#F7F7F2";
const MUTED = "#C4C4BC"; // > 9:1 contrast on #0E0E0E (WCAG AAA)
const DANGER = "#FF6B6B";

const FONT_STACK =
  "'Bricolage Grotesque', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Guarantees ZERO title crossfade ghosting:
 * Outgoing scene fades fully to 0 BEFORE the next scene starts,
 * and incoming scene fades 0 -> 1 cleanly on its own non-overlapping frames.
 */
const SceneFadeEnvelope: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(7, durationInFrames - 6), durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ backgroundColor: INK, opacity: Math.min(fadeIn, fadeOut) }}>
      {children}
    </AbsoluteFill>
  );
};

/** Max 2-line mobile-readable kinetic captions (>=16px equivalent at 360px phone width) */
const KineticCaptions: React.FC<{
  words: CaptionWord[];
  frame: number;
  isPortrait: boolean;
}> = ({ words, frame, isPortrait }) => {
  if (!words.length) return null;
  let activeIdx = words.findIndex(
    (w) => frame >= w.startFrame && frame <= w.endFrame
  );
  if (activeIdx < 0) {
    const nextIdx = words.findIndex((w) => w.startFrame > frame);
    activeIdx = nextIdx === -1 ? words.length - 1 : Math.max(0, nextIdx - 1);
  }
  const perLine = isPortrait ? 5 : 7;
  const windowStart = Math.floor(activeIdx / perLine) * perLine;
  const visible = words.slice(windowStart, windowStart + perLine);

  return (
    <div
      style={{
        position: "absolute",
        bottom: isPortrait ? 88 : 34,
        left: isPortrait ? 40 : 80,
        right: isPortrait ? 40 : 80,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      <div
        style={{
          background: "rgba(14, 14, 14, 0.94)",
          border: `2px solid ${BORDER}`,
          padding: isPortrait ? "18px 26px" : "12px 26px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: isPortrait ? 12 : 10,
          maxWidth: isPortrait ? 980 : 1480,
          maxHeight: isPortrait ? 148 : 112,
          overflow: "hidden",
        }}
      >
        {visible.map((w, i) => {
          const isCurrent = frame >= w.startFrame && frame <= w.endFrame;
          return (
            <span
              key={`${w.startFrame}-${i}`}
              style={{
                fontFamily: FONT_STACK,
                fontSize: isPortrait ? 42 : 34,
                fontWeight: isCurrent ? 800 : 600,
                color: isCurrent ? INK : PAPER,
                background: isCurrent ? LIME : "transparent",
                padding: isCurrent ? "2px 10px" : "2px 2px",
                lineHeight: 1.2,
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

/* ---------------- SCENE: HOOK / HOST INTRO ---------------- */
const SceneHookIntro: React.FC<{
  sc: V5SceneSpec;
  hostVideo: string;
  hostName: string;
  isPortrait: boolean;
}> = ({ sc, hostVideo, hostName, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sTitle = spring({ frame, fps, config: { damping: 16 } });
  const sHost = spring({ frame: frame - 3, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        padding: isPortrait ? "150px 64px 260px" : "110px 96px 140px",
        gap: isPortrait ? 52 : 76,
      }}
    >
      <div
        style={{
          width: isPortrait ? 540 : 540,
          height: isPortrait ? 540 : 540,
          flexShrink: 0,
          position: "relative",
          border: `3px solid ${LIME}`,
          transform: `scale(${interpolate(sHost, [0, 1], [0.94, 1])})`,
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
            bottom: 16,
            left: 16,
            background: "rgba(14,14,14,0.92)",
            border: `2px solid ${LIME}`,
            padding: "7px 16px",
            fontFamily: MONO_STACK,
            fontSize: 18,
            color: LIME,
            fontWeight: 700,
          }}
        >
          ● {hostName.toUpperCase()}
        </div>
      </div>

      <div
        style={{
          flex: isPortrait ? undefined : 1,
          textAlign: isPortrait ? "center" : "left",
          transform: `translateY(${interpolate(sTitle, [0, 1], [28, 0])}px)`,
          opacity: sTitle,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: LIME,
            color: INK,
            fontFamily: MONO_STACK,
            fontSize: isPortrait ? 22 : 19,
            fontWeight: 800,
            letterSpacing: "0.12em",
            padding: "8px 18px",
            marginBottom: 26,
          }}
        >
          LEARNING OBJECTIVE
        </div>
        <h1
          style={{
            fontSize: isPortrait ? 76 : 86,
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: "-0.03em",
            margin: 0,
            color: PAPER,
          }}
        >
          {sc.heading}
        </h1>
        {sc.subtitle && (
          <p
            style={{
              fontSize: isPortrait ? 38 : 34,
              color: MUTED,
              marginTop: 26,
              lineHeight: 1.38,
            }}
          >
            {sc.subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: REAL HTML/CSS UI MOCKUP (GOOD vs BAD) ---------------- */
const SceneUIMockup: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sBad = spring({ frame: frame - 6, fps, config: { damping: 16 } });
  const sGood = spring({ frame: frame - 24, fps, config: { damping: 16 } });
  const badImg = sc.resolvedAssets?.ui_bad;
  const goodImg = sc.resolvedAssets?.ui_good;

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "140px 56px 260px" : "110px 80px 150px",
        display: "flex",
        flexDirection: "column",
        gap: 36,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LIME, fontWeight: 700, letterSpacing: "0.14em" }}>
          REAL INTERFACE COMPARISON
        </div>
        <h2 style={{ fontSize: isPortrait ? 58 : 62, fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.03em" }}>
          {sc.heading}
        </h2>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: isPortrait ? "column" : "row",
          gap: 36,
        }}
      >
        {badImg && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, opacity: sBad }}>
            <div style={{ fontFamily: MONO_STACK, fontSize: 22, color: DANGER, fontWeight: 800 }}>
              ✕ BEFORE (WEAK HIERARCHY)
            </div>
            <div style={{ flex: 1, border: `3px solid ${DANGER}`, overflow: "hidden", background: "#fff" }}>
              <Img src={staticFile(badImg)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        )}
        {goodImg && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, opacity: sGood }}>
            <div style={{ fontFamily: MONO_STACK, fontSize: 22, color: LIME, fontWeight: 800 }}>
              ✓ AFTER (CLEAR UI)
            </div>
            <div style={{ flex: 1, border: `3px solid ${LIME}`, overflow: "hidden", background: "#fff" }}>
              <Img src={staticFile(goodImg)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: PAUSE & PREDICT (CHECK FOR UNDERSTANDING) ---------------- */
const ScenePausePredict: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const revealAt = Math.round(durationInFrames * 0.62);
  const revealed = frame >= revealAt;
  const ansSpring = spring({ frame: frame - revealAt, fps, config: { damping: 14 } });
  const answer = (sc.bullets && sc.bullets[0]) || "Review the lesson objective above.";

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "180px 64px 260px" : "130px 120px 160px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 36,
      }}
    >
      <div style={{ fontFamily: MONO_STACK, fontSize: 22, color: LAVENDER, fontWeight: 800, letterSpacing: "0.14em" }}>
        CHECK FOR UNDERSTANDING
      </div>
      <h2 style={{ fontSize: isPortrait ? 60 : 66, fontWeight: 800, lineHeight: 1.08, margin: 0 }}>
        {sc.subtitle || sc.heading}
      </h2>

      {!revealed ? (
        <div
          style={{
            marginTop: 18,
            padding: "24px 32px",
            background: SURFACE,
            border: `2px solid ${LAVENDER}`,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO_STACK,
              fontSize: isPortrait ? 28 : 24,
              color: LAVENDER,
              fontWeight: 700,
            }}
          >
            <span>PAUSE &amp; PREDICT...</span>
            <span>
              {Math.max(1, Math.ceil((revealAt - frame) / fps))}s
            </span>
          </div>
          <div style={{ width: "100%", height: 10, background: BORDER, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (frame / Math.max(1, revealAt)) * 100)}%`,
                background: LAVENDER,
              }}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 18,
            padding: "28px 34px",
            background: LIME,
            color: INK,
            border: `3px solid ${LIME}`,
            transform: `translateY(${interpolate(ansSpring, [0, 1], [24, 0])}px)`,
            opacity: ansSpring,
          }}
        >
          <div style={{ fontFamily: MONO_STACK, fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
            ✓ ANSWER
          </div>
          <div style={{ fontSize: isPortrait ? 40 : 38, fontWeight: 800, lineHeight: 1.25 }}>
            {answer}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: ANIMATED PROCESS FLOW (CONNECTED NODES) ---------------- */
const SceneProcessFlow: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const steps = (sc.bullets || []).slice(0, 4);
  const stepWindow = Math.max(1, Math.floor(durationInFrames / Math.max(1, steps.length)));
  const activeStep = Math.min(steps.length - 1, Math.floor(frame / stepWindow));

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "140px 52px 245px" : "110px 80px 150px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 36,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LIME, fontWeight: 800, letterSpacing: "0.14em" }}>
          STEP-BY-STEP PROCESS
        </div>
        <h2 style={{ fontSize: isPortrait ? 56 : 62, fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          {sc.heading}
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: isPortrait ? "column" : "row",
          alignItems: "stretch",
          gap: isPortrait ? 18 : 16,
        }}
      >
        {steps.map((raw, idx) => {
          const s = spring({ frame: frame - idx * 10, fps, config: { damping: 16 } });
          const isActive = idx <= activeStep;
          const parts = raw.split(":");
          const title = parts[0]?.trim() || raw;
          const detail = parts.length > 1 ? parts.slice(1).join(":").trim() : "";

          return (
            <React.Fragment key={idx}>
              <div
                style={{
                  flex: 1,
                  background: isActive ? "#1e1e1b" : SURFACE,
                  border: `3px solid ${idx === activeStep ? LIME : isActive ? LAVENDER : BORDER}`,
                  padding: isPortrait ? "22px 24px" : "28px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  opacity: s,
                  transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px)`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontFamily: MONO_STACK,
                      fontSize: 22,
                      fontWeight: 800,
                      color: idx === activeStep ? INK : PAPER,
                      background: idx === activeStep ? LIME : BORDER,
                      padding: "6px 12px",
                    }}
                  >
                    STEP 0{idx + 1}
                  </span>
                  {idx < activeStep && (
                    <span style={{ fontFamily: MONO_STACK, fontSize: 22, color: LIME, fontWeight: 800 }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: isPortrait ? 32 : 30, fontWeight: 800, color: PAPER, lineHeight: 1.2 }}>
                  {title}
                </div>
                {detail && (
                  <div style={{ fontSize: isPortrait ? 26 : 23, color: MUTED, lineHeight: 1.35 }}>
                    {detail}
                  </div>
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: MONO_STACK,
                    fontSize: 32,
                    fontWeight: 800,
                    color: idx < activeStep ? LIME : BORDER,
                    flexShrink: 0,
                  }}
                >
                  {isPortrait ? "↓" : "→"}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: BEFORE / AFTER SPLIT COMPARISON ---------------- */
const SceneBeforeAfter: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = (sc.bullets || []).slice(0, 4);
  const mid = Math.max(1, Math.ceil(items.length / 2));
  const wrongItems = items.slice(0, mid);
  const rightItems = items.slice(mid);
  const sWrong = spring({ frame: frame - 4, fps, config: { damping: 16 } });
  const sRight = spring({ frame: frame - 22, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "140px 52px 245px" : "110px 80px 150px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LAVENDER, fontWeight: 800, letterSpacing: "0.14em" }}>
          CONTRAST &amp; CORRECTION
        </div>
        <h2 style={{ fontSize: isPortrait ? 56 : 62, fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          {sc.heading}
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", gap: 32, flex: isPortrait ? undefined : 1 }}>
        <div
          style={{
            flex: 1,
            background: "#1c1315",
            border: `3px solid ${DANGER}`,
            padding: "32px 30px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            opacity: sWrong,
            transform: `translateX(${interpolate(sWrong, [0, 1], [-24, 0])}px)`,
          }}
        >
          <div style={{ fontFamily: MONO_STACK, fontSize: 22, fontWeight: 800, color: DANGER, letterSpacing: "0.12em" }}>
            ✕ COMMON MISTAKE
          </div>
          {wrongItems.map((item, i) => (
            <div key={i} style={{ fontSize: isPortrait ? 32 : 31, fontWeight: 700, color: PAPER, lineHeight: 1.3, paddingLeft: 16, borderLeft: `4px solid ${DANGER}` }}>
              {item}
            </div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            background: "#171a12",
            border: `3px solid ${LIME}`,
            padding: "32px 30px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            opacity: sRight,
            transform: `translateX(${interpolate(sRight, [0, 1], [24, 0])}px)`,
          }}
        >
          <div style={{ fontFamily: MONO_STACK, fontSize: 22, fontWeight: 800, color: LIME, letterSpacing: "0.12em" }}>
            ✓ BEST PRACTICE
          </div>
          {(rightItems.length > 0 ? rightItems : ["Apply structured, verifiable methodology."]).map((item, i) => (
            <div key={i} style={{ fontSize: isPortrait ? 32 : 31, fontWeight: 700, color: PAPER, lineHeight: 1.3, paddingLeft: 16, borderLeft: `4px solid ${LIME}` }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: LIVE CODE & RENDERED PREVIEW ---------------- */
const SceneLiveCodePreview: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const code = sc.codeSnippet || "<!-- Example -->";
  const visibleChars = Math.floor(
    interpolate(frame, [6, Math.max(24, durationInFrames * 0.65)], [0, code.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const typedCode = code.slice(0, visibleChars);
  const previewImg = sc.resolvedAssets?.code_output;

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "140px 48px 245px" : "105px 76px 145px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LIME, fontWeight: 800, letterSpacing: "0.14em" }}>
          LIVE CODE &amp; OUTPUT
        </div>
        <h2 style={{ fontSize: isPortrait ? 52 : 56, fontWeight: 800, margin: "6px 0 0", letterSpacing: "-0.03em" }}>
          {sc.heading}
        </h2>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: isPortrait ? "column" : "row", gap: 28 }}>
        <div style={{ flex: 1.15, background: "#121210", border: `2px solid ${BORDER}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, background: SURFACE }}>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: DANGER }} />
            <span style={{ width: 12, height: 12, borderRadius: 99, background: LIME }} />
            <span style={{ width: 12, height: 12, borderRadius: 99, background: LAVENDER }} />
            <span style={{ fontFamily: MONO_STACK, fontSize: 16, color: MUTED, marginLeft: 10 }}>editor.code</span>
          </div>
          <pre
            style={{
              margin: 0,
              padding: "24px 28px",
              fontFamily: MONO_STACK,
              fontSize: isPortrait ? 24 : 26,
              lineHeight: 1.55,
              color: LIME,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {typedCode}
            <span style={{ background: LIME, color: INK }}> </span>
          </pre>
        </div>

        {previewImg && (
          <div style={{ flex: 0.85, display: "flex", flexDirection: "column", border: `2px solid ${LIME}`, background: "#fff", overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", background: LIME, color: INK, fontFamily: MONO_STACK, fontSize: 16, fontWeight: 800 }}>
              ● RENDERED PREVIEW
            </div>
            <Img src={staticFile(previewImg)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: KEY TERM CALLOUT (EDITORIAL GLOSSARY) ---------------- */
const SceneKeyTermCallout: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sCard = spring({ frame: frame - 4, fps, config: { damping: 16 } });
  const sEx = spring({ frame: frame - 20, fps, config: { damping: 16 } });
  const definition = (sc.bullets && sc.bullets[0]) || sc.subtitle || "";
  const example = (sc.bullets && sc.bullets[1]) || "";

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "160px 56px 250px" : "120px 110px 155px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
      }}
    >
      <div
        style={{
          background: SURFACE,
          border: `3px solid ${BORDER}`,
          borderTop: `8px solid ${LIME}`,
          padding: isPortrait ? "40px 36px" : "48px 52px",
          opacity: sCard,
          transform: `translateY(${interpolate(sCard, [0, 1], [24, 0])}px)`,
        }}
      >
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LIME, fontWeight: 800, letterSpacing: "0.16em", marginBottom: 14 }}>
          KEY CONCEPT
        </div>
        <h2 style={{ fontSize: isPortrait ? 64 : 74, fontWeight: 800, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.02, color: PAPER }}>
          {sc.heading}
        </h2>
        {definition && (
          <p style={{ fontSize: isPortrait ? 36 : 36, color: "#e5e5df", marginTop: 24, marginBottom: 0, lineHeight: 1.38, fontWeight: 500 }}>
            {definition}
          </p>
        )}
      </div>

      {example && (
        <div
          style={{
            background: "#17171d",
            borderLeft: `6px solid ${LAVENDER}`,
            padding: "24px 32px",
            opacity: sEx,
            transform: `translateY(${interpolate(sEx, [0, 1], [18, 0])}px)`,
          }}
        >
          <div style={{ fontFamily: MONO_STACK, fontSize: 18, color: LAVENDER, fontWeight: 800, letterSpacing: "0.14em", marginBottom: 8 }}>
            IN PRACTICE
          </div>
          <div style={{ fontSize: isPortrait ? 32 : 30, color: PAPER, fontWeight: 600, lineHeight: 1.35 }}>
            {example.replace(/^Example:\s*/i, "")}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: GENERIC EXPLAINER (FALLBACK / SOURCED DATA) ---------------- */
const SceneExplainerCard: React.FC<{ sc: V5SceneSpec; isPortrait: boolean }> = ({
  sc,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bullets = (sc.bullets || []).slice(0, 4);

  return (
    <AbsoluteFill
      style={{
        padding: isPortrait ? "150px 60px 260px" : "115px 96px 150px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: LIME, fontWeight: 700, letterSpacing: "0.14em" }}>
          {sc.template.replace(/_/g, " ").toUpperCase()}
        </div>
        <h2 style={{ fontSize: isPortrait ? 60 : 64, fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          {sc.heading}
        </h2>
      </div>

      {sc.codeSnippet ? (
        <pre
          style={{
            margin: 0,
            padding: "32px",
            background: "#141413",
            border: `2px solid ${BORDER}`,
            fontFamily: MONO_STACK,
            fontSize: isPortrait ? 28 : 30,
            lineHeight: 1.6,
            color: LIME,
            whiteSpace: "pre-wrap",
          }}
        >
          {sc.codeSnippet}
        </pre>
      ) : sc.stats && sc.stats.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 34, marginTop: 12 }}>
          {sc.stats.map((st, idx) => {
            const grow = interpolate(frame, [8 + idx * 10, 38 + idx * 10], [0, st.percent], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div key={st.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: isPortrait ? 34 : 32, fontWeight: 700, marginBottom: 10 }}>
                  <span>{st.label}</span>
                  <span style={{ fontFamily: MONO_STACK, color: st.highlight ? LIME : LAVENDER }}>
                    {Math.round(grow)}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 32, background: SURFACE, border: `2px solid ${BORDER}` }}>
                  <div style={{ height: "100%", width: `${grow}%`, background: st.highlight ? LIME : LAVENDER }} />
                </div>
              </div>
            );
          })}
          {sc.sourceCitation && (
            <div style={{ fontFamily: MONO_STACK, fontSize: 20, color: MUTED, marginTop: 8 }}>
              Source: {sc.sourceCitation}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 8 }}>
          {bullets.map((b, idx) => {
            const s = spring({ frame: frame - idx * 10, fps, config: { damping: 15 } });
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  padding: isPortrait ? "24px 26px" : "22px 28px",
                  background: SURFACE,
                  borderLeft: `6px solid ${idx % 2 === 0 ? LIME : LAVENDER}`,
                  opacity: s,
                  transform: `translateX(${interpolate(s, [0, 1], [24, 0])}px)`,
                }}
              >
                <span style={{ fontFamily: MONO_STACK, fontSize: 24, fontWeight: 800, color: INK, background: LIME, padding: "6px 12px", flexShrink: 0 }}>
                  0{idx + 1}
                </span>
                <span style={{ fontSize: isPortrait ? 36 : 34, fontWeight: 700, color: PAPER, lineHeight: 1.25 }}>
                  {b}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: BESPOKE EDITORIAL ILLUSTRATION (FLUX / SDXL) ---------------- */
const SceneEditorialIllustration: React.FC<{
  sc: V5SceneSpec;
  isPortrait: boolean;
}> = ({ sc, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16 } });
  const zoom = interpolate(frame, [0, Math.max(30, durationInFrames)], [1.0, 1.08], {
    extrapolateRight: "clamp",
  });
  const imgFile = sc.resolvedAssets?.illustration || "";
  const bullets = (sc.bullets || []).slice(0, 3);
  const badge =
    sc.template === "real_world_scenario"
      ? "REAL-WORLD SCENARIO"
      : "VISUAL ANALOGY";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        padding: isPortrait ? "135px 52px 245px" : "105px 80px 145px",
        gap: isPortrait ? 36 : 56,
      }}
    >
      {/* Framed AI Editorial Illustration with smooth Ken Burns zoom */}
      <div
        style={{
          flex: isPortrait ? undefined : "0 0 56%",
          width: isPortrait ? "100%" : undefined,
          aspectRatio: "16 / 9",
          position: "relative",
          overflow: "hidden",
          border: `3px solid ${BORDER}`,
          background: "#0a0a09",
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.96, 1])})`,
        }}
      >
        {imgFile && (
          <Img
            src={staticFile(imgFile)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${zoom})`,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: "rgba(14,14,14,0.88)",
            border: `2px solid ${LIME}`,
            color: LIME,
            fontFamily: MONO_STACK,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "6px 14px",
          }}
        >
          ● {badge}
        </div>
      </div>

      {/* Editorial heading + key callouts beside/below the illustration */}
      <div
        style={{
          flex: isPortrait ? undefined : 1,
          width: isPortrait ? "100%" : undefined,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <h2
          style={{
            fontSize: isPortrait ? 54 : 52,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: "-0.025em",
            margin: 0,
            color: PAPER,
          }}
        >
          {sc.heading}
        </h2>
        {sc.subtitle && (
          <p
            style={{
              fontSize: isPortrait ? 30 : 26,
              color: MUTED,
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {sc.subtitle}
          </p>
        )}
        {bullets.map((b, idx) => {
          const sb = spring({ frame: frame - 8 - idx * 8, fps, config: { damping: 16 } });
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 20px",
                background: SURFACE,
                borderLeft: `5px solid ${idx % 2 === 0 ? LIME : LAVENDER}`,
                opacity: sb,
                transform: `translateX(${interpolate(sb, [0, 1], [18, 0])}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: MONO_STACK,
                  fontSize: 20,
                  fontWeight: 800,
                  color: INK,
                  background: LIME,
                  padding: "4px 10px",
                  flexShrink: 0,
                }}
              >
                0{idx + 1}
              </span>
              <span
                style={{
                  fontSize: isPortrait ? 30 : 27,
                  fontWeight: 700,
                  color: PAPER,
                  lineHeight: 1.25,
                }}
              >
                {b}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- SCENE: HOST RECAP ---------------- */
const SceneHostRecap: React.FC<{
  sc: V5SceneSpec;
  hostVideo: string;
  isPortrait: boolean;
}> = ({ sc, hostVideo, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const points = (sc.bullets || []).slice(0, 3);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        padding: isPortrait ? "140px 60px 260px" : "110px 96px 150px",
        gap: isPortrait ? 44 : 64,
      }}
    >
      <div style={{ width: isPortrait ? 420 : 480, height: isPortrait ? 420 : 480, flexShrink: 0, border: `3px solid ${LIME}`, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(hostVideo)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ flex: isPortrait ? undefined : 1, width: isPortrait ? "100%" : undefined, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontFamily: MONO_STACK, fontSize: 22, color: LIME, fontWeight: 800, letterSpacing: "0.14em" }}>
          {sc.heading.toUpperCase()}
        </div>
        {points.map((pt, idx) => {
          const s = spring({ frame: frame - idx * 10, fps, config: { damping: 15 } });
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "20px 24px",
                background: SURFACE,
                borderLeft: `6px solid ${LIME}`,
                opacity: s,
              }}
            >
              <span style={{ fontFamily: MONO_STACK, fontSize: 22, fontWeight: 800, color: INK, background: LIME, padding: "5px 11px" }}>
                0{idx + 1}
              </span>
              <span style={{ fontSize: isPortrait ? 34 : 32, fontWeight: 700, color: PAPER }}>
                {pt}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const OkikeLessonVideo: React.FC<OkikeV5Props> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const isPortrait = height > width;
  const progressPct = Math.min(100, (frame / Math.max(1, durationInFrames - 1)) * 100);

  const totalScenes = props.scenes.length;
  let currentSceneIdx = 0;
  let accFrames = 0;
  for (let i = 0; i < totalScenes; i++) {
    const d = Math.max(45, props.scenes[i].durationInFrames);
    if (frame >= accFrames && frame < accFrames + d) {
      currentSceneIdx = i;
      break;
    }
    accFrames += d;
    if (i === totalScenes - 1) currentSceneIdx = i;
  }
  const activeTemplateLabel = (props.scenes[currentSceneIdx]?.template || "lesson")
    .replace(/_/g, " ")
    .toUpperCase();

  return (
    <AbsoluteFill style={{ backgroundColor: INK, color: PAPER, fontFamily: FONT_STACK, overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&display=swap');`}</style>

      {/* Subtle Swiss Architectural Grid + Calm Ambient Glow (Zero Flashing / WCAG Safe) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -220,
          right: -180,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(227,238,50,0.06) 0%, rgba(14,14,14,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Top Broadcast Header with Live Chapter Indicator */}
      <div style={{ position: "absolute", top: isPortrait ? 44 : 30, left: isPortrait ? 48 : 64, right: isPortrait ? 48 : 64, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 70 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, backgroundColor: LIME }} />
          <span style={{ fontFamily: MONO_STACK, fontSize: isPortrait ? 20 : 18, letterSpacing: "0.18em", color: MUTED, fontWeight: 700 }}>
            OKIKE ACADEMY · {props.courseTitle}
          </span>
        </div>
        <div
          style={{
            fontFamily: MONO_STACK,
            fontSize: isPortrait ? 18 : 16,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: PAPER,
            background: "rgba(25,25,23,0.9)",
            border: `1px solid ${BORDER}`,
            padding: "6px 14px",
          }}
        >
          {String(currentSceneIdx + 1).padStart(2, "0")} / {String(totalScenes).padStart(2, "0")} · {activeTemplateLabel}
        </div>
      </div>

      {/* Non-overlapping Series with clean fade-to-ink envelope -> ZERO title ghosting! */}
      <Series>
        {props.scenes.map((sc, idx) => {
          const dur = Math.max(45, sc.durationInFrames);
          let body: React.ReactNode;
          if (sc.template === "hook_scene" || sc.template === "host_intro" || sc.template === "title_hook") {
            body = <SceneHookIntro sc={sc} hostVideo={props.introHostVideo} hostName={props.hostName} isPortrait={isPortrait} />;
          } else if (sc.template === "ui_mockup" && (sc.resolvedAssets?.ui_bad || sc.resolvedAssets?.ui_good)) {
            body = <SceneUIMockup sc={sc} isPortrait={isPortrait} />;
          } else if (sc.resolvedAssets?.illustration) {
            body = <SceneEditorialIllustration sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "process_flow") {
            body = <SceneProcessFlow sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "before_after" || sc.template === "comparison_split") {
            body = <SceneBeforeAfter sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "live_code_preview" || sc.template === "code_demo") {
            body = <SceneLiveCodePreview sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "key_term_callout") {
            body = <SceneKeyTermCallout sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "pause_and_predict") {
            body = <ScenePausePredict sc={sc} isPortrait={isPortrait} />;
          } else if (sc.template === "recap_scene" || sc.template === "host_recap" || sc.template === "takeaways") {
            body = <SceneHostRecap sc={sc} hostVideo={props.recapHostVideo} isPortrait={isPortrait} />;
          } else {
            body = <SceneExplainerCard sc={sc} isPortrait={isPortrait} />;
          }

          return (
            <Series.Sequence key={idx} durationInFrames={dur}>
              <SceneFadeEnvelope durationInFrames={dur}>{body}</SceneFadeEnvelope>
            </Series.Sequence>
          );
        })}
      </Series>

      <KineticCaptions words={props.captionWords} frame={frame} isPortrait={isPortrait} />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: BORDER, zIndex: 80 }}>
        <div style={{ height: "100%", width: `${progressPct}%`, background: LIME }} />
      </div>

      <Audio src={staticFile(props.audioFile)} />
    </AbsoluteFill>
  );
};
