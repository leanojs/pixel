#!/usr/bin/env node

import { OptimizeError } from "@pixel/core";

import { runOptimize } from "./commands/optimize.js";
import { CliUsageError, parseArgs, usageText } from "./parse-args.js";

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);

  if (options.help || options.command === null) {
    process.stdout.write(usageText());
    return 0;
  }

  if (options.command === "optimize") {
    return runOptimize(options);
  }

  process.stdout.write(usageText());
  return 1;
}

const exitCode = await main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    process.stderr.write(`Error: ${error.message}\n\n`);
    process.stderr.write(usageText());
    return 1;
  }

  if (error instanceof OptimizeError) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }

  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  return 1;
});

process.exitCode = exitCode;
