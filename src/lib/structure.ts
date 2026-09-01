/*import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface StructuredOutline {
  title: string;
  sections: {
    title: string;
    summary?: string;
    tasks: string[];
  }[];
}

const SYSTEM_PROMPT = `You convert raw voice-memo transcripts into a clean outline with actionable tasks.

Rules:
- Read the transcript and identify the natural topic sections (2-6 sections typically).
- Give each section a short, clear title (3-6 words).
- Optionally add a 1-sentence summary per section if it adds clarity beyond the title.
- Extract concrete action items as tasks under the relevant section. Write tasks as imperative statements ("Email the client", not "I should email the client"). Skip filler, rambling, or non-actionable commentary — but do NOT invent tasks that aren't implied by the transcript.
- If a section has no actionable tasks, return an empty tasks array for it — that's fine.
- Also produce a short overall title for the whole note (4-8 words), suitable as a document title.
- Respond ONLY with raw JSON matching this exact shape, no markdown fences, no preamble:

{
  "title": "string",
  "sections": [
    { "title": "string", "summary": "string (optional)", "tasks": ["string", ...] }
  ]
}`;

export async function structureTranscript(transcript: string): Promise<StructuredOutline> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcript:\n\n${transcript}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();

  let parsed: StructuredOutline;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse structured outline JSON");
  }

  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Structured outline missing required fields");
  }

  return parsed;
}
*/

/* Transformers.js locally-run model (no internet, no API key).
   Runs on the server when the voice-notes server starts. */

import { pipeline, TextGenerationPipeline } from "@huggingface/transformers";
import { isOnline } from "@/lib/connectivity";
import { ensureModelCache } from "@/lib/modelCache";

export interface StructuredOutline {
  title: string;
  sections: {
    title: string;
    summary?: string;
    tasks: string[];
  }[];
}

const SYSTEM_PROMPT = `You convert raw voice-memo transcripts into a clean outline with actionable tasks.

Rules:
- Read the transcript and identify the natural topic sections (2-6 sections typically).
- Give each section a short, clear title (3-6 words).
- Optionally add a 1-sentence summary per section if it adds clarity beyond the title.
- Extract concrete action items as tasks under the relevant section. Write tasks as imperative statements ("Email the client", not "I should email the client"). Skip filler, rambling, or non-actionable commentary — but do NOT invent tasks that aren't implied by the transcript.
- If a section has no actionable tasks, return an empty tasks array for it — that's fine.
- Also produce a short overall title for the whole note (4-8 words), suitable as a document title.
- Respond ONLY with raw JSON matching this exact shape, no markdown fences, no preamble:

{
  "title": "string",
  "sections": [
    { "title": "string", "summary": "string (optional)", "tasks": ["string", ...] }
  ]
}`;

// Small, free, offline-capable instruct model. Runs entirely on the server.
const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

let generatorPromise: Promise<TextGenerationPipeline> | null = null;

function getGenerator(): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    ensureModelCache();
    generatorPromise = pipeline("text-generation", MODEL_ID, {
      dtype: "q8",
    }) as Promise<TextGenerationPipeline>;
  }
  return generatorPromise;
}

async function extractJson(text: string): Promise<StructuredOutline> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Failed to parse structured outline JSON");
  }
  let parsed: StructuredOutline;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Failed to parse structured outline JSON");
  }
  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Structured outline missing required fields");
  }
  return parsed;
}

const GROQ_MODEL = "allam-2-7b";

async function structureWithGroq(transcript: string): Promise<StructuredOutline> {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Transcript:\n\n${transcript}` },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq structuring failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no structure content");

  return extractGroqJson(content);
}

function extractGroqJson(text: string): StructuredOutline {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Failed to parse structured outline JSON");
  }
  let parsed: StructuredOutline;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Failed to parse structured outline JSON");
  }
  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Structured outline missing required fields");
  }
  return {
    title: String(parsed.title),
    sections: parsed.sections.map((s) => ({
      title: String(s.title),
      summary: s.summary !== undefined ? String(s.summary) : undefined,
      tasks: Array.isArray(s.tasks) ? s.tasks.map(String) : [],
    })),
  };
}

export async function structureTranscript(transcript: string): Promise<StructuredOutline> {
  const online = await isOnline();
  if (online) {
    try {
      return await structureWithGroq(transcript);
    } catch (groqErr) {
      try {
        return await structureLocal(transcript);
      } catch (localErr) {
        throw new Error(
          `Structuring failed (groq: ${groqErr instanceof Error ? groqErr.message : groqErr}; local: ${
            localErr instanceof Error ? localErr.message : localErr
          })`
        );
      }
    }
  }
  return structureLocal(transcript);
}

async function structureLocal(transcript: string): Promise<StructuredOutline> {
  const generator = await getGenerator();

  const userMessage = `Transcript:\n\n${transcript}`;
  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const output = await generator(input, {
    max_new_tokens: 500,
    do_sample: false,
    temperature: 0,
    return_full_text: false,
  });

  // output may be a single generated message object or an array of them
  const generated = Array.isArray(output) ? output : [output];
  const text = generated
    .map((item) => item.generated_text ?? "")
    .join("");

  return extractJson(text);
}
