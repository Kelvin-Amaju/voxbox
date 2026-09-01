import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotes } from "@/lib/db";

export async function GET() {
  const notes = listNotes();
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, transcript } = body as { title?: string; transcript?: string };

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const note = createNote(title?.trim() || "Untitled Note", transcript.trim());
  return NextResponse.json({ note }, { status: 201 });
}
