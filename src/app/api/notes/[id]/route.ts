import { NextRequest, NextResponse } from "next/server";
import { getNote, deleteNote, updateTranscript, setTaskDone } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = getNote(id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.transcript !== undefined) {
    updateTranscript(id, body.transcript, body.title);
  }
  if (body.taskId !== undefined && body.done !== undefined) {
    setTaskDone(body.taskId, !!body.done);
  }

  const note = getNote(id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteNote(id);
  return NextResponse.json({ ok: true });
}
