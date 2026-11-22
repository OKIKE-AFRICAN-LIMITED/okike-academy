import { GoogleGenAI, Type } from "@google/genai";
import type { GeneratedCoursePayload } from "./types";
import type { RoadmapOutlinePayload } from "./db";

interface GenerateCourseOptions {
  topic: string;
  level: string;
  moduleCount: number;
  lessonsPerModule: number;
  videoModel: string;
}

export async function generateCourseWithAI(
  options: GenerateCourseOptions
): Promise<{ payload: GeneratedCoursePayload; usedFallback: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      payload: buildFallbackCourse(options),
      usedFallback: true,
    };
  }

  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });

  const prompt = `You are an elite curriculum designer and explainer-video director for Okike Academy (think Vox + Fireship + W3Schools).
Create a clear, practical, real-world course on: "${options.topic}".
Target level: ${options.level}.
Structure: Exactly ${options.moduleCount} modules, with ${options.lessonsPerModule} lessons per module.

For EACH lesson, generate:
1. Clear, practical tutorial markdown (headings, bullet lists, concrete real-world examples, callout tips).
2. 3 concise key takeaways.
3. An optional short runnable codeExample (HTML/JS/Python/Bash/SQL — set to null if non-technical) and codeLanguage.
4. 2 multiple-choice quiz questions with 4 options, correctIndex (0-3), and a brief explanation.
5. A 5-scene "videoStoryboard" for Okike Studio Explainer Engine v5 (ZERO abstract art — every scene directly explains the lesson!):
   - Scene 1 MUST use template "host_intro" (heading: 2-5 words, subtitle: punchy 5-10 words, narration: 14-20 words welcoming the student to this specific lesson).
   - Scenes 2, 3, and 4 MUST choose 3 DIFFERENT teaching templates from:
     * "framework_triad": 3 pillars in bullets (format "Title: short explanation <= 8 words").
     * "process_flow": 4 sequential steps in bullets (format "Step Title: short detail <= 6 words") + optional "defenseLabel" (e.g. "MFA + ZERO TRUST" or "QUALITY CHECK") if a barrier/checkpoint stops a failure!
     * "stat_bars": 3 real-world impact stats in "stats" array ({label, percent, highlight}).
     * "comparison_split": 4 bullets (first 2 = Wrong/Old Way, last 2 = Right/Modern Way).
     * "code_demo": short 3-5 line "codeSnippet" + 3 short callout bullets.
     * "timeline_steps": 3-4 sequential milestones in bullets.
   - Scene 5 MUST use template "host_recap" with 3 crisp takeaway bullets matching the narration.
   - CRITICAL: Every scene's "narration" (15-24 words) must directly explain the exact items shown on screen in that scene!

Return ONLY valid JSON matching the schema.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          estimatedHours: { type: Type.NUMBER },
          modules: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                lessons: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      contentMarkdown: { type: Type.STRING },
                      keyTakeaways: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      codeExample: { type: Type.STRING, nullable: true },
                      codeLanguage: { type: Type.STRING, nullable: true },
                      quiz: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            question: { type: Type.STRING },
                            options: {
                              type: Type.ARRAY,
                              items: { type: Type.STRING },
                            },
                            correctIndex: { type: Type.INTEGER },
                            explanation: { type: Type.STRING },
                          },
                          required: [
                            "question",
                            "options",
                            "correctIndex",
                            "explanation",
                          ],
                        },
                      },
                      videoStoryboard: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            sceneNumber: { type: Type.INTEGER },
                            template: {
                              type: Type.STRING,
                              enum: [
                                "host_intro",
                                "framework_triad",
                                "process_flow",
                                "stat_bars",
                                "comparison_split",
                                "code_demo",
                                "timeline_steps",
                                "host_recap",
                              ],
                            },
                            heading: { type: Type.STRING },
                            subtitle: { type: Type.STRING, nullable: true },
                            bullets: {
                              type: Type.ARRAY,
                              items: { type: Type.STRING },
                            },
                            codeSnippet: { type: Type.STRING, nullable: true },
                            defenseLabel: { type: Type.STRING, nullable: true },
                            stats: {
                              type: Type.ARRAY,
                              nullable: true,
                              items: {
                                type: Type.OBJECT,
                                properties: {
                                  label: { type: Type.STRING },
                                  percent: { type: Type.INTEGER },
                                  highlight: { type: Type.BOOLEAN },
                                },
                                required: ["label", "percent"],
                              },
                            },
                            narration: { type: Type.STRING },
                            visualPrompt: { type: Type.STRING },
                            durationSec: { type: Type.INTEGER },
                          },
                          required: [
                            "sceneNumber",
                            "template",
                            "heading",
                            "bullets",
                            "narration",
                            "visualPrompt",
                            "durationSec",
                          ],
                        },
                      },
                    },
                    required: [
                      "title",
                      "contentMarkdown",
                      "keyTakeaways",
                      "quiz",
                      "videoStoryboard",
                    ],
                  },
                },
              },
              required: ["title", "summary", "lessons"],
            },
          },
        },
        required: ["title", "description", "estimatedHours", "modules"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(text) as GeneratedCoursePayload;
  return { payload: parsed, usedFallback: false };
}

function buildFallbackCourse(
  options: GenerateCourseOptions
): GeneratedCoursePayload {
  const { topic, level, moduleCount, lessonsPerModule } = options;
  const stageNames = [
    "Core Foundations",
    "Threat & Process Flows",
    "Applied Defense & Workflows",
    "Real-World Case Studies",
    "Best Practices",
    "Capstone & Mastery",
  ];

  const modules = Array.from({ length: moduleCount }, (_, mIdx) => {
    const stage = stageNames[mIdx % stageNames.length];
    return {
      title: `Module ${mIdx + 1}: ${stage} in ${topic}`,
      summary: `Step-by-step ${level.toLowerCase()} roadmap covering ${stage.toLowerCase()} for ${topic}.`,
      lessons: Array.from({ length: lessonsPerModule }, (_, lIdx) => {
        const lessonNum = mIdx * lessonsPerModule + lIdx + 1;
        return {
          title: `${stage} — Part ${lIdx + 1}`,
          contentMarkdown: `## Lesson ${lessonNum}: ${topic}

This lesson was generated in **Demo Mode** (add your free \`GEMINI_API_KEY\` from Google AI Studio to \`.env.local\` for full AI-authored lessons).

### Core Concept

In this section of **${topic}** (${level} track), you learn how **${stage.toLowerCase()}** works in real-world scenarios:

- Break complex systems into clear, actionable pillars.
- Trace cause-and-effect flows step by step.
- Verify your understanding with the quick check quiz below.`,
          keyTakeaways: [
            `Understand the role of ${stage.toLowerCase()} in ${topic}.`,
            "Trace real-world workflows before making decisions.",
            "Apply each principle immediately with hands-on checks.",
          ],
          codeExample: null,
          codeLanguage: null,
          quiz: [
            {
              question: `What is the primary focus of Module ${mIdx + 1} in this ${topic} course?`,
              options: [
                stage,
                "Unrelated trivia",
                "Skipping fundamentals",
                "None of the above",
              ],
              correctIndex: 0,
              explanation: `Module ${mIdx + 1} focuses specifically on ${stage} in ${topic}.`,
            },
          ],
          videoStoryboard: [
            {
              sceneNumber: 1,
              template: "host_intro" as const,
              heading: `${topic}`,
              subtitle: `Module ${mIdx + 1}: ${stage}`,
              bullets: [level, `Lesson ${lessonNum}`],
              codeSnippet: null,
              defenseLabel: null,
              narration: `Welcome to Okike Academy! In lesson ${lessonNum} on ${topic}, we break down ${stage.toLowerCase()} with clear real-world examples.`,
              visualPrompt: `Okike Host intro for ${topic}`,
              durationSec: 6,
            },
            {
              sceneNumber: 2,
              template: "framework_triad" as const,
              heading: "Core Framework",
              subtitle: stage,
              bullets: [
                "Clarity: Define the exact goal first",
                "Structure: Organize each moving part",
                "Verification: Measure real outcomes",
              ],
              codeSnippet: null,
              defenseLabel: null,
              narration: `Every strong foundation rests on three pillars: clarity on the goal, clean structure for each part, and verification of real outcomes.`,
              visualPrompt: `3-pillar framework diagram for ${topic}`,
              durationSec: 8,
            },
            {
              sceneNumber: 3,
              template: "process_flow" as const,
              heading: "How It Works in Practice",
              subtitle: null,
              bullets: [
                "Input: Identify the trigger",
                "Analysis: Evaluate the risk",
                "Action: Apply the right control",
                "Result: Verified safe outcome",
              ],
              codeSnippet: null,
              defenseLabel: "VERIFIED CONTROL",
              narration: `Watch how the process flows from trigger to analysis, until a verified control steps in to guarantee a reliable outcome.`,
              visualPrompt: `4-step animated process flow for ${topic}`,
              durationSec: 8,
            },
            {
              sceneNumber: 4,
              template: "stat_bars" as const,
              heading: "Real-World Impact",
              subtitle: null,
              bullets: [],
              codeSnippet: null,
              defenseLabel: null,
              stats: [
                { label: "Consistent Fundamentals", percent: 84, highlight: true },
                { label: "Structured Review", percent: 67 },
                { label: "Hands-On Practice", percent: 55 },
              ],
              narration: `In real-world teams, mastering the fundamentals drives over eighty percent of long-term success.`,
              visualPrompt: `Animated data bars for ${topic}`,
              durationSec: 6,
            },
            {
              sceneNumber: 5,
              template: "host_recap" as const,
              heading: "Key Takeaways",
              subtitle: "",
              bullets: [
                `Master ${stage.toLowerCase()} first`,
                "Follow the verified step-by-step flow",
                "Complete the quick quiz below",
              ],
              codeSnippet: null,
              defenseLabel: null,
              narration: `To recap: master ${stage.toLowerCase()} first, follow the verified workflow, and test yourself with the quick quiz below.`,
              visualPrompt: `Okike Host closing recap`,
              durationSec: 6,
            },
          ],
        };
      }),
    };
  });

  return {
    title: `${topic} (${level} Roadmap)`,
    description: `A complete ${level.toLowerCase()} Okike Academy learning roadmap for ${topic}, complete with lesson guides, quizzes, and synced explainer videos.`,
    estimatedHours: Math.max(1, Math.round(moduleCount * lessonsPerModule * 0.5)),
    modules,
  };
}

/**
 * Parses a pasted custom syllabus into modules and lessons.
 * Lines starting with "Module", "##", "#" or ending with ":" start a new module;
 * bulleted/numbered/indented lines underneath become lesson titles.
 */
export function parseCustomSyllabus(
  topic: string,
  level: string,
  rawText: string
): RoadmapOutlinePayload {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const modules: { title: string; summary: string; lessonTitles: string[] }[] = [];
  let current: { title: string; summary: string; lessonTitles: string[] } | null = null;

  for (const line of lines) {
    const isModuleHeader =
      /^#{1,3}\s+/.test(line) ||
      /^module\s+\d+/i.test(line) ||
      /^unit\s+\d+/i.test(line) ||
      /^section\s+\d+/i.test(line) ||
      (line.endsWith(":") && !/^[-*•\d]/.test(line));

    if (isModuleHeader) {
      const cleanTitle = line.replace(/^#{1,3}\s+/, "").replace(/:$/, "").trim();
      current = {
        title: cleanTitle,
        summary: `Structured lessons covering ${cleanTitle}.`,
        lessonTitles: [],
      };
      modules.push(current);
    } else {
      const cleanLesson = line
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();
      if (!cleanLesson) continue;
      if (!current) {
        current = {
          title: `Module 1: ${topic}`,
          summary: `Core lessons for ${topic}.`,
          lessonTitles: [],
        };
        modules.push(current);
      }
      current.lessonTitles.push(cleanLesson);
    }
  }

  const validModules = modules.filter((m) => m.lessonTitles.length > 0);
  if (validModules.length === 0) {
    throw new Error(
      "Could not detect any modules/lessons. Format each module as 'Module 1: Name' followed by lesson titles on new lines."
    );
  }

  const totalLessons = validModules.reduce(
    (acc, m) => acc + m.lessonTitles.length,
    0
  );

  return {
    title: topic,
    description: `Complete ${level.toLowerCase()} curriculum for ${topic} (${validModules.length} modules · ${totalLessons} classes).`,
    estimatedHours: Math.max(2, Math.round(totalLessons * 0.4)),
    modules: validModules,
  };
}

/**
 * Stage 1 (Fast): Generates a large course roadmap outline (up to 20 modules / 150 lessons)
 * without hitting output token limits.
 */
export async function generateRoadmapOutlineWithAI(options: {
  topic: string;
  level: string;
  moduleCount: number;
  lessonsPerModule: number;
}): Promise<{ payload: RoadmapOutlinePayload; usedFallback: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const modules = Array.from({ length: options.moduleCount }, (_, mIdx) => ({
      title: `Module ${mIdx + 1}: ${options.topic} — Stage ${mIdx + 1}`,
      summary: `Key concepts and practical skills for stage ${mIdx + 1} of ${options.topic}.`,
      lessonTitles: Array.from(
        { length: options.lessonsPerModule },
        (_, lIdx) =>
          `Class ${mIdx * options.lessonsPerModule + lIdx + 1}: ${options.topic} Concept ${lIdx + 1}`
      ),
    }));
    return {
      payload: {
        title: `${options.topic} (${options.level} Complete Track)`,
        description: `Full ${options.moduleCount}-module roadmap for ${options.topic}.`,
        estimatedHours: Math.round(
          options.moduleCount * options.lessonsPerModule * 0.4
        ),
        modules,
      },
      usedFallback: true,
    };
  }

  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  const prompt = `Design a comprehensive, industry-grade curriculum roadmap for Okike Academy on: "${options.topic}".
Target level: ${options.level}.
Generate EXACTLY ${options.moduleCount} progressive modules, with EXACTLY ${options.lessonsPerModule} distinct, practical class titles per module (total ${options.moduleCount * options.lessonsPerModule} classes).
Return ONLY valid JSON matching the schema.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          estimatedHours: { type: Type.NUMBER },
          modules: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                lessonTitles: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["title", "summary", "lessonTitles"],
            },
          },
        },
        required: ["title", "description", "estimatedHours", "modules"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty roadmap.");
  return { payload: JSON.parse(text) as RoadmapOutlinePayload, usedFallback: false };
}

/**
 * Stage 2 (Module-by-Module): Generates full lesson guides, quizzes, and 5-scene v5
 * explainer video storyboards for ONE module at a time (never times out, even on 96-class courses).
 */
export async function generateModuleLessonsWithAI(options: {
  courseTitle: string;
  topic: string;
  level: string;
  moduleTitle: string;
  moduleSummary: string;
  lessonTitles: string[];
}): Promise<GeneratedCoursePayload["modules"][number]["lessons"]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const fallback = buildFallbackCourse({
      topic: `${options.topic}: ${options.moduleTitle}`,
      level: options.level,
      moduleCount: 1,
      lessonsPerModule: options.lessonTitles.length,
      videoModel: "okike-v5-female",
    });
    return fallback.modules[0].lessons.map((l, i) => ({
      ...l,
      title: options.lessonTitles[i] || l.title,
    }));
  }

  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  const numbered = options.lessonTitles
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");

  const prompt = `You are an elite curriculum designer and explainer-video director for Okike Academy.
Course: "${options.courseTitle}" (${options.level}).
Module: "${options.moduleTitle}" — ${options.moduleSummary}

Generate complete, high-craft lesson content for EACH of these ${options.lessonTitles.length} classes IN EXACT ORDER:
${numbered}

For EACH class, return:
1. "title" (matching the class title above)
2. "contentMarkdown" (clear, practical tutorial markdown with headings, real-world examples, and tips)
3. "keyTakeaways" (3 concise takeaways)
4. Optional "codeExample" & "codeLanguage" (null if non-technical)
5. "quiz" (2 multiple-choice questions with 4 options, correctIndex 0-3, and explanation)
6. A 5-scene "videoStoryboard" for Okike Studio Explainer Engine v5 (ZERO abstract art):
   - Scene 1: "host_intro"
   - Scenes 2-4: 3 DIFFERENT templates from "framework_triad", "process_flow" (with optional defenseLabel), "stat_bars" (with stats array), "comparison_split", "code_demo", "timeline_steps"
   - Scene 5: "host_recap" with 3 crisp bullets
   - Every scene's narration (15-22 words) must directly explain the exact visuals on screen.

Return ONLY valid JSON matching the schema.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          lessons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                contentMarkdown: { type: Type.STRING },
                keyTakeaways: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                codeExample: { type: Type.STRING, nullable: true },
                codeLanguage: { type: Type.STRING, nullable: true },
                quiz: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      "question",
                      "options",
                      "correctIndex",
                      "explanation",
                    ],
                  },
                },
                videoStoryboard: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sceneNumber: { type: Type.INTEGER },
                      template: {
                        type: Type.STRING,
                        enum: [
                          "host_intro",
                          "framework_triad",
                          "process_flow",
                          "stat_bars",
                          "comparison_split",
                          "code_demo",
                          "timeline_steps",
                          "host_recap",
                        ],
                      },
                      heading: { type: Type.STRING },
                      subtitle: { type: Type.STRING, nullable: true },
                      bullets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      codeSnippet: { type: Type.STRING, nullable: true },
                      defenseLabel: { type: Type.STRING, nullable: true },
                      stats: {
                        type: Type.ARRAY,
                        nullable: true,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            percent: { type: Type.INTEGER },
                            highlight: { type: Type.BOOLEAN },
                          },
                          required: ["label", "percent"],
                        },
                      },
                      narration: { type: Type.STRING },
                      visualPrompt: { type: Type.STRING },
                      durationSec: { type: Type.INTEGER },
                    },
                    required: [
                      "sceneNumber",
                      "template",
                      "heading",
                      "bullets",
                      "narration",
                      "visualPrompt",
                      "durationSec",
                    ],
                  },
                },
              },
              required: [
                "title",
                "contentMarkdown",
                "keyTakeaways",
                "quiz",
                "videoStoryboard",
              ],
            },
          },
        },
        required: ["lessons"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty module lessons.");
  const parsed = JSON.parse(text) as {
    lessons: GeneratedCoursePayload["modules"][number]["lessons"];
  };
  return parsed.lessons;
}
