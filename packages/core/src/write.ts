import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Write `data` to `output` atomically: temp file in the same directory,
 * then rename into place. Creates parent directories as needed.
 */
export async function writeAtomic(
  output: string,
  data: Buffer,
): Promise<void> {
  const dir = dirname(output);
  await mkdir(dir, { recursive: true });

  const temp = join(dir, `.pixel-${randomBytes(8).toString("hex")}.tmp`);

  try {
    await writeFile(temp, data);

    try {
      await rename(temp, output);
    } catch (error) {
      // Windows cannot rename over an existing file — replace in two steps.
      if (
        process.platform === "win32" &&
        isNodeError(error) &&
        (error.code === "EPERM" || error.code === "EEXIST")
      ) {
        await unlink(output);
        await rename(temp, output);
        return;
      }
      throw error;
    }
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
