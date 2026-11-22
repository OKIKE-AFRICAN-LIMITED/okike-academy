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
      template: "host_intro",
      heading: "Fundamentals of Cybersecurity",
      subtitle: "Protecting Systems, Networks & Data",
      bullets: ["Beginner", "Module 01"],
      durationInFrames: 180,
    },
    {
      template: "framework_triad",
      heading: "The CIA Triad",
      bullets: [
        "Confidentiality: Only authorized users read data",
        "Integrity: Data cannot be silently altered",
        "Availability: Systems stay online when needed",
      ],
      durationInFrames: 240,
    },
    {
      template: "host_recap",
      heading: "Key Takeaways",
      bullets: [
        "Protect Confidentiality, Integrity & Availability",
        "Verify links before entering credentials",
        "Enable MFA on every account",
      ],
      durationInFrames: 180,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="OkikeLesson"
      component={OkikeLessonVideo}
      durationInFrames={600}
      fps={30}
      width={1280}
      height={720}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationInFrames || 600,
      })}
    />
  );
};
