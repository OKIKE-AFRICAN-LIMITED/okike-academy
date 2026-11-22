import { createClient, type Client } from "@libsql/client";
import crypto from "crypto";
import type {
  Course,
  CourseModule,
  CourseSummary,
  GeneratedCoursePayload,
  Lesson,
  QuizQuestion,
  VideoScene,
  VideoStatus,
} from "./types";

let _client: Client | null = null;
let _initialized = false;

function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL || "file:./academy.db";
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
    _client = createClient({ url, authToken });
  }
  return _client;
}

export async function ensureDb(): Promise<Client> {
  const db = getClient();
  if (_initialized) return db;

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      description TEXT NOT NULL,
      level TEXT NOT NULL,
      estimated_hours REAL NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      content_markdown TEXT NOT NULL,
      key_takeaways_json TEXT NOT NULL,
      code_example TEXT,
      code_language TEXT,
      quiz_json TEXT NOT NULL,
      video_storyboard_json TEXT NOT NULL,
      video_status TEXT NOT NULL DEFAULT 'pending',
      video_url TEXT,
      subtitle_url TEXT,
      video_model TEXT NOT NULL DEFAULT 'ltx-video',
      video_error TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  _initialized = true;

  // Seed one starter course if empty so the platform is immediately explorable
  const existing = await db.execute("SELECT COUNT(*) as cnt FROM courses");
  const count = Number(existing.rows[0]?.cnt ?? 0);
  if (count === 0) {
    await seedStarterCourse();
  }

  return db;
}

function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "course"}-${suffix}`;
}

export async function saveGeneratedCourse(
  topic: string,
  level: string,
  videoModel: string,
  payload: GeneratedCoursePayload
): Promise<Course> {
  const db = await ensureDb();
  const courseId = crypto.randomUUID();
  const slug = makeSlug(payload.title);
  const createdAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO courses (id, slug, title, topic, description, level, estimated_hours, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      courseId,
      slug,
      payload.title,
      topic,
      payload.description,
      level,
      payload.estimatedHours || 2,
      createdAt,
    ],
  });

  for (let mIdx = 0; mIdx < payload.modules.length; mIdx++) {
    const mod = payload.modules[mIdx];
    const moduleId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO modules (id, course_id, title, summary, order_index)
            VALUES (?, ?, ?, ?, ?)`,
      args: [moduleId, courseId, mod.title, mod.summary, mIdx],
    });

    for (let lIdx = 0; lIdx < mod.lessons.length; lIdx++) {
      const lesson = mod.lessons[lIdx];
      const lessonId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO lessons (
                id, module_id, course_id, title, order_index,
                content_markdown, key_takeaways_json, code_example, code_language,
                quiz_json, video_storyboard_json, video_status, video_model, completed
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0)`,
        args: [
          lessonId,
          moduleId,
          courseId,
          lesson.title,
          lIdx,
          lesson.contentMarkdown,
          JSON.stringify(lesson.keyTakeaways || []),
          lesson.codeExample ?? null,
          lesson.codeLanguage ?? null,
          JSON.stringify(lesson.quiz || []),
          JSON.stringify(lesson.videoStoryboard || []),
          videoModel || "ltx-video",
        ],
      });
    }
  }

  const created = await getCourseById(courseId);
  if (!created) throw new Error("Failed to load newly created course");
  return created;
}

export interface RoadmapOutlinePayload {
  title: string;
  description: string;
  estimatedHours: number;
  modules: {
    title: string;
    summary: string;
    lessonTitles: string[];
  }[];
}

export async function saveCourseRoadmap(
  topic: string,
  level: string,
  videoModel: string,
  payload: RoadmapOutlinePayload
): Promise<Course> {
  const db = await ensureDb();
  const courseId = crypto.randomUUID();
  const slug = makeSlug(payload.title);
  const createdAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO courses (id, slug, title, topic, description, level, estimated_hours, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      courseId,
      slug,
      payload.title,
      topic,
      payload.description,
      level,
      payload.estimatedHours || Math.max(2, payload.modules.length * 1.5),
      createdAt,
    ],
  });

  for (let mIdx = 0; mIdx < payload.modules.length; mIdx++) {
    const mod = payload.modules[mIdx];
    const moduleId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO modules (id, course_id, title, summary, order_index)
            VALUES (?, ?, ?, ?, ?)`,
      args: [moduleId, courseId, mod.title, mod.summary, mIdx],
    });

    for (let lIdx = 0; lIdx < mod.lessonTitles.length; lIdx++) {
      const lessonTitle = mod.lessonTitles[lIdx];
      const lessonId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO lessons (
                id, module_id, course_id, title, order_index,
                content_markdown, key_takeaways_json, code_example, code_language,
                quiz_json, video_storyboard_json, video_status, video_model, completed
              ) VALUES (?, ?, ?, ?, ?, '', '[]', NULL, NULL, '[]', '[]', 'pending', ?, 0)`,
        args: [
          lessonId,
          moduleId,
          courseId,
          lessonTitle,
          lIdx,
          videoModel || "okike-v5-female",
        ],
      });
    }
  }

  const created = await getCourseById(courseId);
  if (!created) throw new Error("Failed to load newly created roadmap");
  return created;
}

export async function getModuleContext(moduleId: string): Promise<{
  moduleId: string;
  moduleTitle: string;
  moduleSummary: string;
  courseId: string;
  courseTitle: string;
  topic: string;
  level: string;
  lessons: Lesson[];
} | null> {
  const db = await ensureDb();
  const mRes = await db.execute({
    sql: `SELECT m.*, c.title AS course_title, c.topic, c.level
          FROM modules m
          JOIN courses c ON c.id = m.course_id
          WHERE m.id = ? LIMIT 1`,
    args: [moduleId],
  });
  if (mRes.rows.length === 0) return null;
  const row = mRes.rows[0];
  const lRes = await db.execute({
    sql: "SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index ASC",
    args: [moduleId],
  });

  return {
    moduleId: String(row.id),
    moduleTitle: String(row.title),
    moduleSummary: String(row.summary),
    courseId: String(row.course_id),
    courseTitle: String(row.course_title),
    topic: String(row.topic),
    level: String(row.level),
    lessons: lRes.rows.map((r) => mapLessonRow(r as Record<string, unknown>)),
  };
}

export async function populateModuleLessons(
  existingLessons: Lesson[],
  generatedLessons: GeneratedCoursePayload["modules"][number]["lessons"],
  autoQueueVideos: boolean
): Promise<void> {
  const db = await ensureDb();
  for (let i = 0; i < existingLessons.length; i++) {
    const target = existingLessons[i];
    const gen = generatedLessons[i];
    if (!gen) continue;

    await db.execute({
      sql: `UPDATE lessons
            SET title = ?,
                content_markdown = ?,
                key_takeaways_json = ?,
                code_example = ?,
                code_language = ?,
                quiz_json = ?,
                video_storyboard_json = ?,
                video_status = CASE
                  WHEN video_status = 'ready' THEN 'ready'
                  WHEN ? = 1 THEN 'queued'
                  ELSE 'pending'
                END,
                video_error = NULL
            WHERE id = ?`,
      args: [
        gen.title || target.title,
        gen.contentMarkdown,
        JSON.stringify(gen.keyTakeaways || []),
        gen.codeExample ?? null,
        gen.codeLanguage ?? null,
        JSON.stringify(gen.quiz || []),
        JSON.stringify(gen.videoStoryboard || []),
        autoQueueVideos ? 1 : 0,
        target.id,
      ],
    });
  }
}

export async function listCourses(): Promise<CourseSummary[]> {
  const db = await ensureDb();
  const res = await db.execute(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.completed = 1) AS completed_lessons,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.video_status = 'ready') AS ready_videos
    FROM courses c
    ORDER BY c.created_at DESC
  `);

  return res.rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    topic: String(row.topic),
    description: String(row.description),
    level: String(row.level),
    estimatedHours: Number(row.estimated_hours),
    createdAt: String(row.created_at),
    moduleCount: Number(row.module_count),
    lessonCount: Number(row.lesson_count),
    completedLessons: Number(row.completed_lessons),
    readyVideos: Number(row.ready_videos),
  }));
}

function mapLessonRow(row: Record<string, unknown>): Lesson {
  return {
    id: String(row.id),
    moduleId: String(row.module_id),
    courseId: String(row.course_id),
    title: String(row.title),
    orderIndex: Number(row.order_index),
    contentMarkdown: String(row.content_markdown),
    keyTakeaways: JSON.parse(String(row.key_takeaways_json || "[]")) as string[],
    codeExample: row.code_example ? String(row.code_example) : null,
    codeLanguage: row.code_language ? String(row.code_language) : null,
    quiz: JSON.parse(String(row.quiz_json || "[]")) as QuizQuestion[],
    videoStoryboard: JSON.parse(
      String(row.video_storyboard_json || "[]")
    ) as VideoScene[],
    videoStatus: String(row.video_status || "pending") as VideoStatus,
    videoUrl: row.video_url ? String(row.video_url) : null,
    subtitleUrl: row.subtitle_url ? String(row.subtitle_url) : null,
    videoModel: String(row.video_model || "ltx-video"),
    videoError: row.video_error ? String(row.video_error) : null,
    completed: Number(row.completed) === 1,
  };
}

export async function getCourseById(courseId: string): Promise<Course | null> {
  const db = await ensureDb();
  const cRes = await db.execute({
    sql: "SELECT * FROM courses WHERE id = ? OR slug = ? LIMIT 1",
    args: [courseId, courseId],
  });
  if (cRes.rows.length === 0) return null;
  const cRow = cRes.rows[0];
  const actualId = String(cRow.id);

  const mRes = await db.execute({
    sql: "SELECT * FROM modules WHERE course_id = ? ORDER BY order_index ASC",
    args: [actualId],
  });
  const lRes = await db.execute({
    sql: "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC",
    args: [actualId],
  });

  const lessonsByModule = new Map<string, Lesson[]>();
  for (const row of lRes.rows) {
    const lesson = mapLessonRow(row as Record<string, unknown>);
    const list = lessonsByModule.get(lesson.moduleId) || [];
    list.push(lesson);
    lessonsByModule.set(lesson.moduleId, list);
  }

  const modules: CourseModule[] = mRes.rows.map((row) => ({
    id: String(row.id),
    courseId: String(row.course_id),
    title: String(row.title),
    summary: String(row.summary),
    orderIndex: Number(row.order_index),
    lessons: lessonsByModule.get(String(row.id)) || [],
  }));

  return {
    id: actualId,
    slug: String(cRow.slug),
    title: String(cRow.title),
    topic: String(cRow.topic),
    description: String(cRow.description),
    level: String(cRow.level),
    estimatedHours: Number(cRow.estimated_hours),
    createdAt: String(cRow.created_at),
    modules,
  };
}

export async function deleteCourse(courseId: string): Promise<void> {
  const db = await ensureDb();
  await db.execute({ sql: "DELETE FROM lessons WHERE course_id = ?", args: [courseId] });
  await db.execute({ sql: "DELETE FROM modules WHERE course_id = ?", args: [courseId] });
  await db.execute({ sql: "DELETE FROM courses WHERE id = ?", args: [courseId] });
}

export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const db = await ensureDb();
  const res = await db.execute({
    sql: "SELECT * FROM lessons WHERE id = ? LIMIT 1",
    args: [lessonId],
  });
  if (res.rows.length === 0) return null;
  return mapLessonRow(res.rows[0] as Record<string, unknown>);
}

export async function updateLesson(
  lessonId: string,
  patch: Partial<{
    completed: boolean;
    videoStatus: VideoStatus;
    videoUrl: string | null;
    subtitleUrl: string | null;
    videoModel: string;
    videoError: string | null;
    videoStoryboard: VideoScene[];
  }>
): Promise<Lesson | null> {
  const db = await ensureDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (patch.completed !== undefined) {
    fields.push("completed = ?");
    args.push(patch.completed ? 1 : 0);
  }
  if (patch.videoStatus !== undefined) {
    fields.push("video_status = ?");
    args.push(patch.videoStatus);
  }
  if (patch.videoUrl !== undefined) {
    fields.push("video_url = ?");
    args.push(patch.videoUrl);
  }
  if (patch.subtitleUrl !== undefined) {
    fields.push("subtitle_url = ?");
    args.push(patch.subtitleUrl);
  }
  if (patch.videoModel !== undefined) {
    fields.push("video_model = ?");
    args.push(patch.videoModel);
  }
  if (patch.videoError !== undefined) {
    fields.push("video_error = ?");
    args.push(patch.videoError);
  }
  if (patch.videoStoryboard !== undefined) {
    fields.push("video_storyboard_json = ?");
    args.push(JSON.stringify(patch.videoStoryboard));
  }

  if (fields.length > 0) {
    args.push(lessonId);
    await db.execute({
      sql: `UPDATE lessons SET ${fields.join(", ")} WHERE id = ?`,
      args,
    });
  }

  return getLessonById(lessonId);
}

export async function queueCourseVideos(
  courseId: string,
  videoModel?: string
): Promise<number> {
  const db = await ensureDb();
  const res = await db.execute({
    sql: videoModel
      ? `UPDATE lessons SET video_status = 'queued', video_model = ?, video_error = NULL
         WHERE course_id = ? AND video_status IN ('pending', 'failed')`
      : `UPDATE lessons SET video_status = 'queued', video_error = NULL
         WHERE course_id = ? AND video_status IN ('pending', 'failed')`,
    args: videoModel ? [videoModel, courseId] : [courseId],
  });
  return res.rowsAffected;
}

export interface VideoJobItem {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  moduleTitle: string;
  lessonTitle: string;
  videoStatus: VideoStatus;
  videoModel: string;
  videoUrl: string | null;
  videoError: string | null;
  videoStoryboard: VideoScene[];
}

export async function listVideoJobs(onlyQueued = false): Promise<VideoJobItem[]> {
  const db = await ensureDb();
  const where = onlyQueued ? "WHERE l.video_status = 'queued'" : "";
  const res = await db.execute(`
    SELECT
      l.id AS lesson_id,
      l.course_id,
      c.title AS course_title,
      m.title AS module_title,
      l.title AS lesson_title,
      l.video_status,
      l.video_model,
      l.video_url,
      l.video_error,
      l.video_storyboard_json
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = l.course_id
    ${where}
    ORDER BY c.created_at DESC, m.order_index ASC, l.order_index ASC
  `);

  return res.rows.map((row) => ({
    lessonId: String(row.lesson_id),
    courseId: String(row.course_id),
    courseTitle: String(row.course_title),
    moduleTitle: String(row.module_title),
    lessonTitle: String(row.lesson_title),
    videoStatus: String(row.video_status) as VideoStatus,
    videoModel: String(row.video_model || "ltx-video"),
    videoUrl: row.video_url ? String(row.video_url) : null,
    videoError: row.video_error ? String(row.video_error) : null,
    videoStoryboard: JSON.parse(
      String(row.video_storyboard_json || "[]")
    ) as VideoScene[],
  }));
}

async function seedStarterCourse(): Promise<void> {
  const starter: GeneratedCoursePayload = {
    title: "Modern HTML & Web Foundations",
    description:
      "Learn how the web works from scratch—build semantic web pages, style layouts, and add interactivity step by step.",
    estimatedHours: 3,
    modules: [
      {
        title: "Module 1: How the Web Works",
        summary: "Understand browsers, HTML documents, and semantic structure.",
        lessons: [
          {
            title: "Introduction to HTML Documents",
            contentMarkdown: `## What is HTML?

**HTML (HyperText Markup Language)** is the standard language used to structure content on the web. Every website you visit—from search engines to learning platforms—starts with an HTML document.

### Anatomy of an HTML Element

An HTML element consists of an **opening tag**, **content**, and a **closing tag**:

- \`<h1>\` defines a top-level heading
- \`<p>\` defines a paragraph of text
- \`<a href="...">\` creates a clickable hyperlink

> **Tip:** Always start your file with \`<!DOCTYPE html>\` so modern browsers render your page in standards mode.`,
            keyTakeaways: [
              "HTML defines the structure and meaning of web page content.",
              "Elements wrap content with opening and closing tags.",
              "Semantic tags improve accessibility and search engine ranking.",
            ],
            codeExample: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My First Page</title>
  </head>
  <body style="font-family: sans-serif; padding: 20px;">
    <h1 style="color: #04AA6D;">Hello, Academy!</h1>
    <p>This is a live interactive HTML example.</p>
    <button onclick="alert('You clicked the button!')" style="padding: 8px 16px; background: #04AA6D; color: white; border: none; border-radius: 6px; cursor: pointer;">
      Try Clicking Me
    </button>
  </body>
</html>`,
            codeLanguage: "html",
            quiz: [
              {
                question: "What does HTML stand for?",
                options: [
                  "HyperText Markup Language",
                  "High Transfer Machine Language",
                  "Hyperlink Text Styling Language",
                  "Home Tool Markup Language",
                ],
                correctIndex: 0,
                explanation:
                  "HTML stands for HyperText Markup Language, the standard markup language for web pages.",
              },
              {
                question: "Which tag is used for the most important heading?",
                options: ["<head>", "<heading>", "<h1>", "<title>"],
                correctIndex: 2,
                explanation:
                  "<h1> represents the primary top-level heading inside the document body.",
              },
            ],
            videoStoryboard: [
              {
                sceneNumber: 1,
                narration:
                  "Welcome to Modern HTML! Every website on earth starts with HTML, the blueprint that tells your browser what to display.",
                visualPrompt:
                  "Cinematic 4k motion graphics of glowing wireframe web pages assembling in a dark modern studio, clean emerald green light accents, smooth camera pan, crisp lighting",
                durationSec: 6,
              },
              {
                sceneNumber: 2,
                narration:
                  "Think of HTML elements like labeled building blocks: headings, paragraphs, images, and buttons nested cleanly inside each other.",
                visualPrompt:
                  "Minimalist 3D translucent glass building blocks snapping together smoothly on a clean white desk, soft studio shadows, educational documentary style, high clarity",
                durationSec: 6,
              },
              {
                sceneNumber: 3,
                narration:
                  "Once you master semantic HTML tags, your sites immediately become faster, more accessible, and ready for CSS styling.",
                visualPrompt:
                  "Close-up of a sleek laptop screen glowing softly on a wooden desk in a sunlit study, warm bokeh background, inspiring educational vibe, smooth slow zoom",
                durationSec: 6,
              },
            ],
          },
          {
            title: "Semantic Layout Elements",
            contentMarkdown: `## Why Semantic HTML Matters

Instead of wrapping everything in generic \`<div>\` containers, modern HTML5 provides **semantic landmarks** that describe the role of each section:

- \`<header>\`: Top navigation or hero banner
- \`<nav>\`: Primary navigation links
- \`<main>\`: Core unique content of the page
- \`<article>\`: Self-contained content like a lesson or blog post
- \`<footer>\`: Copyright, links, and metadata

### Accessibility Benefit

Screen readers and search engines rely on semantic tags to jump directly to the main content without guessing.`,
            keyTakeaways: [
              "Use <header>, <nav>, <main>, <article>, and <footer> instead of generic divs.",
              "Semantic HTML makes pages easier for screen readers and search engines to understand.",
              "Keep only one <main> element per page.",
            ],
            codeExample: `<header style="background:#1e293b; color:white; padding:12px 16px; border-radius:8px;">
  <strong>My Academy</strong>
</header>
<main style="padding:16px; font-family:sans-serif;">
  <article>
    <h2 style="color:#04AA6D;">Semantic Layouts</h2>
    <p>Semantic tags give clear meaning to your page structure.</p>
  </article>
</main>`,
            codeLanguage: "html",
            quiz: [
              {
                question: "Which element represents the primary unique content of a page?",
                options: ["<section>", "<main>", "<div>", "<aside>"],
                correctIndex: 1,
                explanation:
                  "The <main> landmark identifies the dominant content of the <body>.",
              },
            ],
            videoStoryboard: [
              {
                sceneNumber: 1,
                narration:
                  "A well-built webpage is organized like a magazine: a clear header at the top, navigation on the side, and main content front and center.",
                visualPrompt:
                  "Overhead shot of clean architectural blueprint grid paper with crisp geometric zones lighting up in emerald green, studio lighting, steady slow camera glide",
                durationSec: 6,
              },
              {
                sceneNumber: 2,
                narration:
                  "Using semantic tags like header, nav, and main helps both human readers and assistive technologies navigate effortlessly.",
                visualPrompt:
                  "Modern minimalist workspace with dual monitors displaying clean structured UI layouts, soft natural window light, cinematic depth of field",
                durationSec: 6,
              },
            ],
          },
        ],
      },
      {
        title: "Module 2: Styling & Visual Polish",
        summary: "Bring web pages to life with CSS colors, spacing, and Flexbox.",
        lessons: [
          {
            title: "The CSS Box Model & Flexbox",
            contentMarkdown: `## Mastering Layout with Flexbox

Every HTML element is a rectangular box made of **content**, **padding**, **border**, and **margin**.

### Flex Containers

Adding \`display: flex\` to a parent container unlocks effortless alignment:

- \`justify-content\`: Aligns items along the main axis (horizontally by default)
- \`align-items\`: Aligns items along the cross axis (vertically by default)
- \`gap\`: Adds clean spacing between child elements without messy margins`,
            keyTakeaways: [
              "Every element follows the Box Model: content, padding, border, and margin.",
              "Flexbox simplifies responsive alignment with justify-content, align-items, and gap.",
            ],
            codeExample: `<div style="display:flex; gap:12px; justify-content:center; align-items:center; padding:24px; background:#f1f5f9; border-radius:10px; font-family:sans-serif;">
  <div style="background:#04AA6D; color:white; padding:16px 24px; border-radius:8px;">Box 1</div>
  <div style="background:#0f172a; color:white; padding:16px 24px; border-radius:8px;">Box 2</div>
  <div style="background:#0284c7; color:white; padding:16px 24px; border-radius:8px;">Box 3</div>
</div>`,
            codeLanguage: "html",
            quiz: [
              {
                question: "Which CSS property controls spacing between flex items?",
                options: ["spacing", "gap", "inner-margin", "flex-space"],
                correctIndex: 1,
                explanation:
                  "The CSS gap property cleanly sets the gutter between flex or grid items.",
              },
            ],
            videoStoryboard: [
              {
                sceneNumber: 1,
                narration:
                  "CSS transforms raw structure into engaging design. Every element lives inside a box with padding, borders, and margins.",
                visualPrompt:
                  "Vibrant 3D motion graphic of colorful layered cards floating and aligning neatly into a balanced horizontal row on a clean light background, crisp studio lighting",
                durationSec: 6,
              },
              {
                sceneNumber: 2,
                narration:
                  "With Flexbox, a single line of CSS aligns cards, navigation bars, and buttons smoothly across phones, tablets, and desktops.",
                visualPrompt:
                  "Sleek tablet, laptop, and smartphone resting on a clean desk showing harmonious responsive green-and-white web interfaces, gentle camera orbit",
                durationSec: 6,
              },
            ],
          },
        ],
      },
    ],
  };

  await saveGeneratedCourse(
    "Modern HTML & Web Foundations",
    "Beginner",
    "ltx-video",
    starter
  );
}
