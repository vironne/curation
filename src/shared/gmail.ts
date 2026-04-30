import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { RawThread } from './types.js';
import { dedupThreads, parseThread } from './parse.js';

/**
 * Both pipelines depend only on this interface. The fixture client reads
 * sanitized JSON files; the MCP-backed client is wired by the scheduled task
 * runner via `setMcpGmailTransport`.
 */
export interface GmailClient {
  searchThreads(query: string, max: number): Promise<RawThread[]>;
  getThread(id: string): Promise<RawThread>;
}

/* ------------------------------------------------------------------------- */
/* Fixture client (used by `npm run dev:*` and tests)                        */
/* ------------------------------------------------------------------------- */

export class FixtureGmailClient implements GmailClient {
  constructor(private readonly fixturesDir: string) {}

  async searchThreads(_query: string, max: number): Promise<RawThread[]> {
    const dir = resolve(this.fixturesDir);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (e) {
      throw new Error(
        `FixtureGmailClient: cannot list fixtures at ${dir} — ${(e as Error).message}`,
      );
    }
    const jsons = entries.filter((f) => f.endsWith('.json'));
    const threads: RawThread[] = [];
    for (const f of jsons) {
      const raw = await readFile(join(dir, f), 'utf8');
      threads.push(JSON.parse(raw) as RawThread);
    }
    return dedupThreads(threads).slice(0, max);
  }

  async getThread(id: string): Promise<RawThread> {
    const all = await this.searchThreads('', 9999);
    const found = all.find((t) => t.id === id);
    if (!found) throw new Error(`FixtureGmailClient: thread ${id} not found`);
    return found;
  }
}

/* ------------------------------------------------------------------------- */
/* MCP client                                                                */
/* ------------------------------------------------------------------------- */

/**
 * The scheduled-task runner is responsible for installing an MCP transport
 * before importing the pipeline. We expose a simple registration hook so the
 * pipeline does not depend on a specific transport implementation.
 *
 * Expected shape (matches the Gmail MCP server in this account):
 *   transport.searchThreads({ query: string, maxResults: number }) → { threads: [...] }
 *   transport.getThread({ threadId: string }) → { id, subject, from, date, body, ... }
 *
 * In production this is typically wired with @anthropic-ai/claude-agent-sdk
 * by the scheduled-task entrypoint; the helper script in `scripts/` documents
 * how to plug it in.
 */
export interface McpGmailTransport {
  searchThreads(args: {
    query: string;
    maxResults: number;
  }): Promise<{ threads: Array<Record<string, unknown>> }>;

  getThread(args: { threadId: string }): Promise<Record<string, unknown>>;
}

let transport: McpGmailTransport | null = null;

export function setMcpGmailTransport(t: McpGmailTransport | null): void {
  transport = t;
}

export class McpGmailClient implements GmailClient {
  async searchThreads(query: string, max: number): Promise<RawThread[]> {
    if (!transport) throw new Error(NO_TRANSPORT_MESSAGE);
    const res = await transport.searchThreads({ query, maxResults: max });
    return (res.threads ?? []).map(coerceRawThread);
  }

  async getThread(id: string): Promise<RawThread> {
    if (!transport) throw new Error(NO_TRANSPORT_MESSAGE);
    const res = await transport.getThread({ threadId: id });
    return coerceRawThread(res);
  }
}

const NO_TRANSPORT_MESSAGE =
  'MCP Gmail transport not registered. Either run with `--fixtures` for ' +
  'offline mode, or call setMcpGmailTransport() before invoking the pipeline.';

/** Tolerant adapter: the live MCP returns slightly different shapes per call. */
function coerceRawThread(raw: Record<string, unknown>): RawThread {
  const id = String(raw.id ?? raw.threadId ?? raw.thread_id ?? '');
  const subject = String(raw.subject ?? raw.title ?? '');
  const from = String(raw.from ?? raw.sender ?? '');
  const date = String(raw.date ?? raw.internalDate ?? raw.receivedAt ?? '');
  const snippet = raw.snippet != null ? String(raw.snippet) : undefined;

  const bodyText = pickStr(raw, ['bodyText', 'body_text', 'plainText', 'plain_text']);
  const bodyHtml = pickStr(raw, ['bodyHtml', 'body_html', 'html', 'body']);

  return { id, subject, from, date, snippet, bodyText, bodyHtml };
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

/** Convenience: parse all raw threads through the standard pipeline. */
export async function collectThreads(
  client: GmailClient,
  query: string,
  max: number,
): Promise<ReturnType<typeof parseThread>[]> {
  const raw = await client.searchThreads(query, max);
  return raw.map(parseThread);
}
