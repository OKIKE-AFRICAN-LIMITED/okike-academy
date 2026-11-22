import { NextResponse } from "next/server";
import { getLessonById, updateLesson } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const lesson = await getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    return NextResponse.json({ lesson });
  } catch (err) {
    console.error("GET /api/lessons/[lessonId] error:", err);
    return NextResponse.json(
      { error: "Failed to load lesson" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const body = await request.json();
    const updated = await updateLesson(lessonId, {
      completed:
        typeof body.completed === "boolean" ? body.completed : undefined,
      videoStatus: body.videoStatus,
      videoModel: body.videoModel,
      videoError: body.videoError,
      videoStoryboard: Array.isArray(body.videoStoryboard)
        ? body.videoStoryboard
        : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    return NextResponse.json({ lesson: updated });
  } catch (err) {
    console.error("PATCH /api/lessons/[lessonId] error:", err);
    return NextResponse.json(
      { error: "Failed to update lesson" },
      { status: 500 }
    );
  }
}
