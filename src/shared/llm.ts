/**
 * LLM provider abstraction. Two providers are supported :
 *
 *   1. Anthropic (Claude)   — paid (per-token, prompt caching)
 *   2. Google Gemini Flash  — free tier sufficient for one weekly run
 *
 * Selection is automatic :
 *   - LLM_PROVIDER env var ('anthropic' | 'gemini') if explicit
 *   - else GEMINI_API_KEY → gemini
 *   - else ANTHROPIC_API_KEY → anthropic
 *   - else error
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

export type LlmProvider = 'anthropic' | 'gemini';

export function activeProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'gemini') return explicit;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  throw new Error(
    'No LLM provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.',
  );
}

/** True if at least one provider key is in the environment. */
export function hasLlmProvider(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) || Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmCallResult<T> {
  data: T;
  usage: LlmUsage;
}

export interface JsonToolCallArgs {
  systemPrompt: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
}

export interface MarkdownCallArgs {
  systemPrompt: string;
  userContent: string;
  model?: string;
  maxTokens?: number;
}

/* ------------------------------------------------------------------------- */
/* Public API — dispatched on provider                                       */
/* ------------------------------------------------------------------------- */

export async function callJsonTool<T>(args: JsonToolCallArgs): Promise<LlmCallResult<T>> {
  const provider = activeProvider();
  return provider === 'gemini' ? geminiJsonTool<T>(args) : anthropicJsonTool<T>(args);
}

export async function callMarkdown(args: MarkdownCallArgs): Promise<LlmCallResult<string>> {
  const provider = activeProvider();
  return provider === 'gemini' ? geminiMarkdown(args) : anthropicMarkdown(args);
}

/* ------------------------------------------------------------------------- */
/* Anthropic implementation                                                  */
/* ------------------------------------------------------------------------- */

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

async function anthropicJsonTool<T>(args: JsonToolCallArgs): Promise<LlmCallResult<T>> {
  const c = getAnthropic();
  const response = await c.messages.create({
    model: args.model ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: [
      { type: 'text', text: args.systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    tools: [
      {
        name: args.toolName,
        description: args.toolDescription,
        input_schema: args.inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: args.toolName },
    messages: [{ role: 'user', content: args.userContent }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic: model did not return a tool_use block');
  }
  return {
    data: toolUse.input as T,
    usage: extractAnthropicUsage(response),
  };
}

async function anthropicMarkdown(args: MarkdownCallArgs): Promise<LlmCallResult<string>> {
  const c = getAnthropic();
  const response = await c.messages.create({
    model: args.model ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: args.maxTokens ?? 8192,
    system: [
      { type: 'text', text: args.systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: args.userContent }],
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    throw new Error('Anthropic: model did not return a text block');
  }
  return { data: block.text, usage: extractAnthropicUsage(response) };
}

function extractAnthropicUsage(response: Anthropic.Message): LlmUsage {
  const u = response.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/* ------------------------------------------------------------------------- */
/* Gemini implementation (REST, no SDK to keep deps minimal)                  */
/* ------------------------------------------------------------------------- */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function geminiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set.');
  return k;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
      >;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { code: number; message: string; status: string };
}

async function geminiCall(
  model: string,
  body: Record<string, unknown>,
): Promise<GeminiResponse> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GeminiResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${msg}`);
  }
  return json;
}

async function geminiJsonTool<T>(args: JsonToolCallArgs): Promise<LlmCallResult<T>> {
  const model = args.model ?? DEFAULT_GEMINI_MODEL;
  const body = {
    systemInstruction: { parts: [{ text: args.systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: args.userContent }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: args.toolName,
            description: args.toolDescription,
            parameters: sanitizeSchemaForGemini(args.inputSchema),
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [args.toolName],
      },
    },
    generationConfig: { maxOutputTokens: args.maxTokens ?? 4096, temperature: 0.5 },
  };

  const resp = await geminiCall(model, body);
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find(
    (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
      'functionCall' in p,
  );
  if (!fnCall) {
    throw new Error(
      `Gemini: model did not return a functionCall (got ${JSON.stringify(parts).slice(0, 200)})`,
    );
  }
  return {
    data: fnCall.functionCall.args as T,
    usage: extractGeminiUsage(resp),
  };
}

async function geminiMarkdown(args: MarkdownCallArgs): Promise<LlmCallResult<string>> {
  const model = args.model ?? DEFAULT_GEMINI_MODEL;
  const body = {
    systemInstruction: { parts: [{ text: args.systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: args.userContent }] }],
    generationConfig: { maxOutputTokens: args.maxTokens ?? 8192, temperature: 0.6 },
  };

  const resp = await geminiCall(model, body);
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p): p is { text: string } => 'text' in p);
  if (!textPart) {
    throw new Error(
      `Gemini: model did not return text (got ${JSON.stringify(parts).slice(0, 200)})`,
    );
  }
  return { data: textPart.text, usage: extractGeminiUsage(resp) };
}

function extractGeminiUsage(resp: GeminiResponse): LlmUsage {
  const m = resp.usageMetadata ?? {};
  return {
    inputTokens: m.promptTokenCount ?? 0,
    outputTokens: m.candidatesTokenCount ?? 0,
    cacheReadTokens: m.cachedContentTokenCount ?? 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Gemini's function-calling schema parser does not accept all JSON-schema
 * keywords (notably `additionalProperties` and some forms of `enum`). We
 * strip the unsupported bits recursively before submission.
 */
function sanitizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const STRIP = new Set(['$schema', '$id', 'additionalProperties', 'minimum', 'maximum']);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (STRIP.has(k)) continue;
        out[k] = walk(v);
      }
      // Gemini wants type uppercase or lowercase? It accepts both, but the
      // 'integer' type is mapped to 'INTEGER' internally — leaving as-is.
      return out;
    }
    return node;
  };
  return walk(schema) as Record<string, unknown>;
}

/* ------------------------------------------------------------------------- */
/* Usage helpers                                                             */
/* ------------------------------------------------------------------------- */

export function emptyUsage(): LlmUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/**
 * Rough cost estimate in EUR. Anthropic Sonnet 4.6/4.7 pricing as of early
 * 2026 (input $3 / Mtok, output $15 / Mtok, cache write $3.75, cache read $0.30).
 * Gemini 2.0 Flash is free under the daily quota → returns 0.
 */
export function estimateCostEur(u: LlmUsage): number {
  const provider = (() => {
    try { return activeProvider(); } catch { return 'anthropic' as LlmProvider; }
  })();
  if (provider === 'gemini') return 0;
  const usd =
    (u.inputTokens / 1_000_000) * 3 +
    (u.outputTokens / 1_000_000) * 15 +
    (u.cacheWriteTokens / 1_000_000) * 3.75 +
    (u.cacheReadTokens / 1_000_000) * 0.3;
  return Number((usd * 0.92).toFixed(4));
}
