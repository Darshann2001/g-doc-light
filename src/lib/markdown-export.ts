import type { JSONContent } from "@tiptap/core";

function inlineToMd(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text") return "";
      let text = node.text ?? "";
      const marks = node.marks ?? [];

      const link = marks.find((m) => m.type === "link");
      const bold = marks.find((m) => m.type === "bold");
      const italic = marks.find((m) => m.type === "italic");

      if (link) return `[${text}](${link.attrs?.href ?? ""})`;
      if (bold && italic) text = `***${text}***`;
      else if (bold) text = `**${text}**`;
      else if (italic) text = `*${text}*`;
      return text;
    })
    .join("");
}

function listItemToMd(node: JSONContent, indent = ""): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") return inlineToMd(child.content);
      if (child.type === "bulletList") return bulletListToMd(child, indent + "  ");
      if (child.type === "orderedList") return orderedListToMd(child, indent + "  ");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function bulletListToMd(node: JSONContent, indent = ""): string {
  return (node.content ?? [])
    .map((item) => `${indent}- ${listItemToMd(item, indent)}`)
    .join("\n");
}

function orderedListToMd(node: JSONContent, indent = ""): string {
  return (node.content ?? [])
    .map((item, i) => `${indent}${i + 1}. ${listItemToMd(item, indent)}`)
    .join("\n");
}

function blockToMd(node: JSONContent): string {
  switch (node.type) {
    case "heading":
      return `${"#".repeat(node.attrs?.level ?? 1)} ${inlineToMd(node.content)}`;
    case "paragraph":
      return inlineToMd(node.content);
    case "bulletList":
      return bulletListToMd(node);
    case "orderedList":
      return orderedListToMd(node);
    default:
      return "";
  }
}

export function tiptapToMarkdown(content: JSONContent): string {
  if (content.type !== "doc") return "";
  return (content.content ?? [])
    .map(blockToMd)
    .join("\n\n")
    .trim();
}

export function downloadMarkdown(title: string, content: JSONContent) {
  const md = tiptapToMarkdown(content);
  const blob = new Blob([md], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${title.trim() || "document"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
