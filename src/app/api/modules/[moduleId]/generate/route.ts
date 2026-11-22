import { NextResponse } from "next/server";
import {
  getCourseById,
  getModuleContext,
  populateModuleLessons,
} from "@/lib/db";
import { generateModuleLessonsWithAI } from "@/lib/gemini";

export async function POST(
  request: Request,
  context: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const autoQueueVideos = body.autoQueueVideos !== false;

    const ctx = await getModuleContext(moduleId);
    if (!ctx) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Process in chunks of up to 4 lessons per Gemini call so even 10-lesson modules never time out
    const chunkSize = 4;
    for (let i = 0; i < ctx.lessons.length; i += chunkSize) {
      const slice = ctx.lessons.slice(i, i + chunkSize);
      const generated = await generateModuleLessonsWithAI({
        courseTitle: ctx.courseTitle,
        topic: ctx.topic,
        level: ctx.level,
        moduleTitle: ctx.moduleTitle,
        moduleSummary: ctx.moduleSummary,
        lessonTitles: slice.map((l) => l.title),
      });
      await populateModuleLessons(slice, generated, autoQueueVideos);
    }

    const updatedCourse = await getCourseById(ctx.courseId);
    return NextResponse.json({
      ok: true,
      course: updatedCourse,
      generatedCount: ctx.lessons.length,
    });
  } catch (err) {
    console.error("POST /api/modules/[moduleId]/generate error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate module lessons",
      },
      { status: 500 }
    );
  }
}
