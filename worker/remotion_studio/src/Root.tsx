import React from "react";
import { Composition } from "remotion";
import { OkikeLessonVideo, type OkikeV5Props } from "./OkikeLessonVideo";

const defaultProps: OkikeV5Props = {
  courseTitle: "OKIKE ACADEMY",
  hostName: "Amara • Okike Host",
  durationInFrames: 600,
  audioFile: "lesson_mix.wav",
  introHostVideo: "intro_host.mp4",
  recapHostVideo: "recap_host.mp4",
  captionWords: [],
  scenes: [
    {
      template: "hook_scene",
      heading: "Why Hierarchy Guides Every Click",
      subtitle: "By the end, you can fix cluttered interfaces with clear visual hierarchy.",
      bullets: ["Beginner", "Module 01"],
      durationInFrames: 180,
    },
    {
      template: "pause_and_predict",
      heading: "Quick Check",
      subtitle: "Which element should draw the eye first on a signup screen?",
      bullets: ["The primary headline & single call-to-action button"],
      durationInFrames: 240,
    },
    {
      template: "recap_scene",
      heading: "Key Takeaways",
      bullets: [
        "One clear visual focal point per screen",
        "High contrast (4.5:1+) makes actions obvious",
        "Next: Consistent Spacing & Grids",
      ],
      durationInFrames: 180,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1080p Landscape Master (16:9) */}
      <Composition
        id="OkikeLesson"
        component={OkikeLessonVideo}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames || 600,
        })}
      />

      {/* 1080p Mobile Portrait Variant (9:16) — Designed natively, never letterboxed */}
      <Composition
        id="OkikeLessonPortrait"
        component={OkikeLessonVideo}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames || 600,
        })}
      />
    </>
  );
};
