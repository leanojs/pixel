import sharp, { type Sharp } from "sharp";

export type ImageFormat = "png" | "jpeg" | "webp";

export const SUPPORTED_FORMATS = ["png", "jpeg", "webp"] as const satisfies readonly ImageFormat[];

export class UnsupportedFormatError extends Error {
  readonly format: string | undefined;

  constructor(format: string | undefined) {
    const label = format ?? "unknown";
    super(`Unsupported image format: ${label}`);
    this.name = "UnsupportedFormatError";
    this.format = format;
  }
}

export interface DecodedImage {
  format: ImageFormat;
  width: number;
  height: number;
  /** Live Sharp instance — caller may chain .resize() before encode */
  image: Sharp;
}

export interface EncodeOptions {
  format: ImageFormat;
  /** Default 80 */
  quality?: number;
}

export function isSupportedFormat(format: string): format is ImageFormat {
  return (SUPPORTED_FORMATS as readonly string[]).includes(format);
}

function normalizeFormat(format: string): string {
  return format === "jpg" ? "jpeg" : format;
}

export async function decode(input: string | Buffer): Promise<DecodedImage> {
  const image = sharp(input);
  const meta = await image.metadata();

  const rawFormat = meta.format ? normalizeFormat(meta.format) : undefined;

  if (!rawFormat || !isSupportedFormat(rawFormat)) {
    throw new UnsupportedFormatError(rawFormat);
  }

  if (meta.width === undefined || meta.height === undefined) {
    throw new Error("Unable to determine image dimensions");
  }

  return {
    format: rawFormat,
    width: meta.width,
    height: meta.height,
    image,
  };
}

export async function encode(
  image: Sharp,
  options: EncodeOptions,
): Promise<Buffer> {
  const quality = options.quality ?? 80;

  switch (options.format) {
    case "jpeg":
      return image.jpeg({ quality, mozjpeg: true }).toBuffer();
    case "png":
      return image.png({ quality, compressionLevel: 9 }).toBuffer();
    case "webp":
      return image.webp({ quality }).toBuffer();
  }
}
