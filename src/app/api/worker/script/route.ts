import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "worker", "render_motion.py");
    const content = await readFile(scriptPath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Worker script not found" }, { status: 404 });
  }
}
