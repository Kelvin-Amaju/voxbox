import { NextRequest, NextResponse } from "next/server";
import { isOnline } from "@/lib/connectivity";
import { outlineWithGroq, outlineWithLocal, Outline } from "@/lib/outline";
import { exportOutline } from "@/lib/exporter";
import { createNote, saveOutputPath } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const transcript: string = (body.transcript || "").toString().trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  let outline: Outline;
  const online = await isOnline();

  try {
    outline = online ? await outlineWithGroq(transcript) : await outlineWithLocal(transcript);
  } catch (err) {
    if (online) {
      try {
        outline = await outlineWithLocal(transcript);
      } catch (localErr) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const localMessage = localErr instanceof Error ? localErr.message : "Unknown error";
        return NextResponse.json({ error: `Outline failed (${message}; local: ${localMessage})` }, { status: 500 });
      }
    } else {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `Outline failed: ${message}` }, { status: 500 });
    }
  }

  // Persist the note and generate export files.
  const note = createNote(outline.title, transcript);
  const exportResult = await exportOutline(note.id, outline);
  const outputPath = exportResult.files.map((f) => f.absPath).join(";");
  saveOutputPath(note.id, outputPath);

  return NextResponse.json({
    note: { id: note.id, title: outline.title },
    outline,
    files: exportResult.files,
    mode: online ? "groq" : "local",
  });
}
