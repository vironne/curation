/**
 * Curation Weekly scoring — see SKILL.md §Système de Scoring.
 *
 *   Score = base_score + sujet_bonus + cross_reference_bonus
 *   Tier 1 source : 8     |  Tier 2 source : 6     |  Tier 3 source : 4
 *   AI/Vision/Future/etc : +2  |  CPG/Innovation/Tendances/Social : +1
 *   Sujet vu dans 3+ sources cette semaine : +1
 *   Score max : 10
 */

import type { Tier } from './sources.js';

export const TIER_BASE_SCORE: Record<Tier, number> = { 1: 8, 2: 6, 3: 4 };

/** Tier-2 sujets prioritaires (+2). Word-boundary regex matches. */
const TOPIC_BONUS_2: RegExp[] = [
  /\b(ai|a\.i\.|llm|gpt|agentic|chatbot)\b/i,
  /\bclaude\b/i,
  /\b(gemini|machine learning)\b/i,
  /\bintelligence artificielle\b/i,
  /\b(futurism|futurisme|futur(e|ism)?|vision|speculative|horizon)\b/i,
  /\b(weak[ -]signal|signal faible)\b/i,
  /\b(ai (trends|adoption|use case|applications?))\b/i,
  /\bagentic workflow\b/i,
  /\b(ai ethics|éthique ia|philosophie ia|humanity|augmented human|humanité augmentée)\b/i,
  /\b(human[- ]ai)\b/i,
  /\b(behavior|comportement)\b/i,
];

/** Tier-3 sujets secondaires (+1). */
const TOPIC_BONUS_1: RegExp[] = [
  /\b(cpg|dtc|d2c|consumer packaged goods)\b/i,
  /\b(innovation|disruption|business model)\b/i,
  /\b(consumer trends|consumer behavior|tendances consommateur)\b/i,
  /\b(society|culture|sociology|social trends|societal)\b/i,
  /\b(retail|ecommerce|e-commerce|omnichannel|omnicanal)\b/i,
  /\b(marketing|branding|brand strategy)\b/i,
  /\b(media|advertising|adtech)\b/i,
];

export interface TopicBonusInput {
  themes: string[];
  title: string;
  thesis?: string;
}

export function computeTopicBonus(input: TopicBonusInput): number {
  const haystack = [
    ...input.themes,
    input.title,
    input.thesis ?? '',
  ].join(' ');

  if (TOPIC_BONUS_2.some((re) => re.test(haystack))) return 2;
  if (TOPIC_BONUS_1.some((re) => re.test(haystack))) return 1;
  return 0;
}

export function computeBaseScore(tier: Tier | undefined): number {
  if (!tier) return TIER_BASE_SCORE[3];
  return TIER_BASE_SCORE[tier];
}

export function computeFinalScore(args: {
  baseScore: number;
  topicBonus: number;
  crossReferenceBonus: number;
}): number {
  const sum = args.baseScore + args.topicBonus + args.crossReferenceBonus;
  return Math.max(1, Math.min(10, sum));
}

/**
 * Cross-reference bonus: a topic mentioned by ≥3 sources this week earns +1.
 * The caller passes ALL extracted insights and we tag each one whose theme
 * is "popular" this week.
 *
 * Tagging is conservative: we look at exact theme tokens (after lowercasing).
 * Returns a Set of normalized themes that crossed the threshold.
 */
export function findCrossReferencedThemes(
  itemsWithThemes: Array<{ themes: string[]; fromEmail: string }>,
): Set<string> {
  const counts = new Map<string, Set<string>>();
  for (const item of itemsWithThemes) {
    for (const theme of item.themes ?? []) {
      const norm = theme.trim().toLowerCase();
      if (!norm) continue;
      const set = counts.get(norm) ?? new Set<string>();
      set.add(item.fromEmail);
      counts.set(norm, set);
    }
  }
  const popular = new Set<string>();
  for (const [theme, sources] of counts) {
    if (sources.size >= 3) popular.add(theme);
  }
  return popular;
}

export function hasPopularTheme(
  themes: string[],
  popular: Set<string>,
): boolean {
  return themes.some((t) => popular.has(t.trim().toLowerCase()));
}
