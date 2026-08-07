import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runOptimize } from "../src/commands/optimize.js";
import { parseArgs } from "../src/parse-args.js";

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 160,
      height: 120,
      channels: 3,
      background: { r: 10, g: 80, b: 160 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

describe("runOptimize", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "skive-cli-"));
    dirs.push(dir);
    return dir;
  }

  function captureIo() {
    let stdout = "";
    let stderr = "";
    return {
      io: {
        stdout: {
          write(chunk: string) {
            stdout += chunk;
          },
        },
        stderr: {
          write(chunk: string) {
            stderr += chunk;
          },
        },
      },
      get stdout() {
        return stdout;
      },
      get stderr() {
        return stderr;
      },
    };
  }

  it("optimizes a folder and mirrors output", async () => {
    const inputDir = await tempDir();
    await mkdir(join(inputDir, "img"), { recursive: true });
    await writeFile(join(inputDir, "img", "hero.jpg"), await makeJpeg());
    await writeFile(join(inputDir, "logo.svg"), "<svg/>");

    const capture = captureIo();
    const options = parseArgs(["optimize", inputDir]);
    const code = await runOptimize(options, capture.io);

    expect(code).toBe(0);
    expect(capture.stdout).toContain("images found");
    expect(capture.stdout).toContain("skipped (unsupported format)");
    expect(capture.stdout).toContain("Done. 1 optimized, 1 skipped.");
    expect(capture.stdout).toContain("originals untouched");

    await access(join(`${inputDir}-optimized`, "img", "hero.jpg"));
  });

  it("dry-run does not write output files", async () => {
    const inputDir = await tempDir();
    await writeFile(join(inputDir, "hero.jpg"), await makeJpeg());

    const capture = captureIo();
    const options = parseArgs(["optimize", inputDir, "--dry-run"]);
    const code = await runOptimize(options, capture.io);

    expect(code).toBe(0);
    expect(capture.stdout).toContain("Dry run — no files written.");
    await expect(access(`${inputDir}-optimized`)).rejects.toThrow();
  });
});
