"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Recorder from "@/components/Recorder";
import Outline from "@/components/Outline";
import NotesList from "@/components/NotesList";
import UploadAudioModal from "@/components/UploadAudioModal";
import type { Note } from "@/lib/db";

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [structuring, setStructuring] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setOnline(!!data.online);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 30_000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const refreshNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    setNotes(data.notes ?? []);
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

  const selectNote = useCallback(async (id: string) => {
    const res = await fetch(`/api/notes/${id}`);
    const data = await res.json();
    setActiveNote(data.note);
    setDraftTranscript("");
    setInterimTranscript("");
    setSidebarOpen(false);
  }, []);

  const startNew = useCallback(() => {
    setActiveNote(null);
    setDraftTranscript("");
    setInterimTranscript("");
    setSidebarOpen(false);
  }, []);

  const openUpload = useCallback(() => {
    setSidebarOpen(false);
    setShowUpload(true);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be denied or unsupported; ignore.
    }
  }, []);

  const handleTranscriptChange = useCallback(
    (finalText: string, interimText: string) => {
      setDraftTranscript(finalText);
      setInterimTranscript(interimText);
    },
    [],
  );

  // Poll while a note is "processing" so the outline appears once ready.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (activeNote?.status === "processing") {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/notes/${activeNote.id}`);
        const data = await res.json();
        if (data.note && data.note.status !== "processing") {
          setActiveNote(data.note);
          refreshNotes();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 1500);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeNote?.status, activeNote?.id, refreshNotes]);

  const generateOutline = useCallback(async () => {
    const transcript = draftTranscript.trim();
    if (!transcript) return;

    setStructuring(true);
    try {
      // Create the note first.
      const createRes = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const createData = await createRes.json();
      const note: Note = createData.note;
      setActiveNote(note);
      await refreshNotes();

      // Kick off structuring (server calls Claude).
      const structRes = await fetch(`/api/notes/${note.id}/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const structData = await structRes.json();
      if (structData.note) {
        setActiveNote(structData.note);
      }
      await refreshNotes();
    } finally {
      setStructuring(false);
    }
  }, [draftTranscript, refreshNotes]);

  const handleTaskToggle = useCallback(
    async (taskId: string, done: boolean) => {
      if (!activeNote) return;
      await fetch(`/api/notes/${activeNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, done }),
      });
    },
    [activeNote],
  );

  const showDraftView = !activeNote;

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity duration-300 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Drawer / Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r px-4 py-6 transition-transform duration-300 ease-out md:static md:w-64 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          borderColor: "var(--line)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-raised) 60%, transparent) 0%, var(--bg) 100%)",
        }}
      >
        <div className="mb-6 flex items-center justify-between px-1">
  {/* Brand + Status */}
  <div className="flex min-w-0 items-center gap-2.5">
    {/* Logo */}
    <div
      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
      style={{
        background:
          "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000))",
        boxShadow:
          "0 0 16px color-mix(in srgb, var(--accent) 40%, transparent)",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--bg)" }}
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </div>

    {/* App Name */}
    <span
      className="shrink-0 text-sm font-semibold tracking-tight"
      style={{ color: "var(--ink)" }}>
      VOXBOX
    </span>

    {/* Status */}
    {online !== null && (
      <div
        className="hidden h-7 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-medium leading-none md:flex"
        style={{
          borderColor: "var(--line)",
          background:
            "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
          color: online ? "#7fb06f" : "var(--accent)",
        }}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-60"
            style={{
              background: online ? "#7fb06f" : "var(--accent)",
            }}
          />

          <span
            className="relative block h-1.5 w-1.5 rounded-full"
            style={{
              background: online ? "#7fb06f" : "var(--accent)",
              boxShadow: `0 0 7px ${
                online ? "#7fb06f" : "var(--accent)"
              }`,
            }}
          />
        </span>

        <span className="whitespace-nowrap">
          {online ? "GROQ" : "LOCAL"}
        </span>
      </div>
    )}
  </div>

  {/* Close Button */}
  <button
    onClick={() => setSidebarOpen(false)}
    aria-label="Close menu"
    className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 md:hidden"
    style={{
      color: "var(--ink-dim)",
      borderColor: "var(--line)",
      background:
        "color-mix(in srgb, var(--bg-raised) 50%, transparent)",
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
</div>


        {/*{online !== null && (
          <div
            className="hidden md:flex lg:flex xlg:flex mb-4 items-center gap-2 rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "var(--line)",
              background:
                "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
              color: online ? "#7fb06f" : "var(--accent)",
            }}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className="absolute inset-0 animate-ping rounded-full opacity-60"
                style={{
                  background: online ? "#7fb06f" : "var(--accent)",
                }}
              />

              <span
                className="relative block h-2 w-2 rounded-full"
                style={{
                  background: online ? "#7fb06f" : "var(--accent)",
                  boxShadow: `0 0 8px ${online ? "#7fb06f" : "var(--accent)"}`,
                }}
              />
            </span>

            {/*<span className="truncate font-medium">
              {online ? "Online · using Groq" : "Offline · using local model"}
            </span>
          </div>
        )}*/}

        <div className="flex-1 overflow-y-auto">
          <NotesList
            notes={notes}
            activeId={activeNote?.id ?? null}
            onSelect={selectNote}
            onNew={startNew}
            onOpenUpload={openUpload}
          />
        </div>
      </aside>

      {/* Main Viewport Container */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Header Bar */}
        <div
          className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl md:hidden"
          style={{
            borderColor: "var(--line)",
            background: "color-mix(in srgb, var(--bg) 80%, transparent)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 active:scale-95"
              style={{
                color: "var(--ink)",
                borderColor: "var(--line)",
                background:
                  "color-mix(in srgb, var(--bg-raised) 50%, transparent)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <span
                className="title text-sm font-semibold tracking-tight"
                style={{ color: "var(--ink)" }}
              >
                VOXBOX
              </span>
            </div>

            {online !== null && (
              <div
                className="hidden md:flex lg:flex xlg:flex mb-4 items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: "var(--line)",
                  background:
                    "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
                  color: online ? "#7fb06f" : "var(--accent)",
                }}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className="absolute inset-0 animate-ping rounded-full opacity-60"
                    style={{
                      background: online ? "#7fb06f" : "var(--accent)",
                    }}
                  />

                  <span
                    className="relative block h-2 w-2 rounded-full"
                    style={{
                      background: online ? "#7fb06f" : "var(--accent)",
                      boxShadow: `0 0 8px ${online ? "#7fb06f" : "var(--accent)"}`,
                    }}
                  />
                </span>

                <span className="truncate font-medium">
                  {online
                    ? "Online · using Groq"
                    : "Offline · using local model"}
                </span>
              </div>
            )}
          </div>

          {online !== null && (
            <div
              className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]"
              style={{
                borderColor: "var(--line)",
                background:
                  "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
                color: online ? "#7fb06f" : "var(--accent)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: online ? "#7fb06f" : "var(--accent)" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: online ? "#77b06f" : "var(--accent)" }}
                />
              </span>

              <span className="font-bold tracking-wide">
                {online ? "GROQ" : "LOCAL"}
              </span>
            </div>
          )}
        </div>

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-12">
          <div className="mx-auto max-w-2xl">
            {showDraftView ? (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background:
                        "linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent) 10%, transparent))",
                      border:
                        "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: "var(--accent)" }}
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </svg>
                  </div>
                  <div>
                    <h1
                      className="title text-xl font-semibold tracking-tight sm:text-2xl"
                      style={{ color: "var(--ink)" }}
                    >
                      New Recording
                    </h1>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      Speak freely - we&apos;ll turn it into an outline with
                      tasks once you&apos;re done.
                    </p>
                  </div>
                </div>

                <div
                  className="mt-6 overflow-hidden rounded-xl border p-4 sm:mt-8 sm:p-5"
                  style={{
                    borderColor: "var(--line)",
                    background:
                      "linear-gradient(180deg, color-mix(in srgb, var(--bg-raised) 80%, transparent) 0%, color-mix(in srgb, var(--bg-raised) 40%, transparent) 100%)",
                    boxShadow:
                      "inset 0 1px 0 color-mix(in srgb, var(--ink) 5%, transparent), 0 8px 24px -12px rgba(0,0,0,0.5)",
                  }}
                >
                  <Recorder
                    onTranscriptChange={handleTranscriptChange}
                    disabled={structuring}
                  />
                </div>

                <div className="mt-4 sm:mt-6">
                  <div
                    className="min-h-32 rounded-xl border p-4 text-sm leading-relaxed"
                    style={{
                      borderColor: "var(--line)",
                      background:
                        "color-mix(in srgb, var(--bg-raised) 30%, transparent)",
                      color:
                        draftTranscript || interimTranscript
                          ? "var(--ink)"
                          : "var(--ink-faint)",
                    }}
                  >
                    {draftTranscript || interimTranscript ? (
                      <>
                        {draftTranscript}
                        {interimTranscript && (
                          <span style={{ color: "var(--ink-faint)" }}>
                            {" "}
                            {interimTranscript}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="italic text-center text-xs">
                        Your transcript will appear here as you speak.
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={generateOutline}
                  disabled={!draftTranscript.trim() || structuring}
                  className="group mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200 hover:scale-[1.01] hover:shadow-lg disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 75%, #000))",
                    color: "var(--bg)",
                    boxShadow:
                      "0 4px 16px -4px color-mix(in srgb, var(--accent) 50%, transparent)",
                  }}
                >
                  {structuring ? (
                    <>
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span>Generating outline…</span>
                    </>
                  ) : (
                    <>
                      <span>Generate outline & tasks</span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform duration-200 group-hover:translate-x-0.5"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: "var(--accent)",
                          boxShadow: "0 0 6px var(--accent)",
                        }}
                      />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        Note
                      </span>
                    </div>
                    <h1
                      className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
                      style={{ color: "var(--ink)" }}
                    >
                      {activeNote.title}
                    </h1>
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {new Date(activeNote.createdAt).toLocaleString(
                        undefined,
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        },
                      )}
                    </p>
                  </div>
                </div>

                <section className="mt-8">
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-md"
                      style={{
                        background:
                          "color-mix(in srgb, var(--accent) 15%, transparent)",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: "var(--accent)" }}
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    <h2
                      className="text-[11px] font-semibold uppercase tracking-[0.15em]"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      Outline
                    </h2>
                    <div
                      className="h-px flex-1"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--line), transparent)",
                      }}
                    />
                  </div>
                  <div
                    className="rounded-xl border p-4 sm:p-5"
                    style={{
                      borderColor: "var(--line)",
                      background:
                        "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
                    }}
                  >
                    <Outline
                      note={activeNote}
                      onTaskToggle={handleTaskToggle}
                    />
                  </div>
                </section>

                <section className="mt-8">
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-md"
                      style={{
                        background:
                          "color-mix(in srgb, var(--accent) 15%, transparent)",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: "var(--accent)" }}
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <h2
                      className="text-[11px] font-semibold uppercase tracking-[0.15em]"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      Full transcript
                    </h2>
                    <div
                      className="h-px flex-1"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--line), transparent)",
                      }}
                    />
                  </div>
                  <div
                    className="rounded-xl border p-4 sm:p-5"
                    style={{
                      borderColor: "var(--line)",
                      background:
                        "color-mix(in srgb, var(--bg-raised) 40%, transparent)",
                    }}
                  >
                    <p
                      className="whitespace-pre-wrap text-sm leading-relaxed"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      {activeNote.transcript}
                    </p>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      {showUpload && <UploadAudioModal onClose={() => setShowUpload(false)} />}

      <button
        onClick={toggleFullscreen}
        aria-label="Toggle fullscreen"
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-transform hover:scale-105 active:scale-95"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg-raised)",
          color: "var(--ink-dim)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  );
}
