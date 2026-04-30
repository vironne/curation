import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  clamp,
  normalizeBreakdown,
  totalScore,
  heuristicBreakdown,
} from '../src/business-ideas/score.js';
import { runBusinessIdeas } from '../src/business-ideas/index.js';

describe('business-ideas/score', () => {
  it('clamps values to [min,max]', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2.4, 0, 3)).toBe(2);
    expect(clamp(2.6, 0, 3)).toBe(3);
  });

  it('normalizeBreakdown enforces individual axis caps', () => {
    const b = normalizeBreakdown({
      marketClarity: 99,
      whyNowStrength: -2,
      soloFeasibility: 5,
      differentiation: 1.7,
    });
    expect(b.marketClarity).toBe(3);
    expect(b.whyNowStrength).toBe(0);
    expect(b.soloFeasibility).toBe(2);
    expect(b.differentiation).toBe(2);
  });

  it('totalScore caps at 10', () => {
    expect(totalScore({ marketClarity: 3, whyNowStrength: 3, soloFeasibility: 2, differentiation: 2 })).toBe(10);
    expect(totalScore({ marketClarity: 0, whyNowStrength: 0, soloFeasibility: 0, differentiation: 0 })).toBe(0);
  });

  it('heuristicBreakdown produces sensible defaults', () => {
    const b = heuristicBreakdown({
      idea: 'tooling',
      whyNow: 'a' .repeat(80),
      market: 'a' .repeat(80),
      evidenceQuote: 'q',
      attackAngle: 'a' .repeat(60),
      estimatedEffort: 'weekend',
    });
    expect(b.marketClarity).toBe(3);
    expect(b.whyNowStrength).toBe(3);
    expect(b.soloFeasibility).toBe(2);
    expect(b.differentiation).toBe(2);
  });

  it('heuristicBreakdown penalizes year+ effort', () => {
    const b = heuristicBreakdown({
      idea: 'x', whyNow: 'x', market: 'x', evidenceQuote: 'x',
      attackAngle: 'x', estimatedEffort: 'year+',
    });
    expect(b.soloFeasibility).toBe(0);
  });
});

describe('runBusinessIdeas (offline + fixtures)', () => {
  it('produces a digest end-to-end and filters non-newsletter threads', async () => {
    const out = await mkdtemp(join(tmpdir(), 'biz-test-'));
    try {
      const previousKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await runBusinessIdeas({
        dryRun: true,
        useFixtures: true,
        fixturesDir: 'tests/fixtures',
        outputDir: out,
        today: new Date('2026-05-06T09:00:00'),
      });

      if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;

      const md = await readFile(join(out, 'business-ideas', '2026-05-03.md'), 'utf8');
      expect(md).toContain('💡 Business Ideas Weekly');
      expect(md).toContain('TL;DR');
      expect(md).toContain('Stats du run');
      expect(md).toContain('Idées écartées');

      const log = await readFile(join(out, 'business-ideas', 'log.jsonl'), 'utf8');
      const entry = JSON.parse(log.trim().split('\n').pop()!);
      expect(entry.pipeline).toBe('business-ideas');
      // The non-newsletter (Stripe invoice) fixture must be filtered out.
      expect(entry.stats.threadsScanned).toBeLessThan(5);
      expect(entry.stats.threadsScanned).toBeGreaterThan(0);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it('top 5 is strict (≤ 5)', async () => {
    const out = await mkdtemp(join(tmpdir(), 'biz-test2-'));
    try {
      const previousKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await runBusinessIdeas({
        dryRun: true,
        useFixtures: true,
        fixturesDir: 'tests/fixtures',
        outputDir: out,
        today: new Date('2026-05-06T09:00:00'),
      });

      if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;

      const md = await readFile(join(out, 'business-ideas', '2026-05-03.md'), 'utf8');
      // Count "### N." headings inside the Top 5 section.
      const top = md.split('🎯 Top 5')[1]?.split('---')[0] ?? '';
      const matches = top.match(/^### \d+\./gm) ?? [];
      expect(matches.length).toBeLessThanOrEqual(5);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
