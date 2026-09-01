import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OUTPUT_ROOT = path.join(process.cwd(), "output");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  if (!parts || parts.length === 0) {
    return NextResponse.json({ error: "Missing file path" }, { status: 404 });
  }

  const safeParts = parts.filter((p) => !p.includes("..") && !p.includes("/") && !p.includes("\\"));
  if (safeParts.length !== parts.length) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const abs = path.join(OUTPUT_ROOT, ...safeParts);
  if (!abs.startsWith(OUTPUT_ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const contentType =
    ext === ".pdf" ? "application/pdf" : "application/msword";

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
    },
  });
}
