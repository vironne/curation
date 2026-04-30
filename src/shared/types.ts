/**
 * Shared types for both pipelines.
 */

export type Pipeline = 'curation' | 'business-ideas' | 'combined';

/** Raw thread as returned by the Gmail MCP search. */
export interface RawThread {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
}

/** Thread after parsing (html→text, links extracted, dedup). */
export interface ParsedThread {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  fromName: string;
  date: string;
  bodyText: string;
  links: string[];
}

/** Common shape for everything the LLM extracts per-thread. */
export interface ExtractedItemBase {
  source: {
    newsletter: string;
    fromEmail: string;
    url?: string;
    date: string;
    subject: string;
  };
}

/** Curation pipeline insight — see SKILL.md. */
export interface ExtractedInsight extends ExtractedItemBase {
  title: string;
  thesis: string;
  keyPoints: string[];
  quote?: string;
  links: string[];
  themes: string[];
  baseScore: number;
  topicBonus: number;
  crossReferenceBonus: number;
  finalScore: number;
  category: CurationCategory;
}

export type CurationCategory =
  | 'ai-tech'
  | 'vision-future'
  | 'business-startups'
  | 'retail-cpg-commerce'
  | 'culture-society'
  | 'marketing-media';

/** Business Ideas pipeline idea — see BRIEF §7.2. */
export interface ExtractedIdea extends ExtractedItemBase {
  idea: string;
  whyNow: string;
  market: string;
  evidenceQuote: string;
  maturity: 'weak_signal' | 'emerging' | 'established';
  attackAngle: string;
  estimatedEffort: 'weekend' | 'month' | 'quarter' | 'year+';
  scoreBreakdown: IdeaScoreBreakdown;
  finalScore: number;
}

export interface IdeaScoreBreakdown {
  marketClarity: number;       // 0-3
  whyNowStrength: number;      // 0-3
  soloFeasibility: number;     // 0-2
  differentiation: number;     // 0-2
}

/** Result of a full pipeline run. */
export interface DigestResult {
  pipeline: Pipeline;
  date: string;          // YYYY-MM-DD
  weekStart: string;
  weekEnd: string;
  markdown: string;
  html: string;
  subject: string;
  stats: RunStats;
}

export interface RunStats {
  threadsScanned: number;
  itemsExtracted: number;
  uniqueSources: number;
  topScore: number;
  averageScore: number;
  latencyMs: number;
  costEur?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface RunLogEntry {
  timestamp: string;
  pipeline: Pipeline;
  date: string;
  stats: RunStats;
  draftId?: string;
  error?: string;
}

/** Options accepted by both pipelines via CLI args. */
export interface PipelineOptions {
  dryRun: boolean;
  useFixtures: boolean;
  fixturesDir?: string;
  outputDir?: string;
  today?: Date;
  maxThreads?: number;
}
