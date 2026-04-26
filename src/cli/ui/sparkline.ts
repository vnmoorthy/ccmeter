// Tiny ASCII sparkline. asciichart works for the bigger charts but is
// overkill (and noisy) for one-line summaries.

const TICKS = "▁▂▃▄▅▆▇█";

export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.min(TICKS.length - 1, Math.floor(((v - min) / range) * (TICKS.length - 1)));
      return TICKS[idx];
    })
    .join("");
}
