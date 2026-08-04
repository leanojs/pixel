import { stat } from "node:fs/promises";
import { join, parse } from "node:path";
import type { Sharp } from "sharp";

import {
  decode,
  encode,
  type ImageFormat,
} from "./codec.js";
import { isSupportedImagePath, walkImages } from "./walk.js";
import { writeAtomic } from "./write.js";

export type { ImageFormat };

export interface OptimizeFileOptions {
  quality?: number;
  format?: ImageFormat;
  width?: number;
  /** When true, encode and report sizes but do not write output. */
  dryRun?: boolean;
}

export interface OptimizeFileResult {
  inputBytes: number;
  outputBytes: number;
}

export interface OptimizeFolderOptions extends OptimizeFileOptions {
  /** Parallel file limit. Default 4. */
  concurrency?: number;
  /** Called once after the input tree is scanned. */
  onScan?: (files: string[]) => void;
  /** Called after each file finishes (ok, skipped, or error). */
  onFile?: (
    result: OptimizeFolderFileResult,
    completed: number,
    total: number,
  ) => void;
}

export type OptimizeFileStatus = "ok" | "skipped" | "error";

export interface OptimizeFolderFileResult {
  file: string;
  status: OptimizeFileStatus;
  inputBytes?: number;
  outputBytes?: number;
  reason?: string;
}

export interface OptimizeFolderResult {
  results: OptimizeFolderFileResult[];
  totalInputBytes: number;
  totalOutputBytes: number;
}

export class OptimizeError extends Error {
  readonly file: string;
  readonly operation: string;

  constructor(
    message: string,
    file: string,
    operation: string,
    options?: { cause?: unknown },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "OptimizeError";
    this.file = file;
    this.operation = operation;
  }
}

export async function optimizeFile(
  input: string | Buffer,
  output: string,
  options: OptimizeFileOptions = {},
): Promise<OptimizeFileResult> {
  const file = typeof input === "string" ? input : output;

  try {
    const inputBytes =
      typeof input === "string" ? (await stat(input)).size : input.byteLength;

    const decoded = await decode(input);
    let pipeline: Sharp = decoded.image;

    if (options.width !== undefined) {
      pipeline = pipeline.resize({ width: options.width });
    }

    // Format preservation is the default — only an explicit format option converts.
    const format = options.format ?? decoded.format;
    const data = await encode(pipeline, {
      format,
      quality: options.quality,
    });

    if (!options.dryRun) {
      await writeAtomic(output, data);
    }

    return { inputBytes, outputBytes: data.byteLength };
  } catch (error) {
    if (error instanceof OptimizeError) {
      throw error;
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new OptimizeError(
      `Failed to optimize ${file}: ${reason}`,
      file,
      "optimize",
      { cause: error },
    );
  }
}

export async function optimizeFolder(
  inputDir: string,
  outputDir: string,
  options: OptimizeFolderOptions = {},
): Promise<OptimizeFolderResult> {
  const concurrency = options.concurrency ?? 4;
  const entries = await walkImages(inputDir);
  const total = entries.length;

  options.onScan?.(entries.map((entry) => entry.relativePath));

  let completed = 0;

  const results = await mapPool(entries, concurrency, async (entry) => {
    const result = await processFolderEntry(entry, outputDir, options);
    completed += 1;
    options.onFile?.(result, completed, total);
    return result;
  });

  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  for (const result of results) {
    if (result.status === "ok") {
      totalInputBytes += result.inputBytes ?? 0;
      totalOutputBytes += result.outputBytes ?? 0;
    }
  }

  return { results, totalInputBytes, totalOutputBytes };
}

async function processFolderEntry(
  entry: { relativePath: string; absolutePath: string },
  outputDir: string,
  options: OptimizeFolderOptions,
): Promise<OptimizeFolderFileResult> {
  if (!isSupportedImagePath(entry.absolutePath)) {
    let inputBytes: number | undefined;

    try {
      inputBytes = (await stat(entry.absolutePath)).size;
    } catch {
      // Expected for a racey delete between walk and stat — still skip.
      inputBytes = undefined;
    }

    return {
      file: entry.relativePath,
      status: "skipped",
      inputBytes,
      reason: "unsupported format",
    };
  }

  const outputRelativePath = resolveOutputRelativePath(
    entry.relativePath,
    options.format,
  );
  const outputPath = join(outputDir, outputRelativePath);

  try {
    const { inputBytes, outputBytes } = await optimizeFile(
      entry.absolutePath,
      outputPath,
      {
        quality: options.quality,
        format: options.format,
        width: options.width,
        dryRun: options.dryRun,
      },
    );

    return {
      file: entry.relativePath,
      status: "ok",
      inputBytes,
      outputBytes,
    };
  } catch (error) {
    // Soft-fail: one bad file must not abort the rest of the batch.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      file: entry.relativePath,
      status: "error",
      reason,
    };
  }
}

/** When converting, swap the file extension; otherwise mirror the input path. */
function resolveOutputRelativePath(
  relativePath: string,
  format: ImageFormat | undefined,
): string {
  if (format === undefined) {
    return relativePath;
  }

  const parsed = parse(relativePath);
  const extension = format === "jpeg" ? ".jpg" : `.${format}`;
  return join(parsed.dir, `${parsed.name}${extension}`);
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
