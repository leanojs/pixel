import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

/** Extensions optimizeFile can process today. */
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Image-like extensions discovered during a walk. Unsupported ones are still
 * returned so optimizeFolder can report them as skipped.
 */
const IMAGE_EXTENSIONS = new Set([
  ...SUPPORTED_EXTENSIONS,
  ".svg",
  ".gif",
  ".ico",
  ".avif",
  ".tif",
  ".tiff",
  ".bmp",
]);

export interface WalkEntry {
  /** Path relative to the walked root — preserves directory structure. */
  relativePath: string;
  absolutePath: string;
}

export class WalkError extends Error {
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
    this.name = "WalkError";
    this.file = file;
    this.operation = operation;
  }
}

export function isSupportedImagePath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Recursively collect image files under `rootDir`, preserving each file's
 * path relative to the root so output trees can mirror input structure.
 */
export async function walkImages(rootDir: string): Promise<WalkEntry[]> {
  const results: WalkEntry[] = [];

  try {
    await visit(rootDir, rootDir, results);
  } catch (error) {
    if (error instanceof WalkError) {
      throw error;
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new WalkError(
      `Failed to walk ${rootDir}: ${reason}`,
      rootDir,
      "walk",
      { cause: error },
    );
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

async function visit(
  rootDir: string,
  currentDir: string,
  results: WalkEntry[],
): Promise<void> {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new WalkError(
      `Failed to read directory ${currentDir}: ${reason}`,
      currentDir,
      "walk",
      { cause: error },
    );
  }

  for (const entry of entries) {
    // Skip dotfiles / dot-directories (includes atomic-write temps).
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await visit(rootDir, absolutePath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue;
    }

    results.push({
      relativePath: relative(rootDir, absolutePath),
      absolutePath,
    });
  }
}
