"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Minimal typings for the Web Speech API.
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

export default function Recorder({
  onTranscriptChange,
  disabled,
}: RecorderProps) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [lang, setLang] = useState("en-US");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const chunksRef = useRef<Blob[]>([]);

  // Text that has already been finalized.
  const finalTextRef = useRef("");

  // Current temporary/interim speech.
  const interimTextRef = useRef("");

  const shouldRecordRef = useRef(false);
  const recognizerDeadRef = useRef(false);
  const recognitionRunningRef = useRef(false);

  const recognitionErrorsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Prevent the same final phrase from being appended twice.
   */
  const lastFinalChunkRef = useRef("");

  const finalize = useCallback(
    async (blob: Blob | null) => {
      if (finalTextRef.current.trim()) {
        onTranscriptChange(finalTextRef.current.trim(), "");
        return;
      }

      if (!blob) {
        onTranscriptChange("", "");
        return;
      }

      try {
        setFallback(true);

        const { transcribeOffline } = await import(
          "@/lib/clientWhisper"
        );

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

  /*
   * Start browser speech recognition safely.
   */
  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition) return;
    if (!shouldRecordRef.current) return;
    if (recognizerDeadRef.current) return;
    if (recognitionRunningRef.current) return;

    try {
      recognition.start();
      recognitionRunningRef.current = true;
    } catch {
      // Browser throws if recognition is already starting/running.
      recognitionRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const SR =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SR) {
      setSupported(false);
      recognizerDeadRef.current = true;
      return;
    }

    const recognition = new SR();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    setLang(recognition.lang);

    recognition.onresult = (
      event: SpeechRecognitionEventLike
    ) => {
      recognitionErrorsRef.current = 0;

      let interim = "";

      /*
       * Only process results supplied by the current resultIndex.
       *
       * Final results are permanently added.
       * Interim results are replaced on every event.
       */
      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];
        const chunk = result[0]?.transcript?.trim();

        if (!chunk) continue;

        if (result.isFinal) {
          /*
           * Browser recognition can occasionally send the same
           * final phrase twice. Don't append an identical phrase.
           */
          if (
            chunk.toLowerCase() !==
            lastFinalChunkRef.current.toLowerCase()
          ) {
            finalTextRef.current +=
              (finalTextRef.current ? " " : "") + chunk;

            lastFinalChunkRef.current = chunk;
          }

          interimTextRef.current = "";
        } else {
          interim +=
            (interim ? " " : "") + chunk;
        }
      }

      interimTextRef.current = interim;

      onTranscriptChange(
        finalTextRef.current.trim(),
        interimTextRef.current.trim()
      );
    };

    recognition.onerror = (
      event: SpeechRecognitionErrorEventLike
    ) => {
      recognitionRunningRef.current = false;

      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        recognizerDeadRef.current = true;
        recognitionErrorsRef.current =
          MAX_RECOGNITION_ATTEMPTS;
        return;
      }

      recognitionErrorsRef.current += 1;

      if (
        recognitionErrorsRef.current >=
        MAX_RECOGNITION_ATTEMPTS
      ) {
        recognizerDeadRef.current = true;

        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = null;
        }
      }
    };

    recognition.onend = () => {
      recognitionRunningRef.current = false;

      if (!shouldRecordRef.current) {
        setRecording(false);
        return;
      }

      if (recognizerDeadRef.current) {
        return;
      }

      /*
       * Do not immediately start again.
       * This prevents overlapping recognition sessions.
       */
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }

      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;

        if (!shouldRecordRef.current) return;
        if (recognizerDeadRef.current) return;

        startRecognition();
      }, 500);
    };

    recognitionRef.current = recognition;

    return () => {
      shouldRecordRef.current = false;

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      recognitionRunningRef.current = false;

      try {
        recognition.stop();
      } catch {}

      recognitionRef.current = null;
    };
  }, [onTranscriptChange, startRecognition]);

  const start = useCallback(async () => {
    if (shouldRecordRef.current) return;

    finalTextRef.current = "";
    interimTextRef.current = "";
    lastFinalChunkRef.current = "";

    chunksRef.current = [];

    recognitionErrorsRef.current = 0;
    recognizerDeadRef.current = false;
    recognitionRunningRef.current = false;

    onTranscriptChange("", "");

    shouldRecordRef.current = true;

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, {
                type:
                  recorder.mimeType ||
                  "audio/webm",
              })
            : null;

        shouldRecordRef.current = false;
        recognitionRunningRef.current = false;

        streamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());

        void finalize(blob);
      };

      recorder.start();

      recorderRef.current = recorder;
    } catch {
      shouldRecordRef.current = false;
      return;
    }

    startRecognition();

    setRecording(true);
  }, [
    finalize,
    onTranscriptChange,
    startRecognition,
  ]);

  const stop = useCallback(() => {
    shouldRecordRef.current = false;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    recognitionRunningRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch {}

    if (
      recorderRef.current &&
      recorderRef.current.state !== "inactive"
    ) {
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
          background: recording
            ? "var(--accent)"
            : "var(--bg-raised)",
          border: `1px solid ${
            recording
              ? "var(--accent)"
              : "var(--line)"
          }`,
        }}
      >
        {recording && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border:
                "1px solid var(--accent)",
              animation:
                "ping-ring 1.6s cubic-bezier(0,0,0.2,1) infinite",
            }}
          />
        )}

        <span
          className="block rounded-sm"
          style={{
            width: recording ? 14 : 12,
            height: recording ? 14 : 12,
            borderRadius: recording ? 3 : 999,
            background: recording
              ? "var(--bg)"
              : "var(--accent)",
            transition: "all 150ms ease",
          }}
        />
      </button>

      <div>
        <div
          className="text-sm font-medium"
          style={{ color: "var(--ink)" }}
        >
          {recording
            ? "Recording — tap to stop"
            : "Tap to record"}
        </div>

        <div
          className="text-xs"
          style={{
            color: "var(--ink-faint)",
          }}
        >
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