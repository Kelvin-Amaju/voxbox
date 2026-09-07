"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Minimal typings for the Web Speech API.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
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

  onresult:
    | ((ev: SpeechRecognitionEventLike) => void)
    | null;

  onerror:
    | ((ev: SpeechRecognitionErrorEventLike) => void)
    | null;

  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface RecorderProps {
  onTranscriptChange: (
    finalText: string,
    interimText: string
  ) => void;

  disabled?: boolean;
}

const MAX_RECOGNITION_ATTEMPTS = 3;

/**
 * Normalize text for comparison.
 *
 * This allows:
 *
 * "Hello, world"
 * "hello world"
 *
 * to be treated as the same phrase.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merge a new speech-recognition result with the existing transcript.
 *
 * The Web Speech API can sometimes return overlapping results.
 *
 * Example:
 *
 * Existing:
 * "testing do"
 *
 * Incoming:
 * "do not double"
 *
 * Result:
 * "testing do not double"
 */
function mergeTranscript(
  existing: string,
  incoming: string
): string {
  const current = existing.trim();
  const next = incoming.trim();

  if (!current) return next;
  if (!next) return current;

  const currentNormalized = normalizeText(current);
  const nextNormalized = normalizeText(next);

  // Exact duplicate.
  if (currentNormalized === nextNormalized) {
    return current;
  }

  const currentWords = current.split(/\s+/);
  const nextWords = next.split(/\s+/);

  /*
   * Look for the largest overlap between:
   *
   * END of existing transcript
   *
   * and
   *
   * START of incoming transcript.
   */
  const maxOverlap = Math.min(
    currentWords.length,
    nextWords.length
  );

  for (
    let overlap = maxOverlap;
    overlap > 0;
    overlap--
  ) {
    const existingPart = normalizeText(
      currentWords
        .slice(-overlap)
        .join(" ")
    );

    const incomingPart = normalizeText(
      nextWords
        .slice(0, overlap)
        .join(" ")
    );

    if (
      existingPart &&
      incomingPart &&
      existingPart === incomingPart
    ) {
      const newWords = nextWords.slice(overlap);

      if (newWords.length === 0) {
        return current;
      }

      return `${current} ${newWords.join(" ")}`.trim();
    }
  }

  /*
   * Sometimes the incoming result is already contained
   * at the end of the existing transcript.
   */
  if (
    currentNormalized.endsWith(
      ` ${nextNormalized}`
    ) ||
    currentNormalized === nextNormalized
  ) {
    return current;
  }

  return `${current} ${next}`.trim();
}

export default function Recorder({
  onTranscriptChange,
  disabled,
}: RecorderProps) {
  const [supported, setSupported] =
    useState(true);

  const [recording, setRecording] =
    useState(false);

  const [fallback, setFallback] =
    useState(false);

  const [lang, setLang] =
    useState("en-US");

  const recognitionRef =
    useRef<SpeechRecognitionLike | null>(null);

  const recorderRef =
    useRef<MediaRecorder | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const chunksRef =
    useRef<Blob[]>([]);

  /*
   * Permanently finalized transcript.
   */
  const finalTextRef =
    useRef("");

  /*
   * Temporary speech that has not been finalized.
   */
  const interimTextRef =
    useRef("");

  /*
   * Controls whether recording should continue.
   */
  const shouldRecordRef =
    useRef(false);

  /*
   * Prevents recognition from being restarted
   * after a permanent failure.
   */
  const recognizerDeadRef =
    useRef(false);

  /*
   * Tracks whether SpeechRecognition is currently
   * running.
   */
  const recognitionRunningRef =
    useRef(false);

  /*
   * Prevents multiple restart timers.
   */
  const restartTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  /*
   * Number of recognition errors.
   */
  const recognitionErrorsRef =
    useRef(0);

  /*
   * Last finalized result.
   *
   * Used as an additional duplicate guard.
   */
  const lastFinalChunkRef =
    useRef("");

  /*
   * Finalize recording.
   */
  const finalize = useCallback(
    async (blob: Blob | null) => {
      /*
       * If browser speech recognition produced
       * a transcript, use it.
       */
      if (finalTextRef.current.trim()) {
        onTranscriptChange(
          finalTextRef.current.trim(),
          ""
        );

        return;
      }

      /*
       * If there is no recorded audio,
       * there is nothing else to transcribe.
       */
      if (!blob) {
        onTranscriptChange("", "");
        return;
      }

      /*
       * Browser Speech Recognition failed,
       * so use local Whisper.
       */
      try {
        setFallback(true);

        const {
          transcribeOffline,
        } = await import(
          "@/lib/clientWhisper"
        );

        const text =
          await transcribeOffline(blob);

        onTranscriptChange(
          text.trim(),
          ""
        );
      } catch {
        onTranscriptChange("", "");
      } finally {
        setFallback(false);
      }
    },
    [onTranscriptChange]
  );

  /**
   * Safely start Speech Recognition.
   */
  const startRecognition =
    useCallback(() => {
      const recognition =
        recognitionRef.current;

      if (!recognition) return;

      if (!shouldRecordRef.current) {
        return;
      }

      if (recognizerDeadRef.current) {
        return;
      }

      /*
       * Don't start another recognition session
       * while one is already running.
       */
      if (recognitionRunningRef.current) {
        return;
      }

      try {
        recognition.start();

        recognitionRunningRef.current =
          true;
      } catch {
        /*
         * Browser can throw if recognition is already
         * starting/running.
         */
        recognitionRunningRef.current =
          false;
      }
    }, []);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    /*
     * Browser does not support Web Speech API.
     */
    if (!SpeechRecognition) {
      setSupported(false);

      recognizerDeadRef.current =
        true;

      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.continuous = true;

    recognition.interimResults = true;

    recognition.lang = "en-US";

    setLang(recognition.lang);

    /**
     * Speech recognition results.
     */
    recognition.onresult = (
      event: SpeechRecognitionEventLike
    ) => {
      recognitionErrorsRef.current = 0;

      let interim = "";

      /*
       * Only process results starting from
       * resultIndex.
       */
      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        const chunk =
          result[0]?.transcript?.trim();

        if (!chunk) continue;

        if (result.isFinal) {
          /*
           * Don't append an exact duplicate
           * of the previous final chunk.
           */
          if (
            normalizeText(chunk) !==
            normalizeText(
              lastFinalChunkRef.current
            )
          ) {
            finalTextRef.current =
              mergeTranscript(
                finalTextRef.current,
                chunk
              );

            lastFinalChunkRef.current =
              chunk;
          }

          /*
           * Final result means interim text
           * is no longer needed.
           */
          interimTextRef.current = "";
        } else {
          /*
           * Interim results should NOT be added
           * to finalTextRef.
           *
           * They are temporary.
           */
          interim +=
            (interim ? " " : "") +
            chunk;
        }
      }

      interimTextRef.current =
        interim.trim();

      /*
       * Update UI.
       */
      onTranscriptChange(
        finalTextRef.current.trim(),
        interimTextRef.current.trim()
      );
    };

    /**
     * Speech recognition errors.
     */
    recognition.onerror = (
      event: SpeechRecognitionErrorEventLike
    ) => {
      recognitionRunningRef.current =
        false;

      /*
       * Permission errors cannot be fixed
       * by restarting.
       */
      if (
        event.error === "not-allowed" ||
        event.error ===
          "service-not-allowed"
      ) {
        recognizerDeadRef.current =
          true;

        recognitionErrorsRef.current =
          MAX_RECOGNITION_ATTEMPTS;

        return;
      }

      recognitionErrorsRef.current += 1;

      /*
       * Stop trying after repeated failures.
       * The recorded audio will then be available
       * for Whisper fallback.
       */
      if (
        recognitionErrorsRef.current >=
        MAX_RECOGNITION_ATTEMPTS
      ) {
        recognizerDeadRef.current =
          true;

        if (restartTimerRef.current) {
          clearTimeout(
            restartTimerRef.current
          );

          restartTimerRef.current = null;
        }
      }
    };

    /**
     * Recognition session ended.
     *
     * Some browsers automatically stop recognition
     * even with continuous=true.
     */
    recognition.onend = () => {
      recognitionRunningRef.current =
        false;

      /*
       * User stopped recording.
       */
      if (!shouldRecordRef.current) {
        setRecording(false);
        return;
      }

      /*
       * Recognition permanently failed.
       */
      if (recognizerDeadRef.current) {
        return;
      }

      /*
       * Never create multiple restart timers.
       */
      if (restartTimerRef.current) {
        return;
      }

      /*
       * Give the browser a short pause before
       * starting a new recognition session.
       */
      restartTimerRef.current =
        setTimeout(() => {
          restartTimerRef.current = null;

          if (
            !shouldRecordRef.current ||
            recognizerDeadRef.current
          ) {
            return;
          }

          startRecognition();
        }, 500);
    };

    recognitionRef.current =
      recognition;

    /**
     * Cleanup.
     */
    return () => {
      shouldRecordRef.current =
        false;

      if (restartTimerRef.current) {
        clearTimeout(
          restartTimerRef.current
        );

        restartTimerRef.current = null;
      }

      recognitionRunningRef.current =
        false;

      try {
        recognition.stop();
      } catch {
        // Ignore browser stop errors.
      }

      recognitionRef.current = null;
    };
  }, [
    onTranscriptChange,
    startRecognition,
  ]);

  /**
   * Start recording.
   */
  const start = useCallback(
    async () => {
      /*
       * Prevent duplicate starts.
       */
      if (shouldRecordRef.current) {
        return;
      }

      /*
       * Reset all previous transcript state.
       */
      finalTextRef.current = "";

      interimTextRef.current = "";

      lastFinalChunkRef.current = "";

      chunksRef.current = [];

      recognitionErrorsRef.current = 0;

      recognizerDeadRef.current = false;

      recognitionRunningRef.current =
        false;

      if (restartTimerRef.current) {
        clearTimeout(
          restartTimerRef.current
        );

        restartTimerRef.current = null;
      }

      onTranscriptChange("", "");

      shouldRecordRef.current = true;

      try {
        /*
         * Request microphone access.
         */
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: true,
            }
          );

        streamRef.current = stream;

        /*
         * Record the original audio as a fallback.
         */
        const recorder =
          new MediaRecorder(stream);

        recorder.ondataavailable = (
          event
        ) => {
          if (event.data.size > 0) {
            chunksRef.current.push(
              event.data
            );
          }
        };

        recorder.onstop = () => {
          const blob =
            chunksRef.current.length > 0
              ? new Blob(
                  chunksRef.current,
                  {
                    type:
                      recorder.mimeType ||
                      "audio/webm",
                  }
                )
              : null;

          shouldRecordRef.current =
            false;

          recognitionRunningRef.current =
            false;

          /*
           * Stop microphone tracks.
           */
          streamRef.current
            ?.getTracks()
            .forEach((track) => {
              track.stop();
            });

          void finalize(blob);
        };

        recorder.start();

        recorderRef.current =
          recorder;
      } catch {
        shouldRecordRef.current =
          false;

        return;
      }

      /*
       * Start browser speech recognition.
       */
      startRecognition();

      setRecording(true);
    },
    [
      finalize,
      onTranscriptChange,
      startRecognition,
    ]
  );

  /**
   * Stop recording.
   */
  const stop = useCallback(() => {
    shouldRecordRef.current = false;

    /*
     * Cancel pending recognition restart.
     */
    if (restartTimerRef.current) {
      clearTimeout(
        restartTimerRef.current
      );

      restartTimerRef.current = null;
    }

    recognitionRunningRef.current =
      false;

    /*
     * Stop browser speech recognition.
     */
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore browser errors.
    }

    /*
     * Stop MediaRecorder.
     */
    if (
      recorderRef.current &&
      recorderRef.current.state !==
        "inactive"
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
        onClick={
          recording ? stop : start
        }
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

            borderRadius: recording
              ? 3
              : 999,

            background: recording
              ? "var(--bg)"
              : "var(--accent)",

            transition:
              "all 150ms ease",
          }}
        />
      </button>

      <div>
        <div
          className="text-sm font-medium"
          style={{
            color: "var(--ink)",
          }}
        >
          {recording
            ? "Recording — tap to stop"
            : "Tap to record"}
        </div>

        <div
          className="text-xs"
          style={{
            color:
              "var(--ink-faint)",
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