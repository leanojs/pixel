import { stat } from "node:fs/promises";
import { basename, join, parse, resolve } from "node:path";

import {
  OptimizeError,
  optimizeFile,
  optimizeFolder,
  type ImageFormat,
  type OptimizeFolderFileResult,
} from "@pixel/core";

import {
  formatBytes,
  formatSavingsPercent,
  progressBar,
} from "../format.js";
import type { CliOptions } from "../parse-args.js";
import { CliUsageError } from "../parse-args.js";

export interface OptimizeIo {
  stdout: {
    write: (chunk: string) => void;
  };
  stderr: {
    write: (chunk: string) => void;
  };
}

export async function runOptimize(
  options: CliOptions,
  io: OptimizeIo = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  if (!options.input) {
    throw new CliUsageError("Missing <input>. Try: pixel optimize ./public");
  }

  const input = resolve(options.input);
  let inputStat;

  try {
    inputStat = await stat(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OptimizeError(
      `Cannot access input ${input}: ${reason}`,
      input,
      "optimize",
      { cause: error },
    );
  }

  const coreOptions = {
    quality: options.quality,
    format: options.format,
    width: options.width,
    dryRun: options.dryRun,
    concurrency: options.concurrency,
  };

  if (inputStat.isFile()) {
    return runFile(input, options, coreOptions, io);
  }

  if (inputStat.isDirectory()) {
    return runDirectory(input, options, coreOptions, io);
  }

  throw new CliUsageError(`Input is not a file or directory: ${input}`);
}

async function runFile(
  input: string,
  options: CliOptions,
  coreOptions: {
    quality?: number;
    format?: ImageFormat;
    width?: number;
    dryRun?: boolean;
  },
  io: OptimizeIo,
): Promise<number> {
  const output = resolveFileOutput(input, options);

  io.stdout.write(`Scanning ${displayPath(input)}... 1 image found\n\n`);

  try {
    const result = await optimizeFile(input, output, coreOptions);
    const line = formatOkLine(
      basename(input),
      result.inputBytes,
      result.outputBytes,
    );
    io.stdout.write(`  ${line}\n\n`);
    io.stdout.write(`Done. 1 optimized, 0 skipped.\n`);
    io.stdout.write(
      `Total: ${formatBytes(result.inputBytes)} → ${formatBytes(result.outputBytes)}  (${formatSavingsPercent(result.inputBytes, result.outputBytes)} smaller)\n`,
    );
    writeOutputFooter(io, output, options);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    io.stdout.write(`  ${basename(input)}    error (${reason})\n\n`);
    io.stdout.write(`Done. 0 optimized, 0 skipped, 1 error.\n`);
    return 1;
  }
}

async function runDirectory(
  input: string,
  options: CliOptions,
  coreOptions: {
    quality?: number;
    format?: ImageFormat;
    width?: number;
    dryRun?: boolean;
    concurrency?: number;
  },
  io: OptimizeIo,
): Promise<number> {
  const output = resolveDirectoryOutput(input, options);
  let fileLines = "";

  const result = await optimizeFolder(input, output, {
    ...coreOptions,
    onScan(files) {
      io.stdout.write(
        `Scanning ${displayPath(input)}... ${files.length} images found (png, jpeg, webp)\n\n`,
      );
      if (files.length === 0) {
        return;
      }
      io.stderr.write(
        `optimizing ${progressBar(0, files.length)} 0/${files.length}`,
      );
    },
    onFile(fileResult, completed, total) {
      io.stderr.write(
        `\roptimizing ${progressBar(completed, total)} ${completed}/${total}`,
      );
      fileLines += `  ${formatResultLine(fileResult)}\n`;
    },
  });

  if (result.results.length > 0) {
    io.stderr.write("\n\n");
  }

  io.stdout.write(fileLines);

  const ok = result.results.filter((entry) => entry.status === "ok").length;
  const skipped = result.results.filter(
    (entry) => entry.status === "skipped",
  ).length;
  const errors = result.results.filter((entry) => entry.status === "error").length;

  let done = `Done. ${ok} optimized, ${skipped} skipped.`;
  if (errors > 0) {
    done = `Done. ${ok} optimized, ${skipped} skipped, ${errors} error${errors === 1 ? "" : "s"}.`;
  }
  io.stdout.write(`${done}\n`);

  if (ok > 0) {
    io.stdout.write(
      `Total: ${formatBytes(result.totalInputBytes)} → ${formatBytes(result.totalOutputBytes)}  (${formatSavingsPercent(result.totalInputBytes, result.totalOutputBytes)} smaller)\n`,
    );
  } else {
    io.stdout.write("Total: 0 B → 0 B  (0% smaller)\n");
  }

  writeOutputFooter(io, output, options);
  return errors > 0 ? 1 : 0;
}

function resolveFileOutput(input: string, options: CliOptions): string {
  if (options.inPlace) {
    return input;
  }

  if (options.out) {
    return resolve(options.out);
  }

  const parsed = parse(input);
  const extension =
    options.format === undefined
      ? parsed.ext
      : options.format === "jpeg"
        ? ".jpg"
        : `.${options.format}`;

  return join(parsed.dir, `${parsed.name}-optimized${extension}`);
}

function resolveDirectoryOutput(input: string, options: CliOptions): string {
  if (options.inPlace) {
    return input;
  }

  if (options.out) {
    return resolve(options.out);
  }

  return `${input.replace(/[/\\]$/, "")}-optimized`;
}

function writeOutputFooter(
  io: OptimizeIo,
  output: string,
  options: CliOptions,
): void {
  if (options.dryRun) {
    io.stdout.write("Dry run — no files written.\n");
    return;
  }

  if (options.inPlace) {
    io.stdout.write(`Output written in place at ${displayPath(output)}\n`);
    return;
  }

  io.stdout.write(
    `Output written to ${displayPath(output)}  (originals untouched)\n`,
  );
}

function formatResultLine(result: OptimizeFolderFileResult): string {
  if (result.status === "skipped") {
    return `${result.file}    skipped (${result.reason ?? "unsupported format"})`;
  }

  if (result.status === "error") {
    return `${result.file}    error (${result.reason ?? "unknown error"})`;
  }

  return formatOkLine(
    result.file,
    result.inputBytes ?? 0,
    result.outputBytes ?? 0,
  );
}

function formatOkLine(
  file: string,
  inputBytes: number,
  outputBytes: number,
): string {
  return `${file}    ${formatBytes(inputBytes)} → ${formatBytes(outputBytes)}   (${formatSavingsPercent(inputBytes, outputBytes)})`;
}

function displayPath(path: string): string {
  const cwd = process.cwd();
  if (path === cwd) {
    return ".";
  }
  if (path.startsWith(`${cwd}/`) || path.startsWith(`${cwd}\\`)) {
    const relative = path.slice(cwd.length + 1);
    return relative.startsWith(".") ? relative : `./${relative}`;
  }
  return path;
}
