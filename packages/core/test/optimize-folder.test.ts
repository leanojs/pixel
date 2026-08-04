import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { decode } from "../src/codec.js";
import { optimizeFolder } from "../src/optimize.js";

async function makeJpegFixture(quality = 100): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 100,
      channels: 3,
      background: { r: 20, g: 90, b: 180 },
    },
  })
    .jpeg({ quality })
    .toBuffer();
}

async function makePngFixture(): Promise<Buffer> {
  return sharp({
    create: {
      width: 80,
      height: 60,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("optimizeFolder", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pixel-folder-"));
    dirs.push(dir);
    return dir;
  }

  it("mirrors nested structure and totals only successful files", async () => {
    const inputDir = await tempDir();
    const outputDir = await tempDir();
    await mkdir(join(inputDir, "img", "blog"), { recursive: true });
    await writeFile(join(inputDir, "hero.jpg"), await makeJpegFixture());
    await writeFile(
      join(inputDir, "img", "blog", "cover.png"),
      await makePngFixture(),
    );

    const result = await optimizeFolder(inputDir, outputDir, { quality: 80 });

    expect(result.results).toHaveLength(2);
    expect(result.results.every((entry) => entry.status === "ok")).toBe(true);
    expect(result.totalInputBytes).toBeGreaterThan(0);
    expect(result.totalOutputBytes).toBeGreaterThan(0);
    expect(result.totalOutputBytes).toBeLessThanOrEqual(result.totalInputBytes);

    await access(join(outputDir, "hero.jpg"));
    await access(join(outputDir, "img", "blog", "cover.png"));

    const cover = await decode(
      await readFile(join(outputDir, "img", "blog", "cover.png")),
    );
    expect(cover.format).toBe("png");
    expect(cover.width).toBe(80);
    expect(cover.height).toBe(60);
  });

  it("skips unsupported images and keeps optimizing the rest", async () => {
    const inputDir = await tempDir();
    const outputDir = await tempDir();
    await writeFile(join(inputDir, "ok.jpg"), await makeJpegFixture());
    await writeFile(
      join(inputDir, "logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );

    const result = await optimizeFolder(inputDir, outputDir);

    const byFile = Object.fromEntries(
      result.results.map((entry) => [entry.file, entry]),
    );

    expect(byFile["ok.jpg"]?.status).toBe("ok");
    expect(byFile["logo.svg"]).toMatchObject({
      status: "skipped",
      reason: "unsupported format",
    });
    expect(result.totalInputBytes).toBe(byFile["ok.jpg"]?.inputBytes);
    expect(result.totalOutputBytes).toBe(byFile["ok.jpg"]?.outputBytes);
  });

  it("soft-fails corrupt files without aborting the batch", async () => {
    const inputDir = await tempDir();
    const outputDir = await tempDir();
    await writeFile(join(inputDir, "good.jpg"), await makeJpegFixture());
    await writeFile(join(inputDir, "bad.png"), "not-a-real-png");

    const result = await optimizeFolder(inputDir, outputDir);

    const byFile = Object.fromEntries(
      result.results.map((entry) => [entry.file, entry]),
    );

    expect(byFile["good.jpg"]?.status).toBe("ok");
    expect(byFile["bad.png"]?.status).toBe("error");
    expect(byFile["bad.png"]?.reason).toBeTruthy();
    expect(result.results.filter((entry) => entry.status === "ok")).toHaveLength(
      1,
    );
  });

  it("changes extensions when an explicit format is requested", async () => {
    const inputDir = await tempDir();
    const outputDir = await tempDir();
    await mkdir(join(inputDir, "assets"), { recursive: true });
    await writeFile(
      join(inputDir, "assets", "badge.png"),
      await makePngFixture(),
    );

    const result = await optimizeFolder(inputDir, outputDir, {
      format: "webp",
    });

    expect(result.results).toEqual([
      expect.objectContaining({ file: join("assets", "badge.png"), status: "ok" }),
    ]);

    const output = await decode(
      await readFile(join(outputDir, "assets", "badge.webp")),
    );
    expect(output.format).toBe("webp");
  });
});
