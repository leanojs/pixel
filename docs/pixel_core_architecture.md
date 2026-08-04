# Pixel Core Architecture

_Pixel is a product under Leano (the umbrella company). Leano also owns
Make an Offer (BigCommerce app) and future products — Leano itself isn't
shipped as a thing, it's the company these products live under._

## 0. Positioning

Pixel is not a CLI with a GitHub Action bolted on. It's a processing engine
(`@pixel/core`) with thin, interface-specific shells around it — CLI, GitHub
Action, and the playground web app today; whatever comes next, later, only
if there's a real reason for it.

> **Write image processing logic once. Every interface just builds a
> pipeline and hands it to Core.**

Non-goals, explicitly:

- Not competing with Sharp/libvips/Squoosh on raw codec performance — Core
  orchestrates them, it doesn't reimplement them.
- Not expanding into other asset types (video, PDF, audio) right now. That's
  a different product with a different core.
- Not building interfaces nobody's using yet (Desktop, Cloud, MCP Server,
  SDK marketplace). See §5.

---

## 1. Core Design Principles

1. **Core knows nothing about its callers.** No terminal I/O, no GitHub
   Actions context, no React, no filesystem assumptions beyond "path,
   buffer, or stream in — path, buffer, or stream out."
2. **Format preservation is the default, conversion is explicit.**
   `optimize()` never changes a file's format on its own. Only
   `convert(format)` does. This is the actual product differentiator
   against "just use Sharp directly."
3. **Everything flows through Pipeline.** No transform runs standalone
   outside a pipeline context, even a pipeline of one step. This is what
   makes serialization, caching, and future plugin hooks possible without
   rearchitecting later.
4. **Core takes an image and a pipeline description. That's the whole
   contract.**

```ts
const result = await core.process({
  input,
  pipeline: [resize({ width: 1200 }), optimize()],
});
```

---

## 2. Core Domains

Five domains, each isolated, each replaceable independently. All of them
live inside `packages/core` — see §3 for why they aren't separate packages.

### 2.1 Image IO

Reading and writing images across paths, buffers, streams, and directories.
Directory-structure preservation on bulk operations lives here — it's the
thing that made the original bulk converter worth building, don't lose it.

### 2.2 Codecs

PNG, JPEG, WebP, AVIF, GIF today. TIFF/HEIF/JPEG XL are additive later —
each is a new codec module, not a Core change. Codecs wrap existing
libraries (Sharp/libvips); Core doesn't own encoding logic itself.

### 2.3 Transforms

Resize, crop, rotate, flip, optimize, convert, watermark, background,
grayscale. Each transform is a pure function: `(image, options) => image`.
No transform knows it's part of a pipeline.

**Presets** live here too — a preset is just a named, pre-built array of
transforms (`web-optimized`, `thumbnail`, `print`). They're not a separate
domain, they're a convenience layer on top of transforms + pipeline.

### 2.4 Analysis

The one genuinely new capability worth building now — it has immediate,
concrete payoff:

```ts
const report = await analyze("hero.png");
// {
//   width, height, format, hasAlpha,
//   estimatedSavings,   // -> CLI prints "could shrink 78%"
//   dominantColors,
//   quality
// }
```

Powers CLI/playground messaging today; could power a GitHub Action PR
comment later with zero new logic, just a new consumer of the same function.

### 2.5 Pipeline

Orchestration. Takes an ordered list of transforms, runs them against
decoded image data, re-encodes, writes output. This is the layer that makes
the fluent API and the serializable-pipeline API (§4) two views of the same
underlying thing.

### 2.6 Plugin Interface (spec only — see §6)

Not a loader. Not a package. Just a TypeScript interface every transform
already conforms to, so nothing needs to change shape if a loader gets
built later.

---

## 3. Repo Structure

```
pixel/
├── apps/
│   └── playground/            # existing web app
│                                # website, docs: add when you're actually building them
├── packages/
│   ├── core/                  # @pixel/core — the engine
│   │   └── src/
│   │       ├── io/
│   │       ├── codecs/
│   │       ├── transforms/
│   │       │   └── presets/    # named pipeline presets
│   │       ├── pipeline/
│   │       ├── analysis/
│   │       ├── plugins/
│   │       │   └── types.ts    # Transform interface — spec, no loader
│   │       ├── errors/
│   │       ├── types/
│   │       └── index.ts
│   ├── cli/                   # @pixel/cli — thin shell
│   ├── github-action/         # @pixel/github-action — thin shell
│   └── config/                # shared tsconfig/eslint
├── examples/
├── .github/
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

### Package growth path

Don't scaffold a package until something _outside_ Core actually needs it
independently. The list you're picturing eventually happening — `vscode`,
`plugins`, `types`, `utils`, `test-utils`, `website`, `docs` — all still
show up, just when there's real code to put in them, not before.

| Package         | Now                                   | When to actually split it out                                                                            |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core`          | ✅ separate                           | —                                                                                                        |
| `cli`           | ✅ separate                           | —                                                                                                        |
| `github-action` | ✅ separate                           | — needs a different build target (bundled single-file for the Actions runtime) anyway                    |
| `config`        | ✅ separate                           | shared config from day one, near-zero cost                                                               |
| `types`         | folded into `core`                    | once a package needs Pixel's types _without_ its runtime (unlikely — TS strips type-only imports)        |
| `utils`         | folded into `core`                    | once the same helper is duplicated across 2+ packages, not before                                        |
| `presets`       | folded into `core/transforms/presets` | once presets have consumers outside Pixel itself (e.g. third-party preset packages)                      |
| `plugins`       | interface only, in `core`             | once there's an actual first plugin to load                                                              |
| `vscode`        | not scaffolded                        | the day you write the first line of extension code                                                       |
| `test-utils`    | not scaffolded                        | once `core` and `cli` tests actually share fixtures — one package under test right now, nothing to share |
| `apps/website`  | not scaffolded                        | when you're actually building the marketing site                                                         |
| `apps/docs`     | not scaffolded                        | when you're actually writing docs beyond the README                                                      |

Rule of thumb: if a package would only ever be imported by `core` itself,
it's not a package — it's a folder in `core`.

---

## 4. Pipeline API

Two entry points into the same pipeline machinery — fluent for the common
case, explicit for anything composed, inspected, or saved as a preset.

**Fluent builder:**

```ts
import { Pixel } from "@pixel/core";

// format preserved — no convert() called
await Pixel.open("hero.png")
  .resize({ width: 1600 })
  .optimize()
  .write("hero.png");

// format changed — explicit
await Pixel.open("hero.png")
  .resize({ width: 1600 })
  .optimize()
  .convert("webp")
  .write("hero.webp");
```

**Explicit pipeline object:**

```ts
import { pipeline, resize, optimize } from "@pixel/core";

const p = pipeline([resize({ width: 1200 }), optimize({ quality: 82 })]);

await p.run(input, output);
```

**How a shell consumes it (CLI example):**

```ts
// packages/cli/src/commands/optimize.ts
import { Pixel } from "@pixel/core";

export async function optimizeCommand(paths: string[], opts: OptimizeOpts) {
  for (const file of paths) {
    await Pixel.open(file).optimize(opts).write(file);
  }
}
```

The GitHub Action's command handler is structurally identical — same Core
call, different surrounding glue (Action inputs vs argv parsing).

---

## 5. Scope: What's Cut, and Why

Architecturally fine — Core built this way doesn't preclude any of these —
but building them now means designing Core's API around consumers that
don't exist yet.

| Idea              | Status         | Why                                                             |
| ----------------- | -------------- | --------------------------------------------------------------- |
| VS Code extension | Not now        | No signal anyone wants this yet; empty package is pure overhead |
| Desktop app       | Not now        | Playground already covers the GUI case                          |
| Cloud service     | Not now        | Different business, different infra                             |
| MCP Server        | Not now        | No current consumer                                             |
| SDK / marketplace | Not now        | Presupposes a plugin ecosystem that doesn't exist               |
| Plugin loader     | Interface only | Spec the seam (§6), skip the implementation                     |

---

## 6. Plugin Interface (Spec, Not Build)

The only thing built now is the contract every transform already satisfies:

```ts
// packages/core/src/plugins/types.ts
export interface Transform<Options = unknown> {
  name: string;
  apply(image: DecodedImage, options: Options): Promise<DecodedImage>;
}
```

Built-in transforms (`resize`, `optimize`, `convert`, ...) already implement
this shape. A future plugin loader would just be "look up a `Transform` by
name from an external package instead of the built-in registry" — a small,
isolated addition, not a Core rewrite.

---

## 7. Migration Plan

**Phase 1 — Extract, don't redesign.**
Move existing logic into `@pixel/core` under the five domains above. No new
capability yet, just isolation.

**Phase 2 — Formalize Pipeline.**
Fluent builder + explicit pipeline object as the only two ways to invoke
transforms. CLI commands become thin Pipeline consumers.

**Phase 3 — Analysis domain.**
Add `analyze()`. Wire into CLI output and playground UI. First user-visible
payoff of the restructure.

**Phase 4 — Plugin interface.**
Define the `Transform` contract. No loader yet — just make sure new
transforms conform to it going forward.

**Phase 5 — Everything in §5.**
Only if there's a concrete reason to.
