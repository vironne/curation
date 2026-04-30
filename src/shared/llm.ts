import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

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

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, ' +
        'or run with --fixtures and --dry-run to skip live LLM calls.',
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * Force the model to return JSON matching the given schema by calling a tool.
 * The system prompt is cached (1h TTL) so the per-thread cost stays low.
 *
 * The shape of the tool's input is the JSON we want back. We pass the schema
 * verbatim into `input_schema`.
 */
export async function callJsonTool<T>(args: {
  systemPrompt: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
}): Promise<LlmCallResult<T>> {
  const c = getClient();
  const response = await c.messages.create({
    model: args.model ?? DEFAULT_MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: [
      {
        type: 'text',
        text: args.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
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
    throw new Error(`callJsonTool: model did not return a tool_use block`);
  }
  return {
    data: toolUse.input as T,
    usage: extractUsage(response),
  };
}

/** Plain markdown synthesis (no tool). System prompt cached. */
export async function callMarkdown(args: {
  systemPrompt: string;
  userContent: string;
  model?: string;
  maxTokens?: number;
}): Promise<LlmCallResult<string>> {
  const c = getClient();
  const response = await c.messages.create({
    model: args.model ?? DEFAULT_MODEL,
    max_tokens: args.maxTokens ?? 8192,
    system: [
      {
        type: 'text',
        text: args.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: args.userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('callMarkdown: model did not return a text block');
  }
  return { data: textBlock.text, usage: extractUsage(response) };
}

function extractUsage(response: Anthropic.Message): LlmUsage {
  const u = response.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

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
 * Rough cost estimate in EUR for Sonnet 4.6 / 4.7 (USD pricing → EUR @ 0.92).
 * Pricing as of early 2026: input $3 / Mtok, output $15 / Mtok,
 * cache write $3.75 / Mtok, cache read $0.30 / Mtok.
 */
export function estimateCostEur(u: LlmUsage): number {
  const usd =
    (u.inputTokens / 1_000_000) * 3 +
    (u.outputTokens / 1_000_000) * 15 +
    (u.cacheWriteTokens / 1_000_000) * 3.75 +
    (u.cacheReadTokens / 1_000_000) * 0.3;
  return Number((usd * 0.92).toFixed(4));
}
