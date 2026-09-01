import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "notes.db");

// Ensure the data directory exists (better-sqlite3 won't create it).
import fs from "fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Reuse a single connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { db?: Database.Database };

export const db = globalForDb.db ?? new Database(DB_PATH);
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'processing',
    output_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_sections_note ON sections(note_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
`);

// Add the output_path column to existing databases (schema migration).
const noteCols = db.prepare(`PRAGMA table_info(notes)`).all() as { name: string }[];
if (!noteCols.some((c) => c.name === "output_path")) {
  try {
    db.exec(`ALTER TABLE notes ADD COLUMN output_path TEXT`);
  } catch {
    // Column may already exist from a concurrent worker/process — ignore.
  }
}

export type NoteStatus = "processing" | "ready" | "error";

export interface Task {
  id: string;
  content: string;
  done: boolean;
  order: number;
}

export interface Section {
  id: string;
  title: string;
  summary: string | null;
  order: number;
  tasks: Task[];
}

export interface Note {
  id: string;
  title: string;
  transcript: string;
  status: NoteStatus;
  outputPath: string | null;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
}

export function saveOutputPath(id: string, outputPath: string) {
  db.prepare(`UPDATE notes SET output_path = ? WHERE id = ?`).run(outputPath, id);
  touchNote(id);
}

function touchNote(id: string) {
  db.prepare(`UPDATE notes SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function createNote(title: string, transcript: string): Note {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO notes (id, title, transcript, status) VALUES (?, ?, ?, 'processing')`
  ).run(id, title, transcript);
  return getNote(id)!;
}

export function updateTranscript(id: string, transcript: string, title?: string) {
  if (title !== undefined) {
    db.prepare(`UPDATE notes SET transcript = ?, title = ? WHERE id = ?`).run(transcript, title, id);
  } else {
    db.prepare(`UPDATE notes SET transcript = ? WHERE id = ?`).run(transcript, id);
  }
  touchNote(id);
}

export function setNoteStatus(id: string, status: NoteStatus) {
  db.prepare(`UPDATE notes SET status = ? WHERE id = ?`).run(status, id);
  touchNote(id);
}

interface StructurePayload {
  sections: {
    title: string;
    summary?: string;
    tasks: string[];
  }[];
}

export function saveStructure(noteId: string, structure: StructurePayload) {
  const insertSection = db.prepare(
    `INSERT INTO sections (id, note_id, title, summary, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, section_id, content, sort_order) VALUES (?, ?, ?, ?)`
  );
  const clearSections = db.prepare(`DELETE FROM sections WHERE note_id = ?`);

  const tx = db.transaction(() => {
    clearSections.run(noteId); // cascades to tasks
    structure.sections.forEach((section, sIdx) => {
      const sectionId = randomUUID();
      insertSection.run(sectionId, noteId, section.title, section.summary ?? null, sIdx);
      section.tasks.forEach((task, tIdx) => {
        insertTask.run(randomUUID(), sectionId, task, tIdx);
      });
    });
    setNoteStatus(noteId, "ready");
  });
  tx();
}

export function getNote(id: string): Note | null {
  const noteRow = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as
    | {
        id: string;
        title: string;
        transcript: string;
        status: NoteStatus;
        output_path: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!noteRow) return null;

  const sectionRows = db
    .prepare(`SELECT * FROM sections WHERE note_id = ? ORDER BY sort_order ASC`)
    .all(id) as { id: string; title: string; summary: string | null; sort_order: number }[];

  const sections: Section[] = sectionRows.map((s) => {
    const taskRows = db
      .prepare(`SELECT * FROM tasks WHERE section_id = ? ORDER BY sort_order ASC`)
      .all(s.id) as { id: string; content: string; done: number; sort_order: number }[];
    return {
      id: s.id,
      title: s.title,
      summary: s.summary,
      order: s.sort_order,
      tasks: taskRows.map((t) => ({
        id: t.id,
        content: t.content,
        done: !!t.done,
        order: t.sort_order,
      })),
    };
  });

  return {
    id: noteRow.id,
    title: noteRow.title,
    transcript: noteRow.transcript,
    status: noteRow.status,
    outputPath: noteRow.output_path,
    createdAt: noteRow.created_at,
    updatedAt: noteRow.updated_at,
    sections,
  };
}

export function listNotes(): Note[] {
  const rows = db.prepare(`SELECT id FROM notes ORDER BY created_at DESC`).all() as { id: string }[];
  return rows.map((r) => getNote(r.id)!);
}

export function deleteNote(id: string) {
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id); // cascades
}

export function setTaskDone(taskId: string, done: boolean) {
  db.prepare(`UPDATE tasks SET done = ? WHERE id = ?`).run(done ? 1 : 0, taskId);
}
