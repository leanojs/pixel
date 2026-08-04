import { describe, expect, it } from "vitest";

import { CliUsageError, parseArgs } from "../src/parse-args.js";

describe("parseArgs", () => {
  it("parses optimize with flags", () => {
    expect(
      parseArgs([
        "optimize",
        "./public",
        "-o",
        "./out",
        "-f",
        "webp",
        "-q",
        "70",
        "--width",
        "1200",
        "--concurrency",
        "2",
        "--dry-run",
      ]),
    ).toMatchObject({
      command: "optimize",
      input: "./public",
      out: "./out",
      format: "webp",
      quality: 70,
      width: 1200,
      concurrency: 2,
      dryRun: true,
      inPlace: false,
    });
  });

  it("rejects --in-place together with --out", () => {
    expect(() =>
      parseArgs(["optimize", "./public", "--in-place", "-o", "./out"]),
    ).toThrow(CliUsageError);
  });

  it("normalizes jpg format to jpeg", () => {
    expect(parseArgs(["optimize", "a.png", "-f", "jpg"]).format).toBe("jpeg");
  });
});
