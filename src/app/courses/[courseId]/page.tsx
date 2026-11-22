import { notFound } from "next/navigation";
import { getCourseById } from "@/lib/db";
import { CoursePlayer } from "@/components/CoursePlayer";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourseById(courseId);

  if (!course) {
    notFound();
  }

  return <CoursePlayer initialCourse={course} />;
}
