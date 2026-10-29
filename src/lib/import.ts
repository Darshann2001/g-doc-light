import { lexer } from "marked";
import type { Token } from "marked";
import type { JSONContent } from "@tiptap/core";
import { ValidationError } from "@/lib/validation";
import { sanitizeTitle } from "@/lib/validation";

const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_TITLE = 200;

type LooseToken = {
  type: string;
  raw?: string;
  text?: string;
  href?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  tokens?: Token[];
  items?: LooseToken[];
  header?: Array<{ tokens?: Token[]; text?: string }>;
  rows?: Array<Array<{ tokens?: Token[]; text?: string }>>;
};

type Mark = NonNullable<JSONContent["marks"]>[number];

function textNode(text: string, marks?: Mark[]): JSONContent {
  const node: JSONContent = { type: "text", text };
  if (marks && marks.length > 0) node.marks = marks;
  return node;
}

function safeHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return value;
  } catch {
    return null;
  }
  return null;
}

function inlineContent(tokens: Token[] | undefined): JSONContent[] {
  if (!tokens || tokens.length === 0) return [];
  const result: JSONContent[] = [];

  for (const rawToken of tokens) {
    const token = rawToken as unknown as LooseToken;
    switch (token.type) {
      case "text":
        if (token.text) result.push(textNode(token.text));
        break;
      case "escape":
        if (token.text) result.push(textNode(token.text));
        break;
      case "strong":
        result.push(...withMark(inlineContent(token.tokens), { type: "bold" }));
        break;
      case "em":
        result.push(...withMark(inlineContent(token.tokens), { type: "italic" }));
        break;
      case "link": {
        const href = safeHref(token.href);
        const children = inlineContent(token.tokens);
        result.push(...(href ? withMark(children, { type: "link", attrs: { href } }) : children));
        break;
      }
      case "br":
        result.push({ type: "hardBreak" });
        break;
      case "codespan":
      case "del":
      case "html":
        if (token.text) result.push(textNode(token.text));
        break;
      case "image":
        if (token.text) result.push(textNode(token.text));
        break;
      default:
        if (token.tokens && token.tokens.length > 0) result.push(...inlineContent(token.tokens));
        else if (token.text) result.push(textNode(token.text));
    }
  }

  return result;
}

function withMark(nodes: JSONContent[], mark: Mark): JSONContent[] {
  return nodes.map((node) => {
    if (node.type !== "text") return node;
    return { ...node, marks: [...(node.marks ?? []), mark] };
  });
}

function paragraph(content: JSONContent[] = []): JSONContent {
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function textWithBreaks(text: string): JSONContent[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (line) content.push(textNode(line));
  });
  return content;
}

function plainText(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((rawToken) => {
      const token = rawToken as unknown as LooseToken;
      if (token.text) return token.text;
      if (token.tokens) return plainText(token.tokens);
      return "";
    })
    .join("");
}

function listItemBlocks(tokens: Token[] | undefined): JSONContent[] {
  const blocks = blockContent(tokens);
  const safe = blocks.filter((block) => block.type === "paragraph" || block.type === "bulletList" || block.type === "orderedList");
  return safe.length > 0 ? safe : [paragraph()];
}

function blockContent(tokens: Token[] | undefined): JSONContent[] {
  if (!tokens || tokens.length === 0) return [];
  const result: JSONContent[] = [];

  for (const rawToken of tokens) {
    const token = rawToken as unknown as LooseToken;
    switch (token.type) {
      case "space":
        break;
      case "heading": {
        const level = Math.min(3, Math.max(1, token.depth ?? 1));
        result.push({ type: "heading", attrs: { level }, content: inlineContent(token.tokens) });
        break;
      }
      case "paragraph":
        result.push(paragraph(inlineContent(token.tokens)));
        break;
      case "blockquote":
        result.push(...blockContent(token.tokens));
        break;
      case "list": {
        const type = token.ordered ? "orderedList" : "bulletList";
        const items = (token.items ?? []).map((item) => ({
          type: "listItem",
          content: listItemBlocks(item.tokens),
        }));
        const node: JSONContent = { type, content: items };
        if (token.ordered && typeof token.start === "number" && token.start !== 1) {
          node.attrs = { start: token.start };
        }
        result.push(node);
        break;
      }
      case "code":
        result.push(paragraph(textWithBreaks(token.text ?? "")));
        break;
      case "table": {
        const header = (token.header ?? []).map((cell) => plainText(cell.tokens)).join(" | ");
        if (header) result.push(paragraph([textNode(header)]));
        for (const row of token.rows ?? []) {
          const line = row.map((cell) => plainText(cell.tokens)).join(" | ");
          if (line) result.push(paragraph([textNode(line)]));
        }
        break;
      }
      case "html":
        if (token.text) result.push(paragraph([textNode(token.text)]));
        break;
      case "hr":
        break;
      default:
        if (token.tokens && token.tokens.length > 0) result.push(paragraph(inlineContent(token.tokens)));
        else if (token.text) result.push(paragraph([textNode(token.text)]));
    }
  }

  return result;
}

export function convertMarkdown(markdown: string): JSONContent {
  const tokens = lexer(markdown) as Token[];
  const content = blockContent(tokens);
  return { type: "doc", content: content.length > 0 ? content : [paragraph()] };
}

export function convertPlainText(text: string): JSONContent {
  const normalized = text.replace(/\r\n?/g, "\n");
  const chunks = normalized.split(/\n{2,}/);
  const content: JSONContent[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    content.push(paragraph(textWithBreaks(chunk.replace(/^\n+|\n+$/g, ""))));
  }

  return { type: "doc", content: content.length > 0 ? content : [paragraph()] };
}

export function importTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(txt|md|markdown)$/i, "");
  const title = sanitizeTitle(withoutExtension.replace(/[_-]+/g, " "));
  return (title || "Imported document").slice(0, MAX_TITLE);
}

export interface ImportedDocument {
  title: string;
  content: JSONContent;
}

export function parseImportedFile(fileName: string, bytes: Uint8Array): ImportedDocument {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "txt" && extension !== "md" && extension !== "markdown") {
    throw new ValidationError("Only .txt and .md files are supported.");
  }
  if (bytes.byteLength === 0) throw new ValidationError("The file is empty.");
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError("File must be 1 MiB or smaller.");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError("File must be valid UTF-8 text.");
  }
  if (text.includes("\u0000")) throw new ValidationError("File contains unsupported binary data.");

  const content = extension === "txt" ? convertPlainText(text) : convertMarkdown(text);
  return { title: importTitle(fileName), content };
}

export const IMPORT_LIMITS = { maxBytes: MAX_IMPORT_BYTES };
