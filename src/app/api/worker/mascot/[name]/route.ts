import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const safe = name.replace(/[^a-zA-Z0-9_.-]/g, "");
  try {
    const filePath = path.join(process.cwd(), "worker", "mascots", safe);
    const data = await readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: { "Content-Type": "video/mp4" },
    });
  } catch {
    return NextResponse.json({ error: "Mascot clip not found" }, { status: 404 });
  }
}
