"use client";

import { useState } from "react";
import type { Note } from "@/lib/db";

interface OutlineProps {
  note: Note;
  onTaskToggle: (taskId: string, done: boolean) => void;
}

export default function Outline({ note, onTaskToggle }: OutlineProps) {
  if (note.status === "processing") {
    return (
      <div className="flex items-center gap-3 py-8 text-sm" style={{ color: "var(--ink-dim)" }}>
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: "var(--accent)", animation: "pulse 1.2s ease-in-out infinite" }}
        />
        Structuring your outline…
        <style jsx>{`
          @keyframes pulse {
            0%,
            100% {
              opacity: 0.3;
            }
            50% {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  if (note.status === "error") {
    return (
      <div className="py-6 text-sm" style={{ color: "var(--ink-dim)" }}>
        Couldn&apos;t generate an outline for this note. The transcript is still saved — try again.
      </div>
    );
  }

  if (note.sections.length === 0) {
    return (
      <div className="py-6 text-sm" style={{ color: "var(--ink-faint)" }}>
        No sections yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {note.sections.map((section, idx) => (
        <SectionBlock
          key={section.id}
          section={section}
          isLast={idx === note.sections.length - 1}
          onTaskToggle={onTaskToggle}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  isLast,
  onTaskToggle,
}: {
  section: Note["sections"][number];
  isLast: boolean;
  onTaskToggle: (taskId: string, done: boolean) => void;
}) {
  return (
    <div
      className="py-5"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--line)" }}
    >
      <h3 className="font-display text-base font-medium" style={{ color: "var(--ink)" }}>
        {section.title}
      </h3>
      {section.summary && (
        <p className="mt-1 text-sm" style={{ color: "var(--ink-dim)" }}>
          {section.summary}
        </p>
      )}
      {section.tasks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {section.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onTaskToggle} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Note["sections"][number]["tasks"][number];
  onToggle: (taskId: string, done: boolean) => void;
}) {
  const [done, setDone] = useState(task.done);

  return (
    <li className="flex items-start gap-3">
      <button
        onClick={() => {
          const next = !done;
          setDone(next);
          onToggle(task.id, next);
        }}
        aria-pressed={done}
        aria-label={done ? "Mark task not done" : "Mark task done"}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors"
        style={{
          border: `1px solid ${done ? "var(--accent)" : "var(--ink-faint)"}`,
          background: done ? "var(--accent)" : "transparent",
        }}
      >
        {done && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.2 5.7L8 1" stroke="var(--bg)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        className="text-sm leading-snug"
        style={{
          color: done ? "var(--ink-faint)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {task.content}
      </span>
    </li>
  );
}
