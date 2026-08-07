import type { ImageFormat } from "skive-engine";

export interface CliOptions {
  command: "optimize" | null;
  input: string | null;
  out: string | null;
  inPlace: boolean;
  format: ImageFormat | undefined;
  quality: number | undefined;
  width: number | undefined;
  dryRun: boolean;
  concurrency: number | undefined;
  help: boolean;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const FORMATS = new Set(["png", "jpeg", "webp", "jpg"]);

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: null,
    input: null,
    out: null,
    inPlace: false,
    format: undefined,
    quality: undefined,
    width: undefined,
    dryRun: false,
    concurrency: undefined,
    help: false,
  };

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--in-place") {
      options.inPlace = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "-o" || arg === "--out") {
      options.out = readValue(argv, ++i, arg);
      continue;
    }

    if (arg === "-f" || arg === "--format") {
      const value = readValue(argv, ++i, arg).toLowerCase();
      if (!FORMATS.has(value)) {
        throw new CliUsageError(
          `Invalid --format '${value}'. Expected png, jpeg, or webp.`,
        );
      }
      options.format = value === "jpg" ? "jpeg" : (value as ImageFormat);
      continue;
    }

    if (arg === "-q" || arg === "--quality") {
      options.quality = readNumber(argv, ++i, arg);
      continue;
    }

    if (arg === "--width") {
      options.width = readNumber(argv, ++i, arg);
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = readNumber(argv, ++i, arg);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.command = positionals[0] === "optimize" ? "optimize" : null;
    if (options.command === null && !options.help) {
      throw new CliUsageError(
        `Unknown command '${positionals[0]}'. Try: skive optimize <input>`,
      );
    }
  }

  if (positionals[1]) {
    options.input = positionals[1];
  }

  if (positionals.length > 2) {
    throw new CliUsageError(
      `Unexpected arguments: ${positionals.slice(2).join(" ")}`,
    );
  }

  if (options.inPlace && options.out) {
    throw new CliUsageError("Use either --in-place or --out, not both.");
  }

  return options;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`Missing value for ${flag}`);
  }
  return value;
}

function readNumber(argv: string[], index: number, flag: string): number {
  const raw = readValue(argv, index, flag);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new CliUsageError(`${flag} must be a positive integer`);
  }
  return value;
}

export function usageText(): string {
  return `Usage: skive optimize <input> [options]

Optimize a file or folder of images (png, jpeg, webp).

Options:
  -o, --out <dir>       output directory (default: <input>-optimized)
  --in-place            overwrite files in <input> directly
  -f, --format <fmt>    convert to png | jpeg | webp (default: preserve)
  -q, --quality <n>     override default quality (default: 80)
  --width <n>           resize to width, aspect ratio preserved
  --dry-run             report projected savings, write nothing
  --concurrency <n>     parallel file limit (default: 4)
  -h, --help            show help
`;
}
