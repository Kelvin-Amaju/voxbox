"use client";

import type { Note } from "@/lib/db";

interface NotesListProps {
  notes: Note[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenUpload: () => void;
}

export default function NotesList({ notes, activeId, onSelect, onNew, onOpenUpload }: NotesListProps) {
  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onNew}
        className="mb-2 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{ background: "var(--accent)", color: "var(--bg)" }}
      >
        + New Recording
      </button>
      <button
        onClick={onOpenUpload}
        className="mb-4 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--line)", color: "var(--ink-dim)" }}
      >
        Upload Audio
      </button>
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <p className="px-1 py-4 text-xs" style={{ color: "var(--ink-faint)" }}>
            No recordings yet.
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                onClick={() => onSelect(note.id)}
                className="w-full rounded-md px-3 py-2.5 text-left transition-colors"
                style={{
                  background: note.id === activeId ? "var(--bg-raised)" : "transparent",
                }}
              >
                <div
                  className="truncate text-sm font-medium"
                  style={{ color: note.id === activeId ? "var(--ink)" : "var(--ink-dim)" }}
                >
                  {note.title}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                  <StatusDot status={note.status} />
                  {new Date(note.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Note["status"] }) {
  const color =
    status === "ready" ? "#6b9c5f" : status === "error" ? "var(--accent)" : "var(--ink-faint)";
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}
