# Skive MVP — Product & Build Doc

**Goal:** ship a real, usable product in the next few days. Not the full
platform — the smallest thing that's genuinely useful and worth someone's
npm install.

**Skive** — a manufacturing term: cut or shave a thin layer from a surface.
Fits public-folder image stripping.

**Package map (target):**

| Package | Role | v1 |
| --- | --- | --- |
| `skive-cli` | CLI (`skive` binary) | Ships now |
| `skive-engine` | Shared optimize engine (published dependency) | Ships now |
| `skive` | Multer-style library: upload + optimize + storage | Later |
| `skive-s3` | S3 storage adapter | Later |
| `skive-gcs` | GCS storage adapter | Later |

---

## 1. What We're Building

Skive v1 CLI is one thing: **a CLI that optimizes an entire folder of images
in place or into a mirrored output folder, preserving directory structure,
format-preserving by default.**

That's it for now. The Multer-style library and storage adapters come later.

---

## 2. The Core Use Case

```
$ skive optimize ./public

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

---

## 3. MVP Feature Set

- Recursive folder optimize, mirrored directory structure
- Format-preserving by default; `--format` for conversion
- `--width`, single-file mode, `--dry-run`, progress + summary
- Safe by default (`<input>-optimized`); `--in-place` is explicit

## 4. Out of Scope for v1

`skive` library, adapters, GitHub Action, playground, AVIF/GIF, presets,
plugin interface — all later.

## 5. Product Decisions

**Default output is non-destructive.** `--in-place` opts in.

```
skive optimize <input> [options]

  -o, --out <dir>       output directory (default: <input>-optimized)
  --in-place            overwrite files in <input> directly
  -f, --format <fmt>    convert to png | jpeg | webp (default: preserve)
  -q, --quality <n>     override default quality (default: 80)
  --width <n>           resize to width, aspect ratio preserved
  --dry-run             report projected savings, write nothing
  --concurrency <n>     parallel file limit (default: 4)
```

**`skive-engine` is published.** CLI depends on it normally (not bundled).

## 6. Engine API

```ts
// skive-engine
export async function optimizeFile(...): Promise<{ inputBytes; outputBytes }>;
export async function optimizeFolder(...): Promise<{ results; totals }>;
```

```
skive/
├── packages/
│   ├── core/    # skive-engine
│   └── cli/     # skive-cli (bin: skive)
├── docs/
├── turbo.json
└── package.json
```

## 7. Definition of Done

`npx skive-cli optimize ./public` works with zero config against a real
project folder.
