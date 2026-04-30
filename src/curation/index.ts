/**
 * Curation Weekly Digest — entrypoint.
 * Cron : `0 8 * * 1` (lundi 8h Europe/Paris)
 * Spec : ../../SKILL.md + ../../BRIEF.md §6
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
  hasLlmProvider,
} from '../shared/llm.js';
import { markdownToHtml, wrapEmailHtml } from '../shared/render.js';
import {
  deliver,
  appendRunLog,
  McpDraftCreator,
  type DraftCreator,
} from '../shared/deliver.js';
import type {
  DigestResult,
  ExtractedInsight,
  ParsedThread,
  PipelineOptions,
  RunStats,
  CurationCategory,
} from '../shared/types.js';

import { findSource, buildGmailQuery, tier1Sources, type CurationSource } from './sources.js';
import {
  computeBaseScore,
  computeTopicBonus,
  computeFinalScore,
  findCrossReferencedThemes,
  hasPopularTheme,
} from './score.js';

config();

const PIPELINE = 'curation' as const;
const DEFAULT_OUTPUT_DIR = 'runs';
const DEFAULT_FIXTURES_DIR = 'tests/fixtures';
const MAX_THREADS = 80;

async function loadPrompt(name: string): Promise<string> {
  const path = resolve('src/curation/prompts', name);
  return readFile(path, 'utf8');
}

const EXTRACT_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          thesis: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          quote: { type: 'string' },
          links: { type: 'array', items: { type: 'string' } },
          themes: { type: 'array', items: { type: 'string' } },
          category: {
            type: 'string',
            enum: ['ai-tech', 'vision-future', 'business-startups',
                   'retail-cpg-commerce', 'culture-society', 'marketing-media'],
          },
        },
        required: ['title', 'thesis', 'keyPoints', 'links', 'themes', 'category'],
      },
    },
  },
  required: ['insights'],
} as const;

interface RawExtractedInsight {
  title: string;
  thesis: string;
  keyPoints: string[];
  quote?: string;
  links: string[];
  themes: string[];
  category: CurationCategory;
}

/**
 * Run the Curation pipeline up to (but not including) email delivery.
 * Returns the digest payload — used directly by the combined pipeline
 * which packages two digests into one email.
 */
export async function produceCurationDigest(opts: PipelineOptions): Promise<DigestResult> {
  const t0 = Date.now();
  const today = opts.today ?? new Date();
  const window = computeWeekWindow(today);

  console.log(`[curation] week window: ${window.startISO} → ${window.endISO}`);

  // ------------------------------ 1. Collect ------------------------------
  const client: GmailClient = opts.useFixtures
    ? new FixtureGmailClient(opts.fixturesDir ?? DEFAULT_FIXTURES_DIR)
    : new McpGmailClient();

  const query = buildGmailQuery(toGmailDate(window.start));
  const rawThreads = await client.searchThreads(query, opts.maxThreads ?? MAX_THREADS);
  const parsed = dedupThreads(rawThreads.map(parseThread));

  console.log(`[curation] collected ${parsed.length} threads`);

  // Tag each thread with its CurationSource (if any). Threads that don't match
  // a known source still go through extraction, treated as Tier-3 fallback.
  const tagged = parsed.map((p) => ({
    thread: p,
    source: findSource({
      fromEmail: p.fromEmail,
      fromName: p.fromName,
      subject: p.subject,
    }),
  }));

  // ------------------------------ 2. Extract ------------------------------
  const extractPrompt = await loadPrompt('extract-insights.md');
  let usage = emptyUsage();
  const allInsights: ExtractedInsight[] = [];

  for (const { thread, source } of tagged) {
    if (!hasLlmProvider()) {
      // Offline smoke run: synthesize a stub insight from the subject so the
      // rest of the pipeline still flows. The real run requires a key.
      allInsights.push(stubInsightFromThread(thread, source));
      continue;
    }
    try {
      const res = await callJsonTool<{ insights: RawExtractedInsight[] }>({
        systemPrompt: extractPrompt,
        userContent: buildExtractContext(thread, source),
        toolName: 'extract_insights',
        toolDescription: 'Return the structured insights extracted from one newsletter.',
        inputSchema: EXTRACT_TOOL_SCHEMA,
      });
      usage = addUsage(usage, res.usage);
      for (const raw of res.data.insights) {
        allInsights.push(materializeInsight(raw, thread, source));
      }
    } catch (err) {
      console.error(`[curation] extraction failed for ${thread.subject}: ${(err as Error).message}`);
    }
  }

  // ----------------------- 2b. Cross-reference scoring --------------------
  const popular = findCrossReferencedThemes(
    allInsights.map((i) => ({ themes: i.themes, fromEmail: i.source.fromEmail })),
  );
  for (const insight of allInsights) {
    insight.crossReferenceBonus = hasPopularTheme(insight.themes, popular) ? 1 : 0;
    insight.finalScore = computeFinalScore({
      baseScore: insight.baseScore,
      topicBonus: insight.topicBonus,
      crossReferenceBonus: insight.crossReferenceBonus,
    });
  }

  console.log(`[curation] extracted ${allInsights.length} insights, ${popular.size} cross-themes`);

  // ----------------------------- 3. Synthesize ----------------------------
  const synthPrompt = await loadPrompt('synthesize-curation.md');
  const stats = computeStats(parsed.length, allInsights, t0, usage);
  const synthInput = buildSynthContext(allInsights, popular, window, stats);

  let markdown: string;
  if (!hasLlmProvider()) {
    markdown = renderFallbackDigest(allInsights, popular, window, stats);
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

  const html = wrapEmailHtml(markdownToHtml(markdown), `🧠 Curation Weekly — ${window.startFr}`);
  const subject = `🧠 Curation Weekly — Semaine du ${window.startFr} au ${window.endFr}`;

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

/** Full Curation run: produce the digest and deliver it (file + Gmail draft). */
export async function runCuration(opts: PipelineOptions): Promise<void> {
  const recipient = process.env.DIGEST_RECIPIENT ?? 'xvironneau@gmail.com';
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const digest = await produceCurationDigest(opts);
  const draftCreator: DraftCreator | undefined = opts.dryRun ? undefined : new McpDraftCreator();

  const result = await deliver(digest, {
    outputDir,
    pipeline: PIPELINE,
    date: digest.date,
    recipient,
    dryRun: opts.dryRun,
    draftCreator,
  });

  await appendRunLog(outputDir, {
    timestamp: new Date().toISOString(),
    pipeline: PIPELINE,
    date: digest.date,
    stats: digest.stats,
    draftId: result.draftId,
  });

  console.log(`[curation] done → ${result.digestPath}${result.draftId ? ` (draft ${result.draftId})` : ' (no draft, dry-run)'}`);
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

function buildExtractContext(thread: ParsedThread, source: CurationSource | undefined): string {
  const tier = source?.tier ?? 3;
  return [
    `# Newsletter`,
    `Source: ${source?.name ?? thread.fromName ?? thread.fromEmail}`,
    `Tier (info): ${tier}`,
    `From: ${thread.from}`,
    `Date: ${thread.date}`,
    `Subject: ${thread.subject}`,
    ``,
    `## Body`,
    thread.bodyText.slice(0, 24_000),
    ``,
    `## Pre-extracted links`,
    ...thread.links.slice(0, 40).map((l) => `- ${l}`),
  ].join('\n');
}

function materializeInsight(
  raw: RawExtractedInsight,
  thread: ParsedThread,
  source: CurationSource | undefined,
): ExtractedInsight {
  const baseScore = computeBaseScore(source?.tier);
  const topicBonus = computeTopicBonus({
    themes: raw.themes,
    title: raw.title,
    thesis: raw.thesis,
  });
  return {
    title: raw.title,
    thesis: raw.thesis,
    keyPoints: raw.keyPoints,
    quote: raw.quote,
    links: dedupKeepOrder([...raw.links, ...thread.links]),
    themes: raw.themes,
    category: raw.category,
    source: {
      newsletter: source?.name ?? thread.fromName ?? thread.fromEmail,
      fromEmail: thread.fromEmail,
      url: raw.links[0],
      date: thread.date,
      subject: thread.subject,
    },
    baseScore,
    topicBonus,
    crossReferenceBonus: 0, // filled in after cross-ref pass
    finalScore: computeFinalScore({ baseScore, topicBonus, crossReferenceBonus: 0 }),
  };
}

function dedupKeepOrder<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of arr) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function stubInsightFromThread(
  thread: ParsedThread,
  source: CurationSource | undefined,
): ExtractedInsight {
  const baseScore = computeBaseScore(source?.tier);
  return {
    title: thread.subject || '(sans titre)',
    thesis: `[stub offline] Synthèse non générée — ANTHROPIC_API_KEY absente.`,
    keyPoints: [thread.bodyText.slice(0, 200) || '(corps vide)'],
    links: thread.links.slice(0, 5),
    themes: ['stub'],
    category: source?.category ?? 'culture-society',
    source: {
      newsletter: source?.name ?? thread.fromName ?? thread.fromEmail,
      fromEmail: thread.fromEmail,
      url: thread.links[0],
      date: thread.date,
      subject: thread.subject,
    },
    baseScore,
    topicBonus: 0,
    crossReferenceBonus: 0,
    finalScore: baseScore,
  };
}

function buildSynthContext(
  insights: ExtractedInsight[],
  popular: Set<string>,
  window: ReturnType<typeof computeWeekWindow>,
  stats: RunStats,
): string {
  const sorted = [...insights].sort((a, b) => b.finalScore - a.finalScore);
  const silentSources = silenceList(insights);

  const json = {
    window: {
      startFr: window.startFr,
      endFr: window.endFr,
      startISO: window.startISO,
      endISO: window.endISO,
    },
    insights: sorted,
    popularThemes: Array.from(popular),
    silentSources,
    stats: {
      threadsScanned: stats.threadsScanned,
      itemsExtracted: stats.itemsExtracted,
      uniqueSources: stats.uniqueSources,
      averageScore: stats.averageScore,
      topScore: stats.topScore,
    },
  };

  return [
    `Voici toutes les données nécessaires pour générer le digest.`,
    `Suis EXACTEMENT le format de sortie défini dans le prompt système.`,
    ``,
    '```json',
    JSON.stringify(json, null, 2),
    '```',
  ].join('\n');
}

function silenceList(insights: ExtractedInsight[]): string[] {
  const heard = new Set(insights.map((i) => i.source.fromEmail.toLowerCase()));
  return tier1Sources()
    .filter((s) => s.email && !heard.has(s.email.toLowerCase()))
    .map((s) => s.name);
}

function computeStats(
  threadsScanned: number,
  insights: ExtractedInsight[],
  t0: number,
  usage: ReturnType<typeof emptyUsage>,
): RunStats {
  const scores = insights.map((i) => i.finalScore);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const top = scores.length ? Math.max(...scores) : 0;
  const uniqueSources = new Set(insights.map((i) => i.source.fromEmail)).size;
  return {
    threadsScanned,
    itemsExtracted: insights.length,
    uniqueSources,
    topScore: top,
    averageScore: Number(avg.toFixed(2)),
    latencyMs: Date.now() - t0,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

/** Deterministic fallback used in --fixtures runs without an API key. */
function renderFallbackDigest(
  insights: ExtractedInsight[],
  popular: Set<string>,
  window: ReturnType<typeof computeWeekWindow>,
  stats: RunStats,
): string {
  const sorted = [...insights].sort((a, b) => b.finalScore - a.finalScore);
  const top = sorted.slice(0, 5);
  const silent = silenceList(insights);

  const lines: string[] = [];
  lines.push(`# 🧠 Curation Weekly`);
  lines.push(`## Semaine du ${window.startFr} au ${window.endFr}`);
  lines.push('');
  lines.push(`> Digest stub — généré sans appel LLM (mode fixtures + pas d'\`ANTHROPIC_API_KEY\`). Sert uniquement à valider la pipeline.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## 🔥 Top 5 de la semaine`);
  lines.push('');
  top.forEach((i, idx) => {
    lines.push(`### ${idx + 1}. ${i.source.newsletter} — ${i.title} — Score: ${i.finalScore}/10`);
    lines.push(`**Thème** : ${i.category}`);
    lines.push(`**Angle** : ${i.thesis}`);
    lines.push('');
    for (const kp of i.keyPoints) lines.push(`- ${kp}`);
    if (i.quote) {
      lines.push('');
      lines.push(`> "${i.quote}"`);
    }
    if (i.links.length) {
      lines.push('');
      lines.push(`**🔗 Liens** :`);
      for (const l of i.links.slice(0, 5)) lines.push(`- [${l}](${l})`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push(`## 📡 Tendances de la semaine`);
  lines.push('');
  if (popular.size === 0) {
    lines.push("_Aucune tendance n'a été mentionnée par 3 sources ou plus cette semaine._");
  } else {
    for (const theme of popular) {
      lines.push(`- **${theme}**`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## 📊 Stats de la semaine`);
  lines.push(`- Newsletters analysées : ${stats.itemsExtracted}`);
  lines.push(`- Threads scannés : ${stats.threadsScanned}`);
  lines.push(`- Score moyen : ${stats.averageScore}/10`);
  lines.push(`- Sources silencieuses : ${silent.length ? silent.join(', ') : 'aucune'}`);

  return lines.join('\n');
}

/* ------------------------------------------------------------------------- */
/* CLI bootstrap                                                             */
/* ------------------------------------------------------------------------- */

const isDirectInvoke =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectInvoke) {
  runCuration(parseCliArgs(process.argv)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
