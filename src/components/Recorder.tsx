"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Minimal typings for the Web Speech API (not in default TS lib DOM types).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface RecorderProps {
  onTranscriptChange: (finalText: string, interimText: string) => void;
  disabled?: boolean;
}

const MAX_RECOGNITION_ATTEMPTS = 3;

export default function Recorder({ onTranscriptChange, disabled }: RecorderProps) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [lang, setLang] = useState("en-US");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalTextRef = useRef("");
  const shouldRecordRef = useRef(false);
  const recognizerDeadRef = useRef(false);
  const recognitionErrorsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalize = useCallback(
    async (blob: Blob | null) => {
      // Use the live transcript when speech recognition produced text;
      // otherwise fall back to on-device Whisper on the recorded audio.
      if (finalTextRef.current.trim()) {
        onTranscriptChange(finalTextRef.current, "");
        return;
      }
      if (!blob) {
        onTranscriptChange("", "");
        return;
      }
      try {
        setFallback(true);
        const { transcribeOffline } = await import("@/lib/clientWhisper");
        const text = await transcribeOffline(blob);
        onTranscriptChange(text, "");
      } catch {
        onTranscriptChange("", "");
      } finally {
        setFallback(false);
      }
    },
    [onTranscriptChange]
  );

  useEffect(() => {
    // Initial render must stay supported=true so SSR and client hydration match;
    // support is only known after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      setLang(recognition.lang);

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        recognitionErrorsRef.current = 0;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const chunk = result[0].transcript;
          if (result.isFinal) {
            finalTextRef.current += (finalTextRef.current ? " " : "") + chunk.trim();
          } else {
            interim += chunk;
          }
        }
        onTranscriptChange(finalTextRef.current, interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        // Permanent failures won't recover by restarting. Other failures (e.g.
        // network) may clear up; but if they keep happening, stop retrying and
        // rely on the MediaRecorder + on-device Whisper path.
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          recognizerDeadRef.current = true;
          recognitionErrorsRef.current = MAX_RECOGNITION_ATTEMPTS;
          return;
        }
        recognitionErrorsRef.current += 1;
        if (recognitionErrorsRef.current >= MAX_RECOGNITION_ATTEMPTS) {
          recognizerDeadRef.current = true;
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
          }
        }
      };

      recognition.onend = () => {
        if (!shouldRecordRef.current) {
          setRecording(false);
          return;
        }
        if (recognizerDeadRef.current) {
          return;
        }
        restartTimerRef.current = setTimeout(() => {
          if (!shouldRecordRef.current || recognizerDeadRef.current) return;
          try {
            recognitionRef.current?.start();
          } catch {
            recognizerDeadRef.current = true;
          }
        }, 350);
      };

      recognitionRef.current = recognition;
    } else {
      setSupported(false);
      recognizerDeadRef.current = true;
    }

    return () => {
      shouldRecordRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onTranscriptChange]);

  const start = useCallback(async () => {
    if (shouldRecordRef.current) return;
    finalTextRef.current = "";
    chunksRef.current = [];
    onTranscriptChange("", "");
    shouldRecordRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" })
            : null;
        shouldRecordRef.current = false;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        void finalize(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      shouldRecordRef.current = false;
      return;
    }

    if (!recognizerDeadRef.current) {
      try {
        recognitionRef.current?.start();
      } catch {
        recognizerDeadRef.current = true;
      }
    }

    setRecording(true);
  }, [finalize, onTranscriptChange]);

  const stop = useCallback(() => {
    shouldRecordRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      void finalize(null);
    }
    setRecording(false);
  }, [finalize]);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-pressed={recording}
        className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
        style={{
          background: recording ? "var(--accent)" : "var(--bg-raised)",
          border: `1px solid ${recording ? "var(--accent)" : "var(--line)"}`,
        }}
      >
        {recording && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid var(--accent)",
              animation: "ping-ring 1.6s cubic-bezier(0,0,0.2,1) infinite",
            }}
          />
        )}
        <span
          className="block rounded-sm"
          style={{
            width: recording ? 14 : 12,
            height: recording ? 14 : 12,
            borderRadius: recording ? 3 : 999,
            background: recording ? "var(--bg)" : "var(--accent)",
            transition: "all 150ms ease",
          }}
        />
      </button>
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
          {recording ? "Recording — tap to stop" : "Tap to record"}
        </div>
        <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {fallback
            ? "Transcribing on-device…"
            : recording
            ? `Listening in ${lang}`
            : supported
            ? "Uses your browser's speech recognition"
            : "Speech recognition unavailable — records audio, transcribes on-device"}
        </div>
      </div>
      <style jsx>{`
        @keyframes ping-ring {
          0% {
            transform: scale(1);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}