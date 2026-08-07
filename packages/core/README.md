# skive-engine

Shared image optimize engine for [Skive](https://github.com/leanojs/pixel).

Used by `skive-cli` today; later by the Multer-style `skive` library and storage adapters.

Skive — to cut or shave a thin layer from a surface. Fits public-folder image stripping.

## Install

```bash
npm install skive-engine
```

## API

```ts
import { optimizeFile, optimizeFolder } from "skive-engine";

await optimizeFile("./hero.png", "./hero-out.png", { quality: 80 });

await optimizeFolder("./public", "./public-optimized", {
  quality: 80,
  concurrency: 4,
});
```

Format-preserving by default. Pass `format: "webp" | "jpeg" | "png"` to convert.

## License

Apache-2.0
