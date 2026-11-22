import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const ALLOWED: Record<string, string> = {
  "package.json": "package.json",
  "index.ts": "src/index.ts",
  "Root.tsx": "src/Root.tsx",
  "OkikeLessonVideo.tsx": "src/OkikeLessonVideo.tsx",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params;
  const rel = ALLOWED[file];
  if (!rel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const fullPath = path.join(process.cwd(), "worker", "remotion_studio", rel);
  const content = await readFile(fullPath, "utf-8");
  return new NextResponse(content, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
