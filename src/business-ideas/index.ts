/**
 * Business Ideas Weekly — entrypoint.
 * Cron : `0 9 * * 3` (mercredi 9h Europe/Paris)
 * Spec : ../../BRIEF.md §7
 */

import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseCliArgs } from '../shared/cli.js';
import { computeWeekWindow, toGmailDate } from '../shared/dates.js';
import { FixtureGmailClient, McpGmailClient, type GmailClient } from '../shared/gmail.js';
import { parseThread, dedupThreads } from '../shared/parse.js';
import {
  callJsonTool,
  callMarkdown,
  emptyUsage,
  addUsage,
  estimateCostEur,
} from '../shared/llm.js';
import { markdownToHtml, wrapEmailHtml } from '../shared/render.js';
import {
  deliver,
  appendRunLog,
  McpDraftCreator,
  type DraftCreator,
} from '../shared/deliver.js';
import type {
  ExtractedIdea,
  IdeaScoreBreakdown,
  ParsedThread,
  PipelineOptions,
  RunStats,
} from '../shared/types.js';

import { normalizeBreakdown, totalScore, heuristicBreakdown } from './score.js';

config();

const PIPELINE = 'business-ideas' as const;
const DEFAULT_OUTPUT_DIR = 'runs';
const DEFAULT_FIXTURES_DIR = 'tests/fixtures';
const MAX_THREADS = 80;

async function loadPrompt(name: string): Promise<string> {
  const path = resolve('src/business-ideas/prompts', name);
  return readFile(path, 'utf8');
}

const EXTRACT_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          idea: { type: 'string' },
          whyNow: { type: 'string' },
          market: { type: 'string' },
          evidenceQuote: { type: 'string' },
          maturity: { type: 'string', enum: ['weak_signal', 'emerging', 'established'] },
          attackAngle: { type: 'string' },
          estimatedEffort: { type: 'string', enum: ['weekend', 'month', 'quarter', 'year+'] },
          scoreBreakdown: {
            type: 'object',
            properties: {
              marketClarity: { type: 'integer', minimum: 0, maximum: 3 },
              whyNowStrength: { type: 'integer', minimum: 0, maximum: 3 },
              soloFeasibility: { type: 'integer', minimum: 0, maximum: 2 },
              differentiation: { type: 'integer', minimum: 0, maximum: 2 },
            },
            required: ['marketClarity', 'whyNowStrength', 'soloFeasibility', 'differentiation'],
          },
        },
        required: ['idea', 'whyNow', 'market', 'evidenceQuote', 'maturity',
                   'attackAngle', 'estimatedEffort', 'scoreBreakdown'],
      },
    },
  },
  required: ['ideas'],
} as const;

interface RawExtractedIdea {
  idea: string;
  whyNow: string;
  market: string;
  evidenceQuote: string;
  maturity: 'weak_signal' | 'emerging' | 'established';
  attackAngle: string;
  estimatedEffort: 'weekend' | 'month' | 'quarter' | 'year+';
  scoreBreakdown: Partial<IdeaScoreBreakdown>;
}

const BUSINESS_QUERY = `newer_than:7d -from:me -in:trash -in:spam`;

export async function runBusinessIdeas(opts: PipelineOptions): Promise<void> {
  const t0 = Date.now();
  const today = opts.today ?? new Date();
  const window = computeWeekWindow(today);
  const recipient = process.env.DIGEST_RECIPIENT ?? 'xvironneau@gmail.com';

  console.log(`[business-ideas] week window: ${window.startISO} → ${window.endISO}`);

  // ------------------------------ 1. Collect ------------------------------
  const client: GmailClient = opts.useFixtures
    ? new FixtureGmailClient(opts.fixturesDir ?? DEFAULT_FIXTURES_DIR)
    : new McpGmailClient();

  const query = `after:${toGmailDate(window.start)} ${BUSINESS_QUERY}`;
  const rawThreads = await client.searchThreads(query, opts.maxThreads ?? MAX_THREADS);

  // Filter: keep threads that look like newsletters (unsubscribe link or
  // CURATION/ label markers in the body). Pure transactional emails are
  // dropped before extraction to save tokens.
  const candidates = rawThreads.filter(looksLikeNewsletter);
  const parsed = dedupThreads(candidates.map(parseThread));

  console.log(`[business-ideas] collected ${rawThreads.length} threads, kept ${parsed.length} after newsletter filter`);

  // ------------------------------ 2. Extract ------------------------------
  const extractPrompt = await loadPrompt('extract-ideas.md');
  let usage = emptyUsage();
  const allIdeas: ExtractedIdea[] = [];

  for (const thread of parsed) {
    if (opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
      const stub = stubIdeaFromThread(thread);
      if (stub) allIdeas.push(stub);
      continue;
    }
    try {
      const res = await callJsonTool<{ ideas: RawExtractedIdea[] }>({
        systemPrompt: extractPrompt,
        userContent: buildExtractContext(thread),
        toolName: 'extract_ideas',
        toolDescription: 'Return the actionable business ideas extracted from one newsletter.',
        inputSchema: EXTRACT_TOOL_SCHEMA,
      });
      usage = addUsage(usage, res.usage);
      for (const raw of res.data.ideas) {
        allIdeas.push(materializeIdea(raw, thread));
      }
    } catch (err) {
      console.error(`[business-ideas] extraction failed for ${thread.subject}: ${(err as Error).message}`);
    }
  }

  console.log(`[business-ideas] extracted ${allIdeas.length} candidate ideas`);

  // ----------------------------- 3. Synthesize ----------------------------
  const synthPrompt = await loadPrompt('synthesize-ideas.md');
  const stats = computeStats(parsed.length, allIdeas, t0, usage);
  const synthInput = buildSynthContext(allIdeas, window, stats);

  let markdown: string;
  if (opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
    markdown = renderFallbackDigest(allIdeas, window, stats);
  } else {
    const res = await callMarkdown({
      systemPrompt: synthPrompt,
      userContent: synthInput,
    });
    usage = addUsage(usage, res.usage);
    markdown = res.data;
  }

  stats.inputTokens = usage.inputTokens;
  stats.outputTokens = usage.outputTokens;
  stats.cacheReadTokens = usage.cacheReadTokens;
  stats.cacheWriteTokens = usage.cacheWriteTokens;
  stats.costEur = estimateCostEur(usage);
  stats.latencyMs = Date.now() - t0;

  // ------------------------------ 4. Deliver ------------------------------
  const html = wrapEmailHtml(markdownToHtml(markdown), `💡 Business Ideas Weekly`);
  const subject = `💡 Business Ideas Weekly — Semaine du ${window.startFr} au ${window.endFr}`;
  const date = window.endISO;
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;

  const draftCreator: DraftCreator | undefined = opts.dryRun ? undefined : new McpDraftCreator();

  const result = await deliver(
    {
      pipeline: PIPELINE,
      date,
      weekStart: window.startISO,
      weekEnd: window.endISO,
      markdown,
      html,
      subject,
      stats,
    },
    {
      outputDir,
      pipeline: PIPELINE,
      date,
      recipient,
      dryRun: opts.dryRun,
      draftCreator,
    },
  );

  await appendRunLog(outputDir, {
    timestamp: new Date().toISOString(),
    pipeline: PIPELINE,
    date,
    stats,
    draftId: result.draftId,
  });

  console.log(`[business-ideas] done → ${result.digestPath}${result.draftId ? ` (draft ${result.draftId})` : ' (no draft, dry-run)'}`);
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

function looksLikeNewsletter(raw: { bodyHtml?: string; bodyText?: string; subject?: string }): boolean {
  const blob = `${raw.bodyHtml ?? ''}\n${raw.bodyText ?? ''}\n${raw.subject ?? ''}`.toLowerCase();
  if (!blob.trim()) return false;
  return (
    blob.includes('unsubscribe') ||
    blob.includes('se désinscrire') ||
    blob.includes('manage preferences') ||
    blob.includes('view in browser')
  );
}

function buildExtractContext(thread: ParsedThread): string {
  return [
    `# Newsletter`,
    `From: ${thread.from}`,
    `Date: ${thread.date}`,
    `Subject: ${thread.subject}`,
    ``,
    `## Body (texte)`,
    thread.bodyText.slice(0, 24_000),
    ``,
    `## Liens pré-extraits`,
    ...thread.links.slice(0, 40).map((l) => `- ${l}`),
  ].join('\n');
}

function materializeIdea(raw: RawExtractedIdea, thread: ParsedThread): ExtractedIdea {
  const breakdown = normalizeBreakdown(raw.scoreBreakdown ?? {});
  const finalScore = totalScore(breakdown);
  return {
    idea: raw.idea,
    whyNow: raw.whyNow,
    market: raw.market,
    evidenceQuote: raw.evidenceQuote,
    maturity: raw.maturity,
    attackAngle: raw.attackAngle,
    estimatedEffort: raw.estimatedEffort,
    scoreBreakdown: breakdown,
    finalScore,
    source: {
      newsletter: thread.fromName || thread.fromEmail,
      fromEmail: thread.fromEmail,
      url: thread.links[0],
      date: thread.date,
      subject: thread.subject,
    },
  };
}

function stubIdeaFromThread(thread: ParsedThread): ExtractedIdea | null {
  const text = thread.bodyText.slice(0, 200);
  if (!text.trim()) return null;
  const breakdown = heuristicBreakdown({
    idea: thread.subject,
    whyNow: 'fixture',
    market: 'fixture',
    evidenceQuote: text,
    attackAngle: 'fixture',
    estimatedEffort: 'month',
  });
  return {
    idea: thread.subject || '(sans titre)',
    whyNow: '[stub offline]',
    market: '[stub offline]',
    evidenceQuote: text,
    maturity: 'emerging',
    attackAngle: '[stub offline] ANTHROPIC_API_KEY absente',
    estimatedEffort: 'month',
    scoreBreakdown: breakdown,
    finalScore: totalScore(breakdown),
    source: {
      newsletter: thread.fromName || thread.fromEmail,
      fromEmail: thread.fromEmail,
      url: thread.links[0],
      date: thread.date,
      subject: thread.subject,
    },
  };
}

function buildSynthContext(
  ideas: ExtractedIdea[],
  window: ReturnType<typeof computeWeekWindow>,
  stats: RunStats,
): string {
  const sorted = [...ideas].sort((a, b) => b.finalScore - a.finalScore);
  const popular = popularThemes(ideas);
  const json = {
    window: {
      startFr: window.startFr,
      endFr: window.endFr,
      startISO: window.startISO,
      endISO: window.endISO,
    },
    ideas: sorted,
    popularThemes: popular,
    stats: {
      threadsScanned: stats.threadsScanned,
      itemsExtracted: stats.itemsExtracted,
      uniqueSources: stats.uniqueSources,
      averageScore: stats.averageScore,
      latencySec: Math.round(stats.latencyMs / 1000),
    },
  };
  return [
    `Voici toutes les données nécessaires pour générer le digest.`,
    `Suis EXACTEMENT le format défini dans le prompt système.`,
    ``,
    '```json',
    JSON.stringify(json, null, 2),
    '```',
  ].join('\n');
}

/** Rough cross-source theme detection from idea texts. */
function popularThemes(ideas: ExtractedIdea[]): string[] {
  const counts = new Map<string, Set<string>>();
  for (const idea of ideas) {
    const tokens = tokenize(`${idea.idea} ${idea.whyNow} ${idea.market}`);
    for (const t of tokens) {
      const set = counts.get(t) ?? new Set<string>();
      set.add(idea.source.fromEmail);
      counts.set(t, set);
    }
  }
  const out: string[] = [];
  for (const [token, sources] of counts) {
    if (sources.size >= 3) out.push(token);
  }
  return out;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'about',
  'les', 'des', 'une', 'pour', 'dans', 'avec', 'sur', 'sans', 'leur', 'leurs',
]);

function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-zàâçéèêëîïôùûüÿñ0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
    ),
  );
}

function computeStats(
  threadsScanned: number,
  ideas: ExtractedIdea[],
  t0: number,
  usage: ReturnType<typeof emptyUsage>,
): RunStats {
  const scores = ideas.map((i) => i.finalScore);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const top = scores.length ? Math.max(...scores) : 0;
  return {
    threadsScanned,
    itemsExtracted: ideas.length,
    uniqueSources: new Set(ideas.map((i) => i.source.fromEmail)).size,
    topScore: top,
    averageScore: Number(avg.toFixed(2)),
    latencyMs: Date.now() - t0,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

function renderFallbackDigest(
  ideas: ExtractedIdea[],
  window: ReturnType<typeof computeWeekWindow>,
  stats: RunStats,
): string {
  const sorted = [...ideas].sort((a, b) => b.finalScore - a.finalScore);
  const top = sorted.slice(0, 5);
  const dropped = sorted.slice(5);

  const lines: string[] = [];
  lines.push(`# 💡 Business Ideas Weekly — Semaine du ${window.startFr} au ${window.endFr}`);
  lines.push('');
  lines.push(`## TL;DR`);
  lines.push(`Stub offline (mode fixtures + pas d'ANTHROPIC_API_KEY). ${ideas.length} idées candidates extraites depuis ${stats.uniqueSources} sources. Sert uniquement à valider la pipeline.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  if (top.length > 0) {
    lines.push(`## 🎯 Top 5 idées actionnables`);
    lines.push('');
    top.forEach((i, idx) => {
      lines.push(`### ${idx + 1}. ${truncate(i.idea, 80)} — Score ${i.finalScore}/10`);
      lines.push(`**Quoi :** ${i.idea}`);
      lines.push(`**Pourquoi maintenant :** ${i.whyNow}`);
      lines.push(`**Marché :** ${i.market}`);
      lines.push(`**Angle solo :** ${i.attackAngle}`);
      lines.push(`**Effort estimé :** ${i.estimatedEffort}`);
      lines.push(`**Source :** ${i.source.newsletter} — ${i.source.date}${i.source.url ? ` — ${i.source.url}` : ''}`);
      lines.push(`> *"${i.evidenceQuote}"*`);
      lines.push('');
    });
    lines.push('---');
    lines.push('');
  } else {
    lines.push(`## Aucune idée actionnable détectée cette semaine.`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`## 🗑 Idées écartées (traçabilité)`);
  if (dropped.length === 0) {
    lines.push(`- _aucune_`);
  } else {
    for (const i of dropped) {
      lines.push(`- ${truncate(i.idea, 100)} — score ${i.finalScore}/10`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## 📊 Stats du run`);
  lines.push(`- Threads scannés : ${stats.threadsScanned}`);
  lines.push(`- Idées extraites : ${stats.itemsExtracted}`);
  lines.push(`- Sources uniques : ${stats.uniqueSources}`);
  lines.push(`- Score moyen : ${stats.averageScore}/10`);
  lines.push(`- Temps total : ${Math.round(stats.latencyMs / 1000)}s`);

  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/* ------------------------------------------------------------------------- */
/* CLI bootstrap                                                             */
/* ------------------------------------------------------------------------- */

const isDirectInvoke =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectInvoke) {
  runBusinessIdeas(parseCliArgs(process.argv)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
