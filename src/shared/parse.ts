import type { RawThread, ParsedThread } from './types.js';

/**
 * Best-effort HTML→text conversion. We avoid pulling jsdom/cheerio: a regex
 * pass is enough for newsletter bodies. The LLM is robust to leftover noise.
 */
export function htmlToText(html: string): string {
  if (!html) return '';

  let text = html;

  // Drop <script> / <style> blocks entirely.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // Convert block-level breaks to newlines.
  text = text.replace(/<\/(p|div|li|h[1-6]|tr|table|section|article|header|footer)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Anchors → keep visible text + URL inline so the LLM has both.
  text = text.replace(
    /<a\s+[^>]*?href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, inner) => {
      const innerText = inner.replace(/<[^>]+>/g, '').trim();
      if (!innerText) return ` ${href} `;
      if (innerText === href) return ` ${href} `;
      return ` ${innerText} (${href}) `;
    },
  );

  // Strip remaining tags.
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode the most common HTML entities.
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));

  // Collapse whitespace.
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]+/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  // Drop the spurious space tag-stripping leaves before punctuation.
  text = text.replace(/ +([!?.,;:])/g, '$1');

  return text.trim();
}

const URL_REGEX = /https?:\/\/[^\s<>")\]]+/gi;

/** Extract every http(s) URL from a piece of text/html, dedup-preserving order. */
export function extractLinks(content: string): string[] {
  if (!content) return [];
  const matches = content.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const url = stripTrailingPunct(raw);
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[),.;:!?'"\]]+$/g, '');
}

/** Parse "Name <email@x>" or "email@x" → { name, email }. */
export function parseFromHeader(from: string): { name: string; email: string } {
  if (!from) return { name: '', email: '' };
  const angle = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) {
    return { name: angle[1].trim(), email: angle[2].trim().toLowerCase() };
  }
  // Bare email.
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(from.trim())) {
    return { name: '', email: from.trim().toLowerCase() };
  }
  return { name: from.trim(), email: '' };
}

/** Turn a RawThread into a ParsedThread (text body, links). */
export function parseThread(raw: RawThread): ParsedThread {
  const bodyText = raw.bodyText && raw.bodyText.trim().length > 0
    ? raw.bodyText
    : htmlToText(raw.bodyHtml ?? '');

  const linkSource = `${raw.bodyHtml ?? ''}\n${bodyText}`;
  const links = extractLinks(linkSource);

  const { name, email } = parseFromHeader(raw.from);

  return {
    id: raw.id,
    subject: raw.subject ?? '',
    from: raw.from ?? '',
    fromEmail: email,
    fromName: name,
    date: raw.date ?? '',
    bodyText,
    links,
  };
}

/**
 * Dedup a list of threads by id, keeping the first occurrence. The Gmail MCP
 * sometimes returns a thread twice when several queries overlap.
 */
export function dedupThreads<T extends { id: string }>(threads: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of threads) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}
