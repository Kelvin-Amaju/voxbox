import { NextRequest, NextResponse } from "next/server";
import { getNote, saveStructure, setNoteStatus, updateTranscript } from "@/lib/db";
import { structureTranscript } from "@/lib/structure";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = getNote(id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allow passing a fresher transcript at structuring time (e.g. final recorder text).
  const body = await req.json().catch(() => ({}));
  const transcript: string = body.transcript?.trim() || note.transcript;

  if (!transcript.trim()) {
    return NextResponse.json({ error: "No transcript to structure" }, { status: 400 });
  }

  setNoteStatus(id, "processing");

  try {
    const outline = await structureTranscript(transcript);
    updateTranscript(id, transcript, outline.title);
    saveStructure(id, outline);
  } catch (err) {
    setNoteStatus(id, "error");
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Structuring failed: ${message}` }, { status: 500 });
  }

  const updated = getNote(id);
  return NextResponse.json({ note: updated });
}
