/**
 * Combined Weekly Digest — Design A.
 *
 * Runs both pipelines (Curation + Business Ideas), merges the markdown into
 * a single email, and delivers ONE Gmail draft.
 *
 * Cron : `0 8 * * 1` (lundi 8h Europe/Paris).
 */

import { config } from 'dotenv';

import { parseCliArgs } from '../shared/cli.js';
import { computeWeekWindow } from '../shared/dates.js';
import { wrapEmailHtml, markdownToHtml } from '../shared/render.js';
import {
  deliver,
  appendRunLog,
  McpDraftCreator,
  type DraftCreator,
} from '../shared/deliver.js';
import { addUsage, emptyUsage, estimateCostEur } from '../shared/llm.js';
import type { DigestResult, PipelineOptions, RunStats } from '../shared/types.js';

import { produceCurationDigest } from '../curation/index.js';
import { produceBusinessIdeasDigest } from '../business-ideas/index.js';

config();

const PIPELINE = 'combined' as const;
const DEFAULT_OUTPUT_DIR = 'runs';

export async function runCombined(opts: PipelineOptions): Promise<void> {
  const t0 = Date.now();
  const today = opts.today ?? new Date();
  const window = computeWeekWindow(today);
  const recipient = process.env.DIGEST_RECIPIENT ?? 'xvironneau@gmail.com';
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;

  console.log(`[combined] running both pipelines for week ${window.startISO} → ${window.endISO}`);

  // Run both producers sequentially. They use overlapping Gmail queries but
  // each pipeline applies its own filter; running them in series also keeps
  // logs readable. Use Promise.all if you need to halve wall-clock latency.
  const curation = await produceCurationDigest(opts);
  const business = await produceBusinessIdeasDigest(opts);

  // -------------------- Merge into one digest -----------------------------
  const merged = mergeDigests(curation, business, window);

  // ------------------------------ Deliver ---------------------------------
  const draftCreator: DraftCreator | undefined = opts.dryRun ? undefined : new McpDraftCreator();

  const result = await deliver(merged, {
    outputDir,
    pipeline: PIPELINE,
    date: merged.date,
    recipient,
    dryRun: opts.dryRun,
    draftCreator,
  });

  await appendRunLog(outputDir, {
    timestamp: new Date().toISOString(),
    pipeline: PIPELINE,
    date: merged.date,
    stats: merged.stats,
    draftId: result.draftId,
  });

  console.log(
    `[combined] done in ${Math.round((Date.now() - t0) / 1000)}s → ` +
    `${result.digestPath}${result.draftId ? ` (draft ${result.draftId})` : ' (no draft, dry-run)'}`,
  );
}

/* ------------------------------------------------------------------------- */

function mergeDigests(
  curation: DigestResult,
  business: DigestResult,
  window: ReturnType<typeof computeWeekWindow>,
): DigestResult {
  const subject = `🧠💡 Weekly Digest — Semaine du ${window.startFr} au ${window.endFr}`;

  const intro = [
    `# 🧠💡 Weekly Digest`,
    `## Semaine du ${window.startFr} au ${window.endFr}`,
    ``,
    `> Deux digests, un seul mail :`,
    `> - **🧠 Curation** : insights et tendances de la semaine (veille).`,
    `> - **💡 Business Ideas** : top 5 d'idées actionnables (mode founder).`,
    ``,
    `---`,
    ``,
  ].join('\n');

  // Strip the H1 from each sub-digest so we don't have three top-level titles
  // in the merged email; the wrapper above is the only H1.
  const curationBody = stripLeadingH1(curation.markdown);
  const businessBody = stripLeadingH1(business.markdown);

  const combinedSection = [
    `# 🧠 Section 1 — Curation Weekly`,
    ``,
    curationBody.trim(),
    ``,
    `---`,
    ``,
    `# 💡 Section 2 — Business Ideas Weekly`,
    ``,
    businessBody.trim(),
    ``,
  ].join('\n');

  const markdown = intro + combinedSection;
  const html = wrapEmailHtml(markdownToHtml(markdown), subject);

  const stats = mergeStats(curation.stats, business.stats);

  return {
    pipeline: PIPELINE,
    date: window.endISO,
    weekStart: window.startISO,
    weekEnd: window.endISO,
    markdown,
    html,
    subject,
    stats,
  };
}

function stripLeadingH1(md: string): string {
  // Drop the first `# Title` block (one or two header lines + blank line).
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].startsWith('# ')) {
    i++;
    if (i < lines.length && lines[i].startsWith('## ')) i++;
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  return lines.slice(i).join('\n');
}

function mergeStats(a: RunStats, b: RunStats): RunStats {
  const llmUsage = addUsage(
    {
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      cacheReadTokens: a.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens,
    },
    {
      inputTokens: b.inputTokens,
      outputTokens: b.outputTokens,
      cacheReadTokens: b.cacheReadTokens,
      cacheWriteTokens: b.cacheWriteTokens,
    },
  );
  return {
    threadsScanned: a.threadsScanned + b.threadsScanned,
    itemsExtracted: a.itemsExtracted + b.itemsExtracted,
    uniqueSources: a.uniqueSources + b.uniqueSources,
    topScore: Math.max(a.topScore, b.topScore),
    averageScore: average([a.averageScore, b.averageScore]),
    latencyMs: a.latencyMs + b.latencyMs,
    inputTokens: llmUsage.inputTokens,
    outputTokens: llmUsage.outputTokens,
    cacheReadTokens: llmUsage.cacheReadTokens,
    cacheWriteTokens: llmUsage.cacheWriteTokens,
    costEur: estimateCostEur(llmUsage),
  };
}

function average(xs: number[]): number {
  if (xs.length === 0) return 0;
  const filtered = xs.filter((x) => x > 0);
  if (filtered.length === 0) return 0;
  const sum = filtered.reduce((a, b) => a + b, 0);
  return Number((sum / filtered.length).toFixed(2));
}

// Silence unused-import warnings when emptyUsage is only conditionally used.
void emptyUsage;

/* ------------------------------------------------------------------------- */
/* CLI bootstrap                                                             */
/* ------------------------------------------------------------------------- */

const isDirectInvoke =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectInvoke) {
  runCombined(parseCliArgs(process.argv)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
