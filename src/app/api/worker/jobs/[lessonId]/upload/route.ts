import { NextResponse } from "next/server";
import { getLessonById, updateLesson } from "@/lib/db";
import { storeMediaFile } from "@/lib/storage";

function isAuthorized(request: Request): boolean {
  const secret = process.env.WORKER_API_KEY?.trim();
  if (!secret) return true;
  return (request.headers.get("x-worker-key") || "") === secret;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
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
          { error: "Missing 'videoUrl' in JSON body" },
          { status: 400 }
        );
      }
      const subtitleUrl = body.subtitleUrl
        ? String(body.subtitleUrl).trim()
        : null;
      const portraitVideoUrl = body.portraitVideoUrl
        ? String(body.portraitVideoUrl).trim()
        : null;
      const transcriptText = body.transcriptText
        ? String(body.transcriptText)
        : null;
      const licenses = Array.isArray(body.licenses) ? body.licenses : undefined;
      const qaReport = body.qaReport && typeof body.qaReport === "object"
        ? body.qaReport
        : undefined;

      const updated = await updateLesson(lessonId, {
        videoUrl,
        portraitVideoUrl,
        subtitleUrl,
        transcriptText,
        ...(licenses ? { licenses } : {}),
        ...(qaReport ? { qaReport } : {}),
        videoStatus: "ready",
        videoError: null,
      });
      return NextResponse.json({
        ok: true,
        videoUrl: updated?.videoUrl,
        subtitleUrl: updated?.subtitleUrl,
      });
    }

    const formData = await request.formData();
    const videoFile = formData.get("video");
    const subtitleFile = formData.get("subtitles");

    if (!(videoFile instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'video' file" },
        { status: 400 }
      );
    }

    const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, "");
    const videoUrl = await storeMediaFile(
      `${safeId}.mp4`,
      Buffer.from(await videoFile.arrayBuffer()),
      "video/mp4"
    );

    let subtitleUrl: string | null = null;
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

    return NextResponse.json({
      ok: true,
      videoUrl: updated?.videoUrl,
      subtitleUrl: updated?.subtitleUrl,
    });
  } catch (err) {
    console.error("POST /api/worker/jobs/[lessonId]/upload error:", err);
    return NextResponse.json(
      { error: "Failed to store worker video" },
      { status: 500 }
    );
  }
}
