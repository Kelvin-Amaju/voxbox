"use client";

import { useRef, useState } from "react";

const ACCEPTED = [
  ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".mp4", ".mpeg", ".mpga",
  ".aac", ".wma", ".opus", ".aiff", ".aif",
];

// Formats Groq's Whisper can consume natively. Others are converted to WAV.
const GROQ_SUPPORTED = [
  ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".mp4", ".mpeg", ".mpga",
];

function fileExt(name: string): string {
  return "." + (name.split(".").pop() || "").toLowerCase();
}

interface UploadAudioModalProps {
  onClose: () => void;
}

interface OutlineSection {
  title: string;
  points: string[];
}
interface Outline {
  title: string;
  sections: OutlineSection[];
}
interface ExportedFile {
  name: string;
  url: string;
  absPath: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.[^.]+$/, "") + "-transcript.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = 16000;
  const samples = buffer.getChannelData(0);
  const frameCount = samples.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// Convert any audio File (e.g. .aac, .wma, .opus) to a Groq-compatible WAV.
async function toGroqFile(file: File): Promise<File> {
  const ext = fileExt(file.name);
  if (GROQ_SUPPORTED.includes(ext)) return file;

  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const wav = audioBufferToWav(decoded);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([wav], `${baseName}.wav`, { type: "audio/wav" });
  } finally {
    ctx.close().catch(() => {});
  }
}

export default function UploadAudioModal({ onClose }: UploadAudioModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"groq" | "offline" | null>(null);
  const [outlining, setOutlining] = useState(false);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [files, setFiles] = useState<ExportedFile[]>([]);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  const handleFiles = (files: FileList | null) => {
    setError(null);
    setConfirmFile(null);
    const selected = files?.[0];
    if (!selected) return;
    const ext = fileExt(selected.name);
    if (!ACCEPTED.includes(ext)) {
      setError("Only audio files are supported (.wav, .mp3, .aac, .m4a, .ogg, .flac, .webm, .mp4, etc.).");
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const transcribe = async () => {
    if (!confirmFile) return;
    setTranscribing(true);
    setTranscriptionError(null);
    setEngine(null);

    try {
      let online = false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const statusRes = await fetch("/api/status", { signal: controller.signal });
        clearTimeout(timer);
        online = statusRes.ok && (await statusRes.json()).online === true;
      } catch {
        online = false;
      }

      if (online) {
        const uploadFile = await toGroqFile(confirmFile);

        const body = new FormData();
        body.append("file", uploadFile, uploadFile.name);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body,
        });

        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || `Transcription failed (${res.status})`);
        }
        setEngine("groq");
        setTranscript((data.text || "").trim());
      } else {
        const { transcribeOffline } = await import("@/lib/clientWhisper");
        setEngine("offline");
        setTranscript(await transcribeOffline(confirmFile));
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : "Couldn't transcribe the audio.";
      if (err instanceof TypeError) {
        const { transcribeOffline } = await import("@/lib/clientWhisper");
        try {
          setEngine("offline");
          setTranscript(await transcribeOffline(confirmFile));
          return;
        } catch (offlineErr) {
          message = offlineErr instanceof Error ? offlineErr.message : "Couldn't transcribe offline.";
        }
      }
      setTranscriptionError(message);
    } finally {
      setTranscribing(false);
    }
  };

  const generateOutline = async () => {
    if (!transcript) return;
    setOutlining(true);
    setOutlineError(null);

    try {
      const res = await fetch("/api/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = (await res.json()) as {
        outline?: Outline;
        files?: ExportedFile[];
        error?: string;
      };
      if (!res.ok || !data.outline) {
        throw new Error(data.error || `Outline failed (${res.status})`);
      }
      setOutline(data.outline);
      setFiles(data.files ?? []);
    } catch (err) {
      setOutlineError(err instanceof Error ? err.message : "Couldn't generate the outline.");
    } finally {
      setOutlining(false);
    }
  };

  // Step 2: transcribing / showing the result.
  if (confirmFile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
        <div
          className="relative w-full max-w-2xl rounded-lg border p-8"
          style={{ borderColor: "var(--line)", background: "var(--bg-raised)" }}
        >
          <h2 className="text-xl font-medium" style={{ color: "var(--ink)" }}>
            Transcribe
          </h2>
          <p className="mt-1 text-sm text" style={{ color: "var(--ink-dim)" }}>
            {outline
              ? "Your outline is ready. Download it as a document."
              : transcript
              ? "Your audio was transcribed. Review the text, then continue to the outline."
              : "Your audio will be transcribed and turned into an outline with tasks."}
          </p>

          {transcribing && !transcript && (
            <div
              className="mt-6 flex items-center gap-3 rounded-lg border p-4"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{
                  border: "2px solid var(--line)",
                  borderTopColor: "var(--accent)",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                <span style={{ color: "var(--ink)" }}>Transcribing audio…</span><span className=""> This can take a minute. </span>
                {engine === "offline" && (
                  <span style={{ color: "var(--ink-faint)" }}>(on-device, offline)</span>
                )}
              </div>
              <style jsx>{`
                @keyframes spin {
                  to {
                    transform: rotate(360deg);
                  }
                }
              `}</style>
            </div>
          )}

          {outlining && !outline && (
            <div
              className="mt-6 flex items-center gap-3 rounded-lg border p-4"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{
                  border: "2px solid var(--line)",
                  borderTopColor: "var(--accent)",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <div className="text-sm" style={{ color: "var(--ink-dim)" }}>
                <span style={{ color: "var(--ink)" }}>Generating outline…</span> Structuring your notes into a document.
              </div>
            </div>
          )}

          {outline ? (
            <div className="mt-6">
              <div
                className="max-h-96 overflow-y-auto rounded-lg border p-5"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                <h3 className="font-display text-lg font-semibold" style={{ color: "var(--ink)" }}>
                  {outline.title}
                </h3>
                <div className="mt-4 flex flex-col gap-4">
                  {outline.sections.map((section, i) => (
                    <div key={i}>
                      <h4 className="font-display text-sm font-semibold" style={{ color: "var(--ink)" }}>
                        {i + 1}. {section.title}
                      </h4>
                      {section.points.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {section.points.map((point, j) => (
                            <li key={j} className="text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
                              <span style={{ color: "var(--accent)" }}>•</span> {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {files.length > 0 && (
                <div className="mt-3 flex justify-end gap-2">
                  {files.map((f) => (
                    <a
                      key={f.name}
                      href={f.url}
                      download={f.name}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{ borderColor: "var(--line)", color: "var(--ink-dim)" }}
                    >
                      Download {f.name.toUpperCase()}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : transcript ? (
            <div className="mt-6">
              <div
                className="max-h-72 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "var(--bg)" }}
              >
                {transcript}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => downloadText(transcript, confirmFile.name)}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{ borderColor: "var(--line)", color: "var(--ink-dim)" }}
                >
                  Download text
                </button>
              </div>
            </div>
          ) : (
            <div
              className="mt-6 rounded-lg border p-5"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>
                    {transcribing ? "Transcribing…" : confirmFile.name}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                    {formatSize(confirmFile.size)} · {confirmFile.type || "audio"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {transcriptionError && (
            <p className="mt-3 text-sm" style={{ color: "var(--accent)" }}>
              {transcriptionError}
            </p>
          )}

          {outlineError && (
            <p className="mt-3 text-sm" style={{ color: "var(--accent)" }}>
              {outlineError}
            </p>
          )}

          <div className="mt-8 flex justify-end gap-2">
            {outline ? (
              <button
                onClick={onClose}
                className="rounded-md px-5 py-2 text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={transcribing || outlining}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ color: "var(--ink-dim)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={transcript ? generateOutline : transcribe}
                  disabled={transcribing || outlining}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {transcribing
                    ? "Transcribing…"
                    : outlining
                    ? "Generating outline…"
                    : transcript
                    ? "Outline"
                    : "Transcribe"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-lg border p-6"
        style={{ borderColor: "var(--line)", background: "var(--bg-raised)" }}
      >
        <h2 className="text-lg font-medium" style={{ color: "var(--ink)" }}>
          Upload Audio
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-dim)" }}>
          Choose an audio recording to import (.wav, .mp3, .aac, .m4a, .ogg, .flac, .webm, .mp4, etc.).
        </p>

        <button
          onClick={() => inputRef.current?.click()}
          className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-sm transition-colors"
          style={{
            borderColor: "var(--line)",
            color: "var(--ink-dim)",
            background: "var(--bg)",
          }}
        >
          Click to choose an audio file
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && <p className="mt-3 text-sm" style={{ color: "var(--accent)" }}>{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: "var(--ink-dim)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => setConfirmFile(file)}
            disabled={!file}
            className="rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
