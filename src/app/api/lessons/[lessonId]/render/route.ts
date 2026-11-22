import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { getCourseById, getLessonById, updateLesson } from "@/lib/db";

const execFileAsync = promisify(execFile);

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params;
  const lesson = await getLessonById(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const voice = String(body.voice || "am_michael");
  const quality = ["l", "m", "h"].includes(body.quality) ? body.quality : "m";

  const course = await getCourseById(lesson.courseId);
  const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, "");
  const videosDir = path.join(process.cwd(), "public", "videos");
  await mkdir(videosDir, { recursive: true });

  const outMp4 = path.join(videosDir, `${safeId}.mp4`);
  const tmpJson = path.join(os.tmpdir(), `storyboard-${safeId}.json`);
  const scriptPath = path.join(process.cwd(), "worker", "render_motion.py");

  await updateLesson(lessonId, { videoStatus: "processing", videoError: null });

  try {
    await writeFile(
      tmpJson,
      JSON.stringify(
        {
          lessonId: lesson.id,
          courseTitle: course?.title || "OpenAcademy",
          lessonTitle: lesson.title,
          videoStoryboard: lesson.videoStoryboard,
        },
        null,
        2
      ),
      "utf-8"
    );

    await execFileAsync(
      "python",
      [
        scriptPath,
        "--storyboard-json",
        tmpJson,
        "--output",
        outMp4,
        "--voice",
        voice,
        "--quality",
        quality,
      ],
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }
    );

    const ts = Date.now();
    const updated = await updateLesson(lessonId, {
      videoStatus: "ready",
      videoUrl: `/videos/${safeId}.mp4?t=${ts}`,
      subtitleUrl: `/videos/${safeId}.vtt?t=${ts}`,
      videoModel: "manim-kokoro",
      videoError: null,
    });

    return NextResponse.json({ lesson: updated });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Local motion render failed";
    const friendly = msg.includes("No module named 'manim'")
      ? "Manim is not installed on your local PC yet. Use the Storyboard JSON button + Google Colab notebook (worker/OpenSource_Video_Worker_Colab.ipynb), or install Manim locally."
      : msg.slice(0, 300);

    await updateLesson(lessonId, {
      videoStatus: "failed",
      videoError: friendly,
    });

    return NextResponse.json({ error: friendly }, { status: 500 });
  } finally {
    await rm(tmpJson, { force: true }).catch(() => {});
  }
}
