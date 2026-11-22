import { NextResponse } from "next/server";
import { getLessonById, updateLesson } from "@/lib/db";
import { storeMediaFile } from "@/lib/storage";

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const lesson = await getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const videoUrl = String(body.videoUrl || "").trim();
      if (!videoUrl) {
        return NextResponse.json(
          { error: "Please provide a valid video URL." },
          { status: 400 }
        );
      }
      const updated = await updateLesson(lessonId, {
        videoUrl,
        subtitleUrl: body.subtitleUrl ? String(body.subtitleUrl).trim() : null,
        videoStatus: "ready",
        videoError: null,
      });
      return NextResponse.json({ lesson: updated });
    }

    const formData = await request.formData();
    const videoFile = formData.get("video");
    const subtitleFile = formData.get("subtitles");

    if (!(videoFile instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'video' file in form data." },
        { status: 400 }
      );
    }

    const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, "");
    const isWebm = videoFile.name.toLowerCase().endsWith(".webm");
    const ext = isWebm ? "webm" : "mp4";
    const videoUrl = await storeMediaFile(
      `${safeId}.${ext}`,
      Buffer.from(await videoFile.arrayBuffer()),
      isWebm ? "video/webm" : "video/mp4"
    );

    let subtitleUrl: string | null = lesson.subtitleUrl;
    if (subtitleFile instanceof File) {
      subtitleUrl = await storeMediaFile(
        `${safeId}.vtt`,
        Buffer.from(await subtitleFile.arrayBuffer()),
        "text/vtt; charset=utf-8"
      );
    }

    const updated = await updateLesson(lessonId, {
      videoUrl,
      subtitleUrl,
      videoStatus: "ready",
      videoError: null,
    });

    return NextResponse.json({ lesson: updated });
  } catch (err) {
    console.error("POST /api/lessons/[lessonId]/video error:", err);
    return NextResponse.json(
      { error: "Failed to save video" },
      { status: 500 }
    );
  }
}
