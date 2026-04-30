/**
 * Business Ideas Weekly — scoring d'actionnabilité.
 * Source : BRIEF.md §7.3.
 *
 *   Clarté du marché cible       : 0-3
 *   Force du signal "why now"    : 0-3
 *   Faisabilité solo/duo         : 0-2
 *   Différenciation vs idées génériques : 0-2
 *
 *   Score final = somme, plafonné à 10.
 */

import type { IdeaScoreBreakdown } from '../shared/types.js';

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeBreakdown(input: Partial<IdeaScoreBreakdown>): IdeaScoreBreakdown {
  return {
    marketClarity: clamp(input.marketClarity ?? 0, 0, 3),
    whyNowStrength: clamp(input.whyNowStrength ?? 0, 0, 3),
    soloFeasibility: clamp(input.soloFeasibility ?? 0, 0, 2),
    differentiation: clamp(input.differentiation ?? 0, 0, 2),
  };
}

export function totalScore(b: IdeaScoreBreakdown): number {
  return Math.min(
    10,
    b.marketClarity + b.whyNowStrength + b.soloFeasibility + b.differentiation,
  );
}

/**
 * Lightweight server-side sanity scorer used when the LLM either fails or
 * returns an obviously inflated breakdown. Heuristic — not a substitute for
 * the LLM scoring, but keeps the pipeline robust.
 */
export function heuristicBreakdown(input: {
  idea: string;
  whyNow: string;
  market: string;
  evidenceQuote: string;
  attackAngle: string;
  estimatedEffort: 'weekend' | 'month' | 'quarter' | 'year+';
}): IdeaScoreBreakdown {
  const market = input.market?.length ?? 0;
  const why = input.whyNow?.length ?? 0;
  const angle = input.attackAngle?.length ?? 0;

  const marketClarity = market > 60 ? 3 : market > 25 ? 2 : market > 0 ? 1 : 0;
  const whyNowStrength = why > 60 ? 3 : why > 25 ? 2 : why > 0 ? 1 : 0;
  const soloFeasibility =
    input.estimatedEffort === 'weekend' || input.estimatedEffort === 'month' ? 2
      : input.estimatedEffort === 'quarter' ? 1
      : 0;
  const differentiation = angle > 50 ? 2 : angle > 0 ? 1 : 0;

  return { marketClarity, whyNowStrength, soloFeasibility, differentiation };
}
