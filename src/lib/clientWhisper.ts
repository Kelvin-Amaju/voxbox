"use client";

const ASR_MODEL = "Xenova/whisper-tiny.en";

type ASRPipeline = (audio: Float32Array, opts: object) => Promise<{ text?: string }>;

let asrPromise: Promise<ASRPipeline> | null = null;

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  // @ts-expect-error webkitAudioContext is not in TS lib DOM types
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtor({ sampleRate: 16000 });
  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer);
    const left = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    return resample(left, sampleRate, 16000);
  } finally {
    void ctx.close();
  }
}

async function getASRPipeline(): Promise<ASRPipeline> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      // Load wasm/model from remote on first use; browsers cache both in Cache
      // Storage, so subsequent runs work fully offline.
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      const pipe = await pipeline("automatic-speech-recognition", ASR_MODEL);
      return pipe as unknown as ASRPipeline;
    })();
  }
  return asrPromise;
}

export async function transcribeOffline(blob: Blob): Promise<string> {
  const audio = await decodeToMono16k(blob);
  const asr = await getASRPipeline();

  const output = await asr(audio, {
    language: "english",
    task: "transcribe",
  });

  const text = output?.text?.trim();

  if (!text) {
    throw new Error("On-device transcription returned no text");
  }

  return text;
}