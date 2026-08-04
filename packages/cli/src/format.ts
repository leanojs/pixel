export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${trimNumber(kb)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${trimNumber(mb)} MB`;
  }

  return `${trimNumber(mb / 1024)} GB`;
}

export function formatSavingsPercent(
  inputBytes: number,
  outputBytes: number,
): string {
  if (inputBytes <= 0) {
    return "0%";
  }

  const saved = ((inputBytes - outputBytes) / inputBytes) * 100;
  const rounded = Math.round(saved);
  if (rounded > 0) {
    return `-${rounded}%`;
  }
  if (rounded < 0) {
    return `+${Math.abs(rounded)}%`;
  }
  return "0%";
}

export function progressBar(completed: number, total: number, width = 20): string {
  if (total <= 0) {
    return `[${"=".repeat(width)}>]`;
  }

  const ratio = Math.min(completed / total, 1);
  const filled = Math.round(ratio * width);
  const bar = "=".repeat(filled).padEnd(width, " ");
  return `[${bar}>]`;
}

function trimNumber(value: number): string {
  if (value >= 10) {
    return String(Math.round(value));
  }
  return value.toFixed(1).replace(/\.0$/, "");
}
