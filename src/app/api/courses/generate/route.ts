import { NextResponse } from "next/server";
import { generateCourseWithAI } from "@/lib/gemini";
import { saveGeneratedCourse } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = String(body.topic || "").trim();
    const level = String(body.level || "Beginner").trim();
    const moduleCount = Math.min(6, Math.max(2, Number(body.moduleCount) || 3));
    const lessonsPerModule = Math.min(
      4,
      Math.max(1, Number(body.lessonsPerModule) || 2)
    );
    const allowedModels = [
      "okike-v5-female",
      "okike-v5-male",
      "manim-kokoro",
      "ltx-video",
      "wan2.1",
    ];
    const videoModel = allowedModels.includes(body.videoModel)
      ? body.videoModel
      : "okike-v5-female";

    if (!topic) {
      return NextResponse.json(
        { error: "Please enter a course topic." },
        { status: 400 }
      );
    }

    const { payload, usedFallback } = await generateCourseWithAI({
      topic,
      level,
      moduleCount,
      lessonsPerModule,
      videoModel,
    });

    const course = await saveGeneratedCourse(topic, level, videoModel, payload);

    return NextResponse.json({
      course,
      usedFallback,
    });
  } catch (err) {
    console.error("POST /api/courses/generate error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate course",
      },
      { status: 500 }
    );
  }
}
