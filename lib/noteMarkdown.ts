import { Marked } from "marked";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Markdown for notes, with raw HTML escaped rather than rendered. */
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

export function renderNote(body: string): string {
  const html = md.parse(body, { async: false }) as string;
  // Links open safely in a new tab; javascript: URLs are dropped.
  return html
    .replace(/href="javascript:[^"]*"/gi, 'href="#"')
    .replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
}
