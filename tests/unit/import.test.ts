import { describe, it, expect } from "vitest";
import { parseImportedFile, importTitle, convertMarkdown, convertPlainText } from "@/lib/import";

describe("importTitle", () => {
  it("strips extension and normalises underscores", () => {
    expect(importTitle("my_document.md")).toBe("my document");
  });

  it("strips only the final extension", () => {
    expect(importTitle("report.v2.txt")).toBe("report.v2");
  });

  it("falls back when title is blank after stripping", () => {
    expect(importTitle(".md")).toBe("Imported document");
  });

  it("truncates to 200 characters", () => {
    const long = "a".repeat(300) + ".md";
    expect(importTitle(long).length).toBeLessThanOrEqual(200);
  });
});

describe("parseImportedFile", () => {
  it("accepts a valid .md file and returns a doc node", () => {
    const bytes = new TextEncoder().encode("# Hello\n\nThis is **bold** text.");
    const result = parseImportedFile("hello.md", bytes);
    expect(result.title).toBe("hello");
    expect(result.content.type).toBe("doc");
    expect(result.content.content).toBeDefined();
  });

  it("accepts a valid .txt file", () => {
    const bytes = new TextEncoder().encode("First paragraph.\n\nSecond paragraph.");
    const result = parseImportedFile("notes.txt", bytes);
    expect(result.title).toBe("notes");
    expect(result.content.type).toBe("doc");
  });

  it("rejects an unsupported extension", () => {
    const bytes = new TextEncoder().encode("content");
    expect(() => parseImportedFile("file.pdf", bytes)).toThrow("Only .txt and .md files are supported.");
  });

  it("rejects an empty file", () => {
    expect(() => parseImportedFile("file.txt", new Uint8Array(0))).toThrow("The file is empty.");
  });

  it("rejects a file over 1 MiB", () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    expect(() => parseImportedFile("big.txt", big)).toThrow("1 MiB");
  });

  it("rejects invalid UTF-8", () => {
    const invalid = new Uint8Array([0xff, 0xfe, 0x00]);
    expect(() => parseImportedFile("bad.txt", invalid)).toThrow("UTF-8");
  });
});

describe("convertMarkdown", () => {
  it("converts headings to the correct levels", () => {
    const result = convertMarkdown("# H1\n## H2\n### H3\n#### H4");
    const blocks = result.content ?? [];
    const h1 = blocks.find((n) => n.type === "heading" && n.attrs?.level === 1);
    const h4 = blocks.find((n) => n.type === "heading" && n.attrs?.level === 4);
    expect(h1).toBeDefined();
    expect(h4).toBeUndefined(); // clamped to H3
  });

  it("does not render raw HTML as markup", () => {
    const result = convertMarkdown("<script>alert(1)</script>");
    const json = JSON.stringify(result);
    expect(json).not.toContain('"html"');
    expect(json).toContain("script");
  });

  it("produces bold marks for **text**", () => {
    const result = convertMarkdown("This is **bold** text.");
    const json = JSON.stringify(result);
    expect(json).toContain('"bold"');
  });
});

describe("convertPlainText", () => {
  it("splits on blank lines into paragraphs", () => {
    const result = convertPlainText("Para one.\n\nPara two.");
    expect(result.content?.length).toBe(2);
    expect(result.content?.every((n) => n.type === "paragraph")).toBe(true);
  });

  it("treats single newlines as hardBreak nodes", () => {
    const result = convertPlainText("Line one.\nLine two.");
    const json = JSON.stringify(result);
    expect(json).toContain('"hardBreak"');
  });
});
