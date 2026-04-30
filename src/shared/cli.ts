import type { PipelineOptions } from './types.js';

/** Parse CLI args shared by both entrypoints. */
export function parseCliArgs(argv: string[]): PipelineOptions {
  const args = argv.slice(2);
  const opts: PipelineOptions = {
    dryRun: args.includes('--dry-run'),
    useFixtures: args.includes('--fixtures'),
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--fixtures-dir' && args[i + 1]) {
      opts.fixturesDir = args[++i];
    } else if (a === '--output-dir' && args[i + 1]) {
      opts.outputDir = args[++i];
    } else if (a === '--date' && args[i + 1]) {
      opts.today = new Date(args[++i]);
    } else if (a === '--max-threads' && args[i + 1]) {
      opts.maxThreads = parseInt(args[++i], 10);
    }
  }

  // `--fixtures` implies `--dry-run` unless the caller is wiring a real draft
  // transport (rare; the user asked for offline-by-default).
  if (opts.useFixtures && !opts.dryRun) {
    opts.dryRun = true;
  }

  return opts;
}
