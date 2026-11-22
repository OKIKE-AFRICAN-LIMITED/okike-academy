import { NextResponse } from "next/server";
import { updateLesson } from "@/lib/db";
import type { VideoStatus } from "@/lib/types";

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
    const body = await request.json();
    const status = String(body.status || "processing") as VideoStatus;
    const error = body.error ? String(body.error) : null;
    const updated = await updateLesson(lessonId, {
      videoStatus: status,
      videoError: error,
    });
    if (!updated) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, videoStatus: updated.videoStatus });
  } catch (err) {
    console.error("POST /api/worker/jobs/[lessonId]/status error:", err);
    return NextResponse.json(
      { error: "Failed to update job status" },
      { status: 500 }
    );
  }
}
