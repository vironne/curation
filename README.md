# business-digest

Two complementary weekly digests, one codebase :

| Pipeline | Cron | Subject | Source spec |
|----------|------|---------|-------------|
| **Curation Weekly** | `0 8 * * 1` (Monday 8am) | `🧠 Curation Weekly — Semaine du …` | [`SKILL.md`](./SKILL.md) + [`BRIEF.md` §6](./BRIEF.md) |
| **Business Ideas Weekly** | `0 9 * * 3` (Wednesday 9am) | `💡 Business Ideas Weekly — Semaine du …` | [`BRIEF.md` §7](./BRIEF.md) |

Both share the same 4-phase pipeline (`collect → extract → synthesize → deliver`) under [`src/shared/`](./src/shared). Filters, prompts and output formats diverge.

## Quickstart

```bash
# 1. Install
npm install

# 2. Set your env
cp .env.example .env
# edit .env, set ANTHROPIC_API_KEY

# 3. Smoke-test offline (uses tests/fixtures/, no API key needed)
npm run dev:curation
npm run dev:business-ideas

# 4. Type-check + tests
npm run typecheck
npm test

# 5. Real run (requires ANTHROPIC_API_KEY + MCP transport — see below)
npm run curation
npm run business-ideas
```

Outputs land in `runs/<pipeline>/YYYY-MM-DD.md` plus a JSONL run log next to it.

## Architecture

```
┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────┐
│ 1. Collect │ → │ 2. Extract  │ → │ 3. Synthesize│ → │ 4. Deliver │
│  Gmail MCP │   │  LLM + JSON │   │   LLM + MD   │   │ file+draft │
└────────────┘   └─────────────┘   └──────────────┘   └────────────┘
```

| Module | Role |
|--------|------|
| `shared/gmail.ts` | `GmailClient` interface — `FixtureGmailClient` (offline) and `McpGmailClient` (live, requires a registered MCP transport). |
| `shared/parse.ts` | HTML→text, link extraction, dedup. |
| `shared/llm.ts` | Anthropic SDK wrapper, prompt caching, JSON-tool extraction + markdown synthesis. |
| `shared/render.ts` | Lightweight markdown→HTML for email bodies. |
| `shared/deliver.ts` | Write digest file, create Gmail draft, append run log. |
| `shared/dates.ts` | Compute the previous full ISO week (Mon→Sun). |
| `curation/sources.ts` | Tier 1/2/3 newsletter mapping (matches SKILL.md). |
| `curation/score.ts` | `base + topic_bonus + cross_ref_bonus`, capped at 10. |
| `business-ideas/score.ts` | 4-axis actionability score (market 0-3 + why-now 0-3 + solo 0-2 + differentiation 0-2). |

## Operating modes

### Dry-run / fixtures (default for `dev:*`)
- Reads JSON threads from `tests/fixtures/*.json` instead of Gmail.
- If `ANTHROPIC_API_KEY` is unset, the pipeline emits a deterministic fallback digest (no LLM calls). This is what `npm run dev:*` and the test suite exercise.
- Writes `runs/<pipeline>/YYYY-MM-DD.md` and `log.jsonl`. Does **not** create a Gmail draft.

### Live run (`npm run curation` / `npm run business-ideas`)
- Requires `ANTHROPIC_API_KEY`.
- Requires an MCP transport registered before invocation:

  ```ts
  import { setMcpGmailTransport } from './src/shared/gmail.js';
  import { setMcpDraftTransport } from './src/shared/deliver.js';

  setMcpGmailTransport({
    searchThreads: ({ query, maxResults }) => /* call mcp__62ee4d58-...__search_threads */,
    getThread: ({ threadId }) => /* call mcp__62ee4d58-...__get_thread */,
  });
  setMcpDraftTransport({
    createDraft: ({ to, subject, body, contentType }) => /* call mcp__62ee4d58-...__create_draft */,
  });
  ```

  The scheduled-task runner is responsible for this glue — see "Scheduled tasks" below.

## Scheduled tasks (Claude Code)

Two tasks must exist on the user's account:

| Name | Cron | Prompt |
|------|------|--------|
| `curation-weekly-digest` | `0 8 * * 1` Europe/Paris | "Run the Curation Weekly Digest pipeline. Wire the Gmail and Draft MCP transports, then `npm run curation` from the repo root. Confirm by reporting the draftId." |
| `business-ideas-weekly` | `0 9 * * 3` Europe/Paris | "Run the Business Ideas Weekly pipeline. Wire the Gmail and Draft MCP transports, then `npm run business-ideas` from the repo root. Confirm by reporting the draftId." |

To create them, ask Claude Code (the user-facing one) to invoke `mcp__scheduled-tasks__create_scheduled_task` with these payloads.

## How to add a source (Curation)

1. Open [`src/curation/sources.ts`](./src/curation/sources.ts).
2. Append an entry to `CURATION_SOURCES` with `name`, `email` (or `keywords`), `tier`, and `category`.
3. The Gmail query (`buildGmailQuery`) and tier scoring (`computeBaseScore`) pick it up automatically.
4. Add a fixture in `tests/fixtures/` if you want the new source covered by the unit tests.

The Business Ideas pipeline does **not** use a source whitelist — it filters at runtime by "does this look like a newsletter ?" (presence of an unsubscribe link / view-in-browser marker).

## Re-running manually

```bash
# Re-run today's digest, overwriting the file. Idempotent.
npm run curation
npm run business-ideas

# Run as if it were a different date (useful for backfilling)
npx tsx src/curation/index.ts --date 2026-04-27
npx tsx src/business-ideas/index.ts --date 2026-04-29

# Force a smaller thread cap during debugging
npx tsx src/business-ideas/index.ts --max-threads 10
```

## Cost & latency

- Target : **< 0,50 €** per run, **< 5 min** wall-clock.
- The system prompts are marked `cache_control: ephemeral`, so re-runs within an hour pay 10× less on the prompt tokens.
- Cost is logged in `log.jsonl` (`stats.costEur`).

## Guard-rails

- Read-only on Gmail; the only write is the email draft (never sent automatically — Xavier reviews for the first 2 weeks).
- No invention : an extracted item without a verifiable quote/link is dropped.
- `.env` is gitignored.

## Testing

```bash
npm test                # full suite
npm run test:watch      # vitest watch mode
npm run typecheck       # tsc --noEmit
```

The test fixtures in `tests/fixtures/` are sanitized samples of real newsletters (Competia, Every, Hustle, Ben's Bites) plus one transactional email used to verify newsletter filtering. The `runCuration` and `runBusinessIdeas` integration tests assert the pipeline produces a well-formed digest end-to-end without an API key.

## Roadmap (post-V1)

See [`BRIEF.md` §10](./BRIEF.md). In short : cross-pipeline 🔥 badges, feedback loop, deep-dive market sizing via Exa MCP, a small Next.js dashboard, and finally auto-send once the format is stable.
