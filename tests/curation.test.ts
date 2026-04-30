import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeBaseScore,
  computeFinalScore,
  computeTopicBonus,
  findCrossReferencedThemes,
  hasPopularTheme,
} from '../src/curation/score.js';
import { findSource, buildGmailQuery, tier1Sources } from '../src/curation/sources.js';
import { runCuration } from '../src/curation/index.js';

describe('curation/sources', () => {
  it('matches Tier 1 sources by email', () => {
    const src = findSource({
      fromEmail: 'competia@substack.com',
      fromName: 'Estelle Métayer',
      subject: 'Competia #176',
    });
    expect(src).toBeDefined();
    expect(src?.tier).toBe(1);
    expect(src?.name).toContain('Competia');
  });

  it('matches keyword-only sources (Tech Brew)', () => {
    const src = findSource({
      fromEmail: 'noreply@morningbrew.com',
      fromName: 'Tech Brew',
      subject: 'Daily roundup',
    });
    expect(src).toBeDefined();
    expect(src?.name).toBe('Tech Brew');
  });

  it('returns undefined for unknown sources', () => {
    expect(findSource({
      fromEmail: 'random@example.com',
      fromName: '',
      subject: '',
    })).toBeUndefined();
  });

  it('builds a gmail query with after: and from: clauses', () => {
    const q = buildGmailQuery('2026/04/20');
    expect(q).toContain('after:2026/04/20');
    expect(q).toContain('from:competia@substack.com');
    expect(q).toContain('-in:trash');
  });

  it('exposes 15 Tier-1 sources', () => {
    expect(tier1Sources()).toHaveLength(15);
  });
});

describe('curation/score', () => {
  it('uses Tier 1 = 8, Tier 2 = 6, Tier 3 = 4', () => {
    expect(computeBaseScore(1)).toBe(8);
    expect(computeBaseScore(2)).toBe(6);
    expect(computeBaseScore(3)).toBe(4);
    expect(computeBaseScore(undefined)).toBe(4);
  });

  it('grants +2 on AI/futurism topics', () => {
    expect(computeTopicBonus({ themes: ['ai', 'agentic'], title: 'Agent SDK' })).toBe(2);
    expect(computeTopicBonus({ themes: ['weak-signals'], title: 'Future of work' })).toBe(2);
  });

  it('grants +1 on retail/cpg/innovation/social topics', () => {
    expect(computeTopicBonus({ themes: ['retail'], title: 'DTC' })).toBe(1);
    expect(computeTopicBonus({ themes: ['society'], title: 'Sociology of work' })).toBe(1);
  });

  it('returns 0 when nothing matches', () => {
    expect(computeTopicBonus({ themes: ['random'], title: 'Hello' })).toBe(0);
  });

  it('caps final score at 10', () => {
    expect(computeFinalScore({ baseScore: 8, topicBonus: 2, crossReferenceBonus: 1 })).toBe(10);
    expect(computeFinalScore({ baseScore: 4, topicBonus: 0, crossReferenceBonus: 0 })).toBe(4);
  });

  it('finds popular themes (≥ 3 sources)', () => {
    const items = [
      { themes: ['ai'], fromEmail: 'a@x.com' },
      { themes: ['ai'], fromEmail: 'b@x.com' },
      { themes: ['ai'], fromEmail: 'c@x.com' },
      { themes: ['retail'], fromEmail: 'd@x.com' },
    ];
    const popular = findCrossReferencedThemes(items);
    expect(popular.has('ai')).toBe(true);
    expect(popular.has('retail')).toBe(false);
  });

  it('does not double-count the same source on the same theme', () => {
    const items = [
      { themes: ['ai'], fromEmail: 'a@x.com' },
      { themes: ['ai'], fromEmail: 'a@x.com' },
      { themes: ['ai'], fromEmail: 'a@x.com' },
    ];
    expect(findCrossReferencedThemes(items).size).toBe(0);
  });

  it('hasPopularTheme is case-insensitive', () => {
    const popular = new Set(['ai']);
    expect(hasPopularTheme(['AI'], popular)).toBe(true);
    expect(hasPopularTheme(['retail'], popular)).toBe(false);
  });
});

describe('runCuration (offline + fixtures)', () => {
  it('produces a digest file end-to-end without an API key', async () => {
    const out = await mkdtemp(join(tmpdir(), 'curation-test-'));
    try {
      const previousKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await runCuration({
        dryRun: true,
        useFixtures: true,
        fixturesDir: 'tests/fixtures',
        outputDir: out,
        today: new Date('2026-05-04T08:00:00'),
      });

      if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;

      const md = await readFile(join(out, 'curation', '2026-05-03.md'), 'utf8');
      expect(md).toContain('🧠 Curation Weekly');
      expect(md).toContain('Top 5 de la semaine');
      expect(md).toContain('Stats de la semaine');

      const log = await readFile(join(out, 'curation', 'log.jsonl'), 'utf8');
      const entry = JSON.parse(log.trim().split('\n').pop()!);
      expect(entry.pipeline).toBe('curation');
      expect(entry.stats.threadsScanned).toBeGreaterThan(0);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
