import { NextResponse } from "next/server";
import { listVideoJobs } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  const secret = process.env.WORKER_API_KEY?.trim();
  if (!secret) return true;
  const header = request.headers.get("x-worker-key") || "";
  return header === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const onlyQueued = searchParams.get("queued") === "true";
    const jobs = await listVideoJobs(onlyQueued);
    return NextResponse.json({ jobs });
  } catch (err) {
    console.error("GET /api/worker/jobs error:", err);
    return NextResponse.json(
      { error: "Failed to load video jobs" },
      { status: 500 }
    );
  }
}
