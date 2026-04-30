import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { DigestResult, Pipeline, RunLogEntry } from './types.js';

export interface DraftCreator {
  /** Returns the draftId of the created/updated Gmail draft. */
  createOrUpdateDraft(args: {
    to: string;
    subject: string;
    htmlBody: string;
    pipeline: Pipeline;
    date: string;
  }): Promise<string>;
}

/**
 * The MCP `create_draft` tool is registered by the scheduled-task runner.
 * In offline / dry-run modes the pipeline simply skips draft creation.
 */
export interface McpDraftTransport {
  createDraft(args: {
    to: string;
    subject: string;
    body: string;
    contentType: 'text/html' | 'text/plain';
  }): Promise<{ draftId: string }>;
}

let draftTransport: McpDraftTransport | null = null;

export function setMcpDraftTransport(t: McpDraftTransport | null): void {
  draftTransport = t;
}

export class McpDraftCreator implements DraftCreator {
  async createOrUpdateDraft(args: {
    to: string;
    subject: string;
    htmlBody: string;
    pipeline: Pipeline;
    date: string;
  }): Promise<string> {
    if (!draftTransport) {
      throw new Error(
        'MCP draft transport not registered — call setMcpDraftTransport() ' +
          'or run with --dry-run.',
      );
    }
    const res = await draftTransport.createDraft({
      to: args.to,
      subject: args.subject,
      body: args.htmlBody,
      contentType: 'text/html',
    });
    return res.draftId;
  }
}

/* ------------------------------------------------------------------------- */
/* File output                                                               */
/* ------------------------------------------------------------------------- */

export interface DeliverOptions {
  outputDir: string;
  pipeline: Pipeline;
  date: string;
  recipient: string;
  dryRun: boolean;
  draftCreator?: DraftCreator;
}

export interface DeliverResult {
  digestPath: string;
  draftId?: string;
}

export async function deliver(
  digest: DigestResult,
  opts: DeliverOptions,
): Promise<DeliverResult> {
  const dir = resolve(opts.outputDir, opts.pipeline);
  await mkdir(dir, { recursive: true });

  const digestPath = join(dir, `${opts.date}.md`);
  await writeFile(digestPath, digest.markdown, 'utf8');

  let draftId: string | undefined;
  if (!opts.dryRun && opts.draftCreator) {
    draftId = await opts.draftCreator.createOrUpdateDraft({
      to: opts.recipient,
      subject: digest.subject,
      htmlBody: digest.html,
      pipeline: opts.pipeline,
      date: opts.date,
    });
  }

  return { digestPath, draftId };
}

export async function appendRunLog(
  outputDir: string,
  entry: RunLogEntry,
): Promise<void> {
  const path = resolve(outputDir, entry.pipeline, 'log.jsonl');
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
}
