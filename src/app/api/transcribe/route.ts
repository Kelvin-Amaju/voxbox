import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not set" }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const body = new FormData();
  body.append("file", file, file.name);
  body.append("model", MODEL);

  const upstream = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `Groq transcription failed: ${upstream.status} ${detail}` }, { status: 502 });
  }

  const data = (await upstream.json()) as { text?: string };
  return NextResponse.json({ text: data.text ?? "" });
}
