import fs from "fs";
import path from "path";
import { Outline } from "./outline";

const OUTPUT_ROOT = path.join(process.cwd(), "output");

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "note";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateDoc(outline: Outline): string {
  const sections = outline.sections
    .map(
      (s) => `<h2>${escapeHtml(s.title)}</h2>
<ul>${s.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("\n")}</ul>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(outline.title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 40px; line-height: 1.5; }
  h1 { font-size: 22pt; margin-bottom: 20px; }
  h2 { font-size: 14pt; color: #333; margin-top: 20px; }
  li { margin: 5px 0; font-size: 11pt; }
</style>
</head>
<body>
<h1>${escapeHtml(outline.title)}</h1>
${sections}
</body>
</html>`;
}

export async function generatePdf(outline: Outline): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fontSize(22).text(outline.title, { align: "left" });
  doc.moveDown(1);

  for (const section of outline.sections) {
    doc.fontSize(14).text(section.title);
    doc.moveDown(0.4);
    for (const point of section.points) {
      doc.fontSize(11).list([point]);
    }
    doc.moveDown(0.8);
  }

  doc.end();
  return done;
}

export interface ExportedFile {
  name: string;
  url: string;
  absPath: string;
}

export interface ExportResult {
  files: ExportedFile[];
}

export async function exportOutline(noteId: string, outline: Outline): Promise<ExportResult> {
  const dir = path.join(OUTPUT_ROOT, sanitize(noteId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const base = sanitize(outline.title);

  const docPath = path.join(dir, `${base}.doc`);
  const pdfPath = path.join(dir, `${base}.pdf`);

  fs.writeFileSync(docPath, generateDoc(outline), "utf8");
  const pdf = await generatePdf(outline);
  fs.writeFileSync(pdfPath, pdf);

  const rel = (p: string) => p.replace(OUTPUT_ROOT, "").replace(/\\/g, "/");

  return {
    files: [
      { name: `${base}.doc`, url: `/api/export${rel(docPath)}`, absPath: docPath },
      { name: `${base}.pdf`, url: `/api/export${rel(pdfPath)}`, absPath: pdfPath },
    ],
  };
}
