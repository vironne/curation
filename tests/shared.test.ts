import { describe, it, expect } from 'vitest';

import {
  htmlToText,
  extractLinks,
  parseFromHeader,
  parseThread,
  dedupThreads,
} from '../src/shared/parse.js';
import { computeWeekWindow, toGmailDate, toFrenchDate, toISODate } from '../src/shared/dates.js';
import { markdownToHtml, wrapEmailHtml } from '../src/shared/render.js';
import { FixtureGmailClient } from '../src/shared/gmail.js';
import { parseCliArgs } from '../src/shared/cli.js';

describe('parse.ts', () => {
  describe('htmlToText', () => {
    it('strips tags and decodes entities', () => {
      const html = '<p>Hello&nbsp;<strong>world</strong>!</p>';
      expect(htmlToText(html)).toBe('Hello world!');
    });

    it('drops <script> and <style> blocks', () => {
      const html = '<style>.x{color:red}</style><p>Hi</p><script>evil()</script>';
      const text = htmlToText(html);
      expect(text).toContain('Hi');
      expect(text).not.toContain('color');
      expect(text).not.toContain('evil');
    });

    it('keeps anchor text and url inline', () => {
      const html = '<p>See <a href="https://x.com/y">this article</a> for details.</p>';
      expect(htmlToText(html)).toBe('See this article (https://x.com/y) for details.');
    });

    it('collapses whitespace and newlines', () => {
      const html = '<p>line 1</p>\n\n\n\n<p>line 2</p>';
      expect(htmlToText(html)).toBe('line 1\n\nline 2');
    });
  });

  describe('extractLinks', () => {
    it('finds urls and dedups', () => {
      const text = 'See https://a.com and https://b.com and https://a.com again.';
      expect(extractLinks(text)).toEqual(['https://a.com', 'https://b.com']);
    });

    it('strips trailing punctuation', () => {
      expect(extractLinks('check (https://x.com).')).toEqual(['https://x.com']);
    });
  });

  describe('parseFromHeader', () => {
    it('parses Name <email>', () => {
      expect(parseFromHeader('Estelle Métayer <competia@substack.com>')).toEqual({
        name: 'Estelle Métayer',
        email: 'competia@substack.com',
      });
    });

    it('parses bare email', () => {
      expect(parseFromHeader('hi@every.to')).toEqual({
        name: '',
        email: 'hi@every.to',
      });
    });
  });

  describe('parseThread', () => {
    it('returns body text and links from html', () => {
      const parsed = parseThread({
        id: 't1',
        subject: 'Hello',
        from: 'Bob <bob@x.com>',
        date: '2026-04-27',
        bodyHtml: '<p>Read <a href="https://news.com">this</a></p>',
      });
      expect(parsed.bodyText).toContain('Read this (https://news.com)');
      expect(parsed.links).toEqual(['https://news.com']);
      expect(parsed.fromEmail).toBe('bob@x.com');
      expect(parsed.fromName).toBe('Bob');
    });
  });

  describe('dedupThreads', () => {
    it('keeps first occurrence by id', () => {
      const out = dedupThreads([
        { id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' },
      ]);
      expect(out.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('dates.ts', () => {
  it('computes the previous full week (Mon→Sun)', () => {
    // Wednesday April 29, 2026 — week window should be Mon Apr 20 → Sun Apr 26.
    const w = computeWeekWindow(new Date('2026-04-29T09:00:00'));
    expect(w.startISO).toBe('2026-04-20');
    expect(w.endISO).toBe('2026-04-26');
  });

  it('handles Monday correctly (window = previous week)', () => {
    // Monday May 4, 2026 — window = Mon Apr 27 → Sun May 3.
    const w = computeWeekWindow(new Date('2026-05-04T08:00:00'));
    expect(w.startISO).toBe('2026-04-27');
    expect(w.endISO).toBe('2026-05-03');
  });

  it('toGmailDate uses YYYY/MM/DD', () => {
    expect(toGmailDate(new Date('2026-04-20T00:00:00'))).toBe('2026/04/20');
  });

  it('toFrenchDate produces French', () => {
    expect(toFrenchDate(new Date('2026-04-20T00:00:00'))).toBe('20 avril 2026');
  });

  it('toISODate is timezone-stable', () => {
    expect(toISODate(new Date('2026-04-20T00:00:00'))).toBe('2026-04-20');
  });
});

describe('render.ts', () => {
  it('renders headings', () => {
    expect(markdownToHtml('# Hello')).toBe('<h1>Hello</h1>');
    expect(markdownToHtml('### Sub')).toBe('<h3>Sub</h3>');
  });

  it('renders paragraphs and bold/italic', () => {
    const out = markdownToHtml('hello **world** and *foo*');
    expect(out).toContain('<strong>world</strong>');
    expect(out).toContain('<em>foo</em>');
  });

  it('renders links', () => {
    expect(markdownToHtml('[click](https://x.com)')).toContain('<a href="https://x.com">click</a>');
  });

  it('renders unordered lists', () => {
    const out = markdownToHtml('- a\n- b\n- c');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>c</li>');
    expect(out).toContain('</ul>');
  });

  it('renders blockquotes', () => {
    const out = markdownToHtml('> wisdom\n> — author');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('wisdom');
    expect(out).toContain('</blockquote>');
  });

  it('escapes HTML in content', () => {
    const out = markdownToHtml('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('wraps in email-safe shell', () => {
    const html = wrapEmailHtml('<p>x</p>', 'Title');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Title</title>');
    expect(html).toContain('<p>x</p>');
  });
});

describe('FixtureGmailClient', () => {
  it('reads JSON fixtures and respects max', async () => {
    const client = new FixtureGmailClient('tests/fixtures');
    const threads = await client.searchThreads('any', 10);
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((t) => typeof t.id === 'string' && t.id.length > 0)).toBe(true);
  });

  it('caps at max', async () => {
    const client = new FixtureGmailClient('tests/fixtures');
    const threads = await client.searchThreads('', 1);
    expect(threads).toHaveLength(1);
  });

  it('throws on missing fixtures dir', async () => {
    const client = new FixtureGmailClient('tests/does-not-exist');
    await expect(client.searchThreads('', 10)).rejects.toThrow();
  });
});

describe('cli.parseCliArgs', () => {
  it('parses --dry-run and --fixtures', () => {
    const opts = parseCliArgs(['node', 'index.js', '--dry-run', '--fixtures']);
    expect(opts.dryRun).toBe(true);
    expect(opts.useFixtures).toBe(true);
  });

  it('parses --output-dir and --max-threads', () => {
    const opts = parseCliArgs(['node', 'index.js', '--output-dir', '/tmp/out', '--max-threads', '5']);
    expect(opts.outputDir).toBe('/tmp/out');
    expect(opts.maxThreads).toBe(5);
  });

  it('--fixtures implies --dry-run', () => {
    const opts = parseCliArgs(['node', 'index.js', '--fixtures']);
    expect(opts.dryRun).toBe(true);
  });
});
