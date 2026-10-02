// Chat-scoped document attachments for the AI Assistant (distinct from the
// org-wide policy knowledge base in knowledge-actions.ts/rag.ts): the user
// attaches a file to one conversation, its text is extracted once at
// upload time and stored on ai_conversation_attachments, and gateway.ts
// folds that text into the model's context for that conversation only. No
// chunking/search - these are meant to be a handful of documents read in
// full, not an indexed corpus.

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches next.config.ts's server action body limit
const MAX_EXTRACTED_CHARS = 40_000; // ~10k tokens; keeps a handful of attachments within the model's context budget

const PLAIN_TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv"]);
const PLAIN_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv"]);

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function validateAttachment(file: File): { ok: true } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Choose a file to attach." };
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, error: `File is too large (max ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB).` };
  }
  const ext = extensionOf(file.name);
  const isPlainText = PLAIN_TEXT_TYPES.has(file.type) || PLAIN_TEXT_EXTENSIONS.has(ext);
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx";
  if (!isPlainText && !isPdf && !isDocx) {
    return { ok: false, error: "Only .txt, .md, .csv, .pdf, and .docx files can be attached." };
  }
  return { ok: true };
}

// Extracts readable text from an attached file. Returns the text (capped
// at MAX_EXTRACTED_CHARS, with a trailing note if truncated) or throws with
// a message safe to show the user.
export async function extractAttachmentText(file: File): Promise<string> {
  const ext = extensionOf(file.name);
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx";

  let text: string;
  if (isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (isDocx) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = await file.text();
  }

  text = text.trim();
  if (!text) throw new Error("Couldn't find any readable text in that file.");

  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS) + "\n\n[...truncated - document is longer than the assistant can read in full...]";
  }
  return text;
}
