/**
 * Lightweight markdown→HTML for email bodies. Focused on the constructs the
 * digest templates actually use (headings, paragraphs, lists, blockquotes,
 * inline code, bold/italic, links). Email clients are conservative — we
 * inline minimal styles and stick to plain HTML.
 */

export function markdownToHtml(md: string): string {
  if (!md) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  let listType: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let inCodeBlock = false;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeBlockquote = () => {
    if (inBlockquote) {
      out.push('</blockquote>');
      inBlockquote = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (inCodeBlock) {
      if (/^```/.test(line)) {
        out.push('</code></pre>');
        inCodeBlock = false;
      } else {
        out.push(escapeHtml(line));
      }
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      closeList();
      closeBlockquote();
      out.push('<pre><code>');
      inCodeBlock = true;
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^---+\s*$/.test(line)) {
      closeList();
      closeBlockquote();
      out.push('<hr/>');
      i++;
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeBlockquote();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      closeList();
      if (!inBlockquote) {
        out.push('<blockquote>');
        inBlockquote = true;
      }
      out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
      i++;
      continue;
    } else if (inBlockquote && line.trim() === '') {
      closeBlockquote();
      i++;
      continue;
    }

    // Lists.
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul) {
      closeBlockquote();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      i++;
      continue;
    }
    if (ol) {
      closeBlockquote();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      i++;
      continue;
    } else if (listType && line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Blank line.
    if (line.trim() === '') {
      closeList();
      closeBlockquote();
      i++;
      continue;
    }

    // Paragraph (collapse consecutive non-blank lines).
    closeList();
    const para: string[] = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() !== '' &&
      !/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|---+\s*$|```)/.test(lines[i + 1])
    ) {
      i++;
      para.push(lines[i]);
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
    i++;
  }

  closeList();
  closeBlockquote();
  if (inCodeBlock) out.push('</code></pre>');

  return out.join('\n');
}

function inline(text: string): string {
  let s = escapeHtml(text);

  // Inline code (escape happened first, so we match escaped backticks).
  s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // Links [text](url) — we already HTML-escaped; URLs containing & become &amp;.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    return `<a href="${url}">${label}</a>`;
  });

  // Bold + italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Wrap rendered HTML in a minimal email-safe shell. */
export function wrapEmailHtml(innerHtml: string, title: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; max-width: 720px; margin: 0 auto; padding: 24px; line-height: 1.55; }
  h1 { font-size: 22px; margin-top: 0; }
  h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  h3 { font-size: 16px; margin-top: 22px; }
  h4 { font-size: 14px; margin-top: 18px; }
  blockquote { border-left: 3px solid #ddd; margin: 12px 0; padding: 4px 14px; color: #555; }
  blockquote p { margin: 6px 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 22px 0; }
  a { color: #0b5fff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 22px; }
  li { margin: 4px 0; }
  code { background: #f5f5f7; padding: 1px 4px; border-radius: 3px; font-size: 0.92em; }
  pre code { background: none; padding: 0; }
  pre { background: #f5f5f7; padding: 12px; border-radius: 6px; overflow-x: auto; }
</style>
</head>
<body>
${innerHtml}
</body>
</html>`;
}
