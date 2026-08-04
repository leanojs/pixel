# Pixel MVP — Product & Build Doc

**Goal:** ship a real, usable product in the next few days. Not the full
engine from the SRS — the smallest thing that's genuinely useful and worth
someone's npm install.

---

## 1. What We're Building

Pixel v1 is one thing: **a CLI that optimizes an entire folder of images in
place or into a mirrored output folder, preserving directory structure,
format-preserving by default.**

That's it. That's the product. Everything else in the earlier architecture
doc and SRS (GitHub Action, playground, presets, plugin system) is real and
comes later — none of it ships in v1.

## 2. The Core Use Case

This is the entire pitch, as a terminal transcript. If the MVP can't
produce this output, it isn't done.

```
$ pixel optimize ./public

Scanning ./public... 340 images found (png, jpeg, webp)

optimizing [====================>] 340/340

  public/img/hero.png          842 KB → 210 KB   (-75%)
  public/img/icons/logo.svg    skipped (unsupported format)
  public/blog/2024/cover.jpg   1.2 MB → 380 KB   (-68%)
  ...

Done. 338 optimized, 2 skipped.
Total: 84.3 MB → 21.6 MB  (74% smaller)
Output written to ./public-optimized  (originals untouched)
```

Someone with a real Next.js/Astro/whatever `public/` folder runs one
command and gets a smaller, structurally identical copy. No config file, no
account, no setup.

---

## 3. MVP Feature Set

- Recursive folder optimize, output mirrors input directory structure
  exactly (the flagship feature — this is what made the earlier CLI
  precursor get organic npm pulls with zero promotion, don't dilute it)
- Format-preserving by default — `optimize` never changes a file's format
  unless `--format` is explicitly passed
- Explicit format conversion between png/jpeg/webp via `--format`
- Simple resize via `--width` (aspect ratio preserved)
- Single-file optimize, not just bulk (`pixel optimize ./hero.png`)
- Dry-run mode — report projected savings without writing anything
- Per-file progress + a real summary (total bytes before/after, % saved) —
  this is the whole "wow" moment of the tool, worth getting right
- Safe by default: never overwrites your source folder unless you
  explicitly ask it to (see §5)

## 4. Explicitly Out of Scope for v1

Everything here is a legitimate future feature. None of it ships now.

| Cut                                                  | Comes back when                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GitHub Action                                        | Right after CLI ships — it's a thin wrapper around the same core, cheap once core exists       |
| Web playground / UI                                  | Once CLI has real usage and you know what people actually want a UI for                        |
| AVIF, GIF support                                    | Fast follow — png/jpeg/webp covers the large majority of real `public/` folders                |
| Presets (`web`, `thumbnail`, etc.)                   | Once you see people repeatedly typing the same flag combos                                     |
| crop / watermark / background / grayscale transforms | Not core to "optimize my folder" — add if requested                                            |
| Plugin interface                                     | Don't spec an extension point for a system with one shippable feature                          |
| Dominant-color / quality-score analysis              | Byte-size before/after _is_ the analysis MVP needs                                             |
| `packages/config` as its own package                 | Root-level tsconfig/eslint is enough for a 2-package repo; promote when a 3rd package needs it |
| Multi-engine abstraction                             | Just call Sharp directly. Abstract it the day you actually need a second engine, not before    |

---

## 5. Product Decisions

**Default output is non-destructive.** `pixel optimize ./public` writes to
`./public-optimized` by default, not back into `./public`. `--in-place`
opts into overwriting the source directly. Reasoning: this tool's whole
pitch is "point it at a real project folder" — the first time it mangles
someone's actual assets because the default was destructive is the last
time they run it. Safe default, explicit opt-in for the destructive path.

**Command surface:**

```
pixel optimize <input> [options]

  -o, --out <dir>       output directory (default: <input>-optimized)
  --in-place            overwrite files in <input> directly
  -f, --format <fmt>    convert to png | jpeg | webp (default: preserve)
  -q, --quality <n>     override default quality (default: 80)
  --width <n>           resize to width, aspect ratio preserved
  --dry-run             report projected savings, write nothing
  --concurrency <n>     parallel file limit (default: 4)
```

**Skip, don't fail, on unsupported files.** A folder with SVGs or ICOs
mixed in shouldn't abort the run — skip and report, keep going. One bad or
unsupported file in a 300-image folder must not take down the other 299.

---

## 6. Minimal Technical Scope

This supersedes the SRS's public API for v1 — no `Pipeline` class, no
fluent builder, no `Transform` factories, no plugin interface. Two
functions is the whole engine:

```ts
// @pixel/core
export async function optimizeFile(
  input: string | Buffer,
  output: string,
  options?: {
    quality?: number;
    format?: "png" | "jpeg" | "webp";
    width?: number;
  },
): Promise<{ inputBytes: number; outputBytes: number }>;

export async function optimizeFolder(
  inputDir: string,
  outputDir: string,
  options?: {
    quality?: number;
    format?: "png" | "jpeg" | "webp";
    width?: number;
    concurrency?: number;
  },
): Promise<{
  results: Array<{
    file: string;
    status: "ok" | "skipped" | "error";
    inputBytes?: number;
    outputBytes?: number;
    reason?: string;
  }>;
  totalInputBytes: number;
  totalOutputBytes: number;
}>;
```

The full SRS-level API (Pipeline, fluent builder, Transform plugin
interface) is what you grow into the day a second real consumer — GitHub
Action, playground — actually needs pipeline composability instead of just
"optimize this folder." Don't build it before that day arrives.

**Repo structure:**

```
pixel/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── codec.ts        # sharp wrapper: decode/encode png|jpeg|webp
│   │       ├── write.ts        # atomic write (temp file + rename)
│   │       ├── walk.ts         # recursive folder walk, preserves relative paths
│   │       ├── optimize.ts     # optimizeFile, optimizeFolder
│   │       └── index.ts
│   └── cli/
│       └── src/
│           ├── commands/optimize.ts
│           └── index.ts
├── examples/
├── .github/
├── tsconfig.base.json          # root-level, not a package yet
├── .eslintrc.json
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

---

## 7. Build Order

1. Scaffold: pnpm workspace, turbo.json, root tsconfig/eslint
2. `core/codec.ts` — Sharp wrapper: decode + encode for png/jpeg/webp,
   quality option
3. `core/write.ts` — atomic write (temp file, then rename)
4. `core/optimize.ts` — `optimizeFile()`: decode → optional resize →
   optional convert → optimize → write → return byte counts
5. `core/walk.ts` — recursive directory walk, collect image files with
   relative paths intact
6. `core/optimize.ts` — `optimizeFolder()`: walk + concurrency-limited
   batch of `optimizeFile()`, per-file try/catch so one failure doesn't
   abort the run, collect results
7. `cli` — wire `pixel optimize <input>` (arg parsing, calls core, renders
   the progress/summary output from §2)
8. `cli` — `--dry-run` mode
9. README: install, usage, the before/after transcript from §2 as the
   hero example
10. Publish to npm, ship it

## 8. Definition of Done

You can point `pixel optimize` at a real project's `public/` (or `assets/`,
`static/`, whatever) folder and get back a verifiably smaller, structurally
identical copy, in one command, with zero config file, in under a minute
for a few hundred images. If a stranger can `npx pixel optimize ./public`
against their own project and it just works, v1 is done.

## 9. What Ships Next

Roughly in this order, once v1 has real usage to learn from:

1. **GitHub Action** — nearly free once core/CLI exist, same core call
   with different glue
2. **AVIF + GIF codec support** — additive, no core changes needed
   (§4 of the architecture doc: new codec = new adapter, zero changes
   elsewhere)
3. **`--include`/`--exclude` glob filters** — first real feature request
   you'll probably get
4. **Presets** — once you see repeated flag combinations in the wild
5. **Playground / web UI** — once you know what people actually want a UI
   for, instead of guessing now
