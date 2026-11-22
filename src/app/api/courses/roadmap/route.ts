import { NextResponse } from "next/server";
import {
  generateRoadmapOutlineWithAI,
  parseCustomSyllabus,
} from "@/lib/gemini";
import { saveCourseRoadmap } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = String(body.topic || "").trim();
    const level = String(body.level || "Beginner").trim();
    const customSyllabus = String(body.customSyllabus || "").trim();
    const videoModel =
      body.videoModel === "okike-v5-male"
        ? "okike-v5-male"
        : "okike-v5-female";

    if (!topic) {
      return NextResponse.json(
        { error: "Please enter a course topic." },
        { status: 400 }
      );
    }

    if (customSyllabus) {
      const payload = parseCustomSyllabus(topic, level, customSyllabus);
      const course = await saveCourseRoadmap(topic, level, videoModel, payload);
      return NextResponse.json({ course, usedFallback: false, mode: "syllabus" });
    }

    const moduleCount = Math.min(20, Math.max(2, Number(body.moduleCount) || 13));
    const lessonsPerModule = Math.min(
      12,
      Math.max(2, Number(body.lessonsPerModule) || 7)
    );

    const { payload, usedFallback } = await generateRoadmapOutlineWithAI({
      topic,
      level,
      moduleCount,
      lessonsPerModule,
    });

    const course = await saveCourseRoadmap(topic, level, videoModel, payload);
    return NextResponse.json({ course, usedFallback, mode: "ai-roadmap" });
  } catch (err) {
    console.error("POST /api/courses/roadmap error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create roadmap",
      },
      { status: 500 }
    );
  }
}
