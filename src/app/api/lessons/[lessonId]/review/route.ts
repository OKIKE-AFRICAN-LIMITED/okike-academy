import { NextResponse } from "next/server";
import { getLessonById, updateLesson } from "@/lib/db";
import type { SmeReview } from "@/lib/types";

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

    const body = await request.json();
    const reviewerName = String(body.reviewerName || "").trim();
    if (!reviewerName) {
      return NextResponse.json(
        { error: "Reviewer name is required for institutional sign-off." },
        { status: 400 }
      );
    }

    const s = body.scores || {};
    const clamp = (v: unknown) => Math.max(1, Math.min(5, Math.round(Number(v) || 4)));
    const scores = {
      hook: clamp(s.hook),
      variety: clamp(s.variety),
      clarity: clamp(s.clarity),
      visualFit: clamp(s.visualFit),
      sync: clamp(s.sync),
      mobileReadability: clamp(s.mobileReadability),
      depth: clamp(s.depth),
      accuracy: clamp(s.accuracy),
    };
    const vals = Object.values(scores);
    const averageScore = Number(
      (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
    );
    const approved = averageScore >= 4.0;

    const smeReview: SmeReview = {
      reviewerName,
      reviewerTitle: String(body.reviewerTitle || "Subject-Matter Expert").trim(),
      reviewedAt: new Date().toISOString(),
      scores,
      averageScore,
      approved,
      notes: String(body.notes || "").trim(),
    };

    const updated = await updateLesson(lessonId, { smeReview });
    return NextResponse.json({ ok: true, smeReview: updated?.smeReview });
  } catch (err) {
    console.error("POST /api/lessons/[lessonId]/review error:", err);
    return NextResponse.json(
      { error: "Failed to record institutional SME review" },
      { status: 500 }
    );
  }
}
