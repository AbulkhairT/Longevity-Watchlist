/**
 * Tiny Markdown subset renderer for our own trusted docs (headings, paragraphs,
 * bullet lists, **bold**, [links](url)). Escapes everything else. Not for user input.
 */
function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return escape(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) =>
      /^(https?:\/\/|\/|#)/.test(href) ? `<a href="${href}">${text}</a>` : text,
    );
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function renderMarkdown(md: string, { skipH1 = true } = {}): string {
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1]!.length;
      if (level === 1 && skipH1) continue;
      out.push(`<h${level + 1} id="${slugify(h[2]!)}">${inline(h[2]!)}</h${level + 1}>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      (list ??= []).push(li[1]!);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}
