import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isSupportedImagePath,
  walkImages,
  WalkError,
} from "../src/walk.js";

describe("walkImages", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "skive-walk-"));
    dirs.push(dir);
    return dir;
  }

  it("collects nested image files and preserves relative paths", async () => {
    const root = await tempDir();
    await mkdir(join(root, "img", "icons"), { recursive: true });
    await writeFile(join(root, "hero.png"), "png");
    await writeFile(join(root, "img", "cover.jpg"), "jpg");
    await writeFile(join(root, "img", "icons", "logo.webp"), "webp");
    await writeFile(join(root, "img", "icons", "mark.JPEG"), "jpeg");

    const entries = await walkImages(root);

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "hero.png",
      join("img", "cover.jpg"),
      join("img", "icons", "logo.webp"),
      join("img", "icons", "mark.JPEG"),
    ]);
    expect(entries.every((entry) => entry.absolutePath.startsWith(root))).toBe(
      true,
    );
  });

  it("includes unsupported image extensions for later skip reporting", async () => {
    const root = await tempDir();
    await writeFile(join(root, "logo.svg"), "<svg/>");
    await writeFile(join(root, "favicon.ico"), "ico");
    await writeFile(join(root, "readme.txt"), "nope");

    const entries = await walkImages(root);

    expect(entries.map((entry) => entry.relativePath).sort()).toEqual([
      "favicon.ico",
      "logo.svg",
    ]);
  });

  it("skips dotfiles", async () => {
    const root = await tempDir();
    await writeFile(join(root, "visible.png"), "png");
    await writeFile(join(root, ".skive-abc123.tmp"), "tmp");
    await writeFile(join(root, ".hidden.png"), "png");

    const entries = await walkImages(root);

    expect(entries.map((entry) => entry.relativePath)).toEqual(["visible.png"]);
  });

  it("throws WalkError when the root directory does not exist", async () => {
    const missing = join(tmpdir(), "skive-walk-missing", "nope");

    await expect(walkImages(missing)).rejects.toMatchObject({
      name: "WalkError",
      file: missing,
      operation: "walk",
    } satisfies Partial<WalkError>);
  });
});

describe("isSupportedImagePath", () => {
  it("recognizes supported extensions case-insensitively", () => {
    expect(isSupportedImagePath("a.PNG")).toBe(true);
    expect(isSupportedImagePath("a.jpg")).toBe(true);
    expect(isSupportedImagePath("a.jpeg")).toBe(true);
    expect(isSupportedImagePath("a.webp")).toBe(true);
    expect(isSupportedImagePath("a.svg")).toBe(false);
    expect(isSupportedImagePath("a.txt")).toBe(false);
  });
});
