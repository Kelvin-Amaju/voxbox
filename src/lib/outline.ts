export interface OutlineSection {
  title: string;
  points: string[];
}

export interface Outline {
  title: string;
  sections: OutlineSection[];
}

import { pipeline as _pipeline, TextGenerationPipeline } from "@huggingface/transformers";
import { ensureModelCache } from "@/lib/modelCache";

let localGeneratorPromise: Promise<TextGenerationPipeline> | null = null;

function getLocalGenerator(): Promise<TextGenerationPipeline> {
  if (!localGeneratorPromise) {
    ensureModelCache();
    localGeneratorPromise = _pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", {
      dtype: "q8",
    }) as Promise<TextGenerationPipeline>;
  }
  return localGeneratorPromise;
}

export async function outlineWithLocal(transcript: string): Promise<Outline> {
  const generator = await getLocalGenerator();
  const output = await generator(
    [
      { role: "system", content: OUTLINE_PROMPT },
      { role: "user", content: `Transcript:\n\n${transcript}` },
    ],
    {
      max_new_tokens: 600,
      do_sample: false,
      temperature: 0,
      return_full_text: false,
    }
  );
  const generated = Array.isArray(output) ? output : [output];
  const text = generated.map((item) => item.generated_text ?? "").join("");
  return parseOutlineJson(text);
}


const OUTLINE_PROMPT = `You turn a voice-memo transcript into a clean, well-structured document outline.

Rules:
- Read the transcript and identify the natural topic sections (2-6 sections typically).
- Give each section a short, clear heading.
- Break each section down into concise, well-organized bullet points that capture the key ideas. Skip filler, rambling, or non-actionable commentary. Do NOT invent content that isn't in the transcript.
- Derive a short, meaningful document title from the content (4-8 words).
- Respond ONLY with JSON matching this exact shape, no markdown fences, no preamble:

{
  "title": "string",
  "sections": [
    { "title": "string", "points": ["string", ...] }
  ]
}`;

function parseOutlineJson(text: string): Outline {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Failed to parse outline JSON");
  }
  let parsed: { title?: unknown; sections?: unknown };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as { title?: unknown; sections?: unknown };
  } catch {
    throw new Error("Failed to parse outline JSON");
  }
  if (typeof parsed.title !== "string" || !Array.isArray(parsed.sections)) {
    throw new Error("Outline missing required fields");
  }
  return {
    title: parsed.title,
    sections: parsed.sections.map((s: { title?: unknown; points?: unknown }) => ({
      title: String(s.title),
      points: Array.isArray(s.points) ? s.points.map(String) : [],
    })),
  };
}

const GROQ_MODEL = "allam-2-7b";

export async function outlineWithGroq(transcript: string): Promise<Outline> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: OUTLINE_PROMPT },
        { role: "user", content: `Transcript:\n\n${transcript}` },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq outline failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no outline content");

  return parseOutlineJson(content);
}
