import { NextResponse } from "next/server";
import { listCourses } from "@/lib/db";

export async function GET() {
  try {
    const courses = await listCourses();
    return NextResponse.json({ courses });
  } catch (err) {
    console.error("GET /api/courses error:", err);
    return NextResponse.json(
      { error: "Failed to load courses" },
      { status: 500 }
    );
  }
}
