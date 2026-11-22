import { NextResponse } from "next/server";
import { deleteCourse, getCourseById, queueCourseVideos } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await context.params;
    const course = await getCourseById(courseId);
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    return NextResponse.json({ course });
  } catch (err) {
    console.error("GET /api/courses/[courseId] error:", err);
    return NextResponse.json(
      { error: "Failed to load course" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "queue-videos") {
      const updated = await queueCourseVideos(courseId, body.videoModel);
      return NextResponse.json({ queuedCount: updated });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/courses/[courseId] error:", err);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await context.params;
    await deleteCourse(courseId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/courses/[courseId] error:", err);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 }
    );
  }
}
