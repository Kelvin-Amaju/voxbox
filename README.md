# VOXBOX

Record a voice memo (or upload audio), get a live transcript, and turn it into a
structured outline with a task breakdown — then export it as a document.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Web Speech API** (browser-native) for live recording transcription
- **Groq API** for upload transcription (`whisper-large-v3-turbo`) and outline
  generation (`allam-2-7b`) — used automatically when online
- **transformers.js** local model (`Qwen2.5-0.5B-Instruct`) as an offline
  fallback for outline generation
- **SQLite** via `better-sqlite3` for persistence (no external DB needed)
- **pdfkit** for PDF export (+ Word-compatible `.doc` export)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add your Groq API key to `.env.local`:
   ```
   GROQ_API_KEY=gsk_...
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## How it works

1. **New recording** — tap record; the browser's built-in speech recognition
   transcribes as you talk (Chrome/Edge). On mobile, recognition auto-resumes
   when the browser drops the stream.
2. **Upload audio** — for pre-recorded files (`.wav .mp3 .m4a .ogg .flac .webm
   .mp4 .mpeg .mpga .aac .wma .opus .aiff`). Non-Groq formats (e.g. `.aac`) are
   decoded to WAV in the browser before being sent to Groq Whisper.
3. **Generate outline & tasks** — the transcript is structured into sections
   with concrete action items. Groq is used when online; otherwise the local
   transformers.js model runs. A sidebar banner shows which mode is active.
4. Outline items are checkable, and both the transcript and task state persist
   in a local SQLite file at `data/notes.db` (auto-created on first run).
5. **Export** — an outline can be downloaded as `.doc` or `.pdf` from `output/`.

## Features

- Live recording + audio upload transcription
- Auto-generated title, sections, summaries, and tasks
- `.doc` / `.pdf` export
- Online/offline indicator with automatic model fallback
- Mobile-friendly: collapsible sidebar, fullscreen toggle (bottom-right)

## Notes

- **Offline model memory:** the local transformers.js fallback needs ~1.5GB free
  RAM to load; on low-memory machines it can crash the server. Groq is preferred
  whenever a connection is available.
- A fullscreen splash loader covers the page for ~20s on first load (tune
  `LOADER_MS` in `src/components/Loader.tsx`).