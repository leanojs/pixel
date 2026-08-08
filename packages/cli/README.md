<p align="center">
  <img src="https://raw.githubusercontent.com/leanojs/pixel/main/assets/readme-banner.png" alt="Skive — optimize image folders in one command" width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/skive-cli"><img src="https://img.shields.io/npm/v/skive-cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/skive-cli"><img src="https://img.shields.io/npm/dm/skive-cli.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/leanojs/pixel/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square" alt="node" /></a>
</p>

<p align="center">
  <b>Skive</b> — cut a thin layer off your images.<br />
  Format-preserving by default · directory structure mirrored · originals untouched unless you ask.
</p>

```bash
npx skive-cli optimize ./public
```

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

Point it at a real Next.js / Astro / whatever `public/` folder. No config file, no account, no setup.

## Install

```bash
# one-shot (no install)
npx skive-cli optimize ./public

# global (bin is `skive`)
npm install -g skive-cli
skive optimize ./public
```

Requires **Node.js 18+**.

## Usage

```bash
skive optimize <input> [options]
```

`<input>` can be a single image or a directory.

| Flag                 | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `-o, --out <dir>`    | Output directory (default: `<input>-optimized`)         |
| `--in-place`         | Overwrite files in `<input>` directly                   |
| `-f, --format <fmt>` | Convert to `png`, `jpeg`, or `webp` (default: preserve) |
| `-q, --quality <n>`  | Quality override (default: `80`)                        |
| `--width <n>`        | Resize to width, aspect ratio preserved                 |
| `--dry-run`          | Report projected savings, write nothing                 |
| `--concurrency <n>`  | Parallel file limit (default: `4`)                      |

### Examples

```bash
# Safe default — writes ./public-optimized
skive optimize ./public

# Preview savings without writing
skive optimize ./public --dry-run

# Overwrite the source tree (explicit opt-in)
skive optimize ./public --in-place

# Single file
skive optimize ./hero.png

# Convert a folder to WebP
skive optimize ./public -f webp -o ./public-webp
```

## Behavior

- **Safe by default.** Output goes to `<input>-optimized`. Use `--in-place` only when you mean it.
- **Format-preserving.** `optimize` never changes format unless you pass `--format`.
- **Skip, don't fail.** SVG, ICO, and other unsupported files are reported and skipped; the rest of the run continues.
- **Supported formats:** PNG, JPEG, WebP.

## Links

- GitHub: [leanojs/pixel](https://github.com/leanojs/pixel)
- Engine: [`skive-engine`](https://www.npmjs.com/package/skive-engine)
- Issues: [github.com/leanojs/pixel/issues](https://github.com/leanojs/pixel/issues)

## License

Apache-2.0
