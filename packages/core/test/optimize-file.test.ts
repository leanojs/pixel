import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { decode } from "../src/codec.js";
import { OptimizeError, optimizeFile } from "../src/optimize.js";

async function makeJpegFixture(quality = 100): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .jpeg({ quality })
    .toBuffer();
}

async function makePngFixture(): Promise<Buffer> {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("optimizeFile", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pixel-core-"));
    dirs.push(dir);
    return dir;
  }

  it("preserves jpeg format and reduces or holds size", async () => {
    const dir = await tempDir();
    const inputPath = join(dir, "photo.jpg");
    const outputPath = join(dir, "photo-out.jpg");
    await writeFile(inputPath, await makeJpegFixture(100));

    const result = await optimizeFile(inputPath, outputPath, { quality: 80 });

    const output = await decode(await readFile(outputPath));
    expect(output.format).toBe("jpeg");
    expect(output.width).toBe(400);
    expect(output.height).toBe(300);
    expect(result.outputBytes).toBeLessThanOrEqual(result.inputBytes);
  });

  it("converts format only when format option is set", async () => {
    const dir = await tempDir();
    const inputPath = join(dir, "badge.png");
    const outputPath = join(dir, "badge.webp");
    await writeFile(inputPath, await makePngFixture());

    await optimizeFile(inputPath, outputPath, { format: "webp" });

    const output = await decode(await readFile(outputPath));
    expect(output.format).toBe("webp");
    expect(output.width).toBe(120);
    expect(output.height).toBe(80);
  });

  it("resizes to width while preserving aspect ratio", async () => {
    const dir = await tempDir();
    const inputPath = join(dir, "wide.jpg");
    const outputPath = join(dir, "wide-out.jpg");
    await writeFile(inputPath, await makeJpegFixture());

    await optimizeFile(inputPath, outputPath, { width: 200 });

    const output = await decode(await readFile(outputPath));
    expect(output.width).toBe(200);
    expect(output.height).toBe(150);
    expect(output.format).toBe("jpeg");
  });

  it("accepts a Buffer input", async () => {
    const dir = await tempDir();
    const outputPath = join(dir, "from-buffer.jpg");
    const input = await makeJpegFixture();

    const result = await optimizeFile(input, outputPath, { quality: 80 });

    expect(result.inputBytes).toBe(input.byteLength);
    const output = await decode(await readFile(outputPath));
    expect(output.format).toBe("jpeg");
  });

  it("dry-run reports sizes without writing output", async () => {
    const dir = await tempDir();
    const inputPath = join(dir, "photo.jpg");
    const outputPath = join(dir, "photo-out.jpg");
    await writeFile(inputPath, await makeJpegFixture(100));

    const result = await optimizeFile(inputPath, outputPath, {
      quality: 80,
      dryRun: true,
    });

    expect(result.inputBytes).toBeGreaterThan(0);
    expect(result.outputBytes).toBeGreaterThan(0);
    await expect(access(outputPath)).rejects.toThrow();
  });

  it("throws OptimizeError with file and operation on unsupported input", async () => {
    const dir = await tempDir();
    const inputPath = join(dir, "icon.svg");
    const outputPath = join(dir, "icon-out.svg");
    await writeFile(
      inputPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );

    await expect(optimizeFile(inputPath, outputPath)).rejects.toMatchObject({
      name: "OptimizeError",
      file: inputPath,
      operation: "optimize",
    } satisfies Partial<OptimizeError>);
  });
});
