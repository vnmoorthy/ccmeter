// Minimal type shim for the asciichart package, which ships untyped.
// We only use plot() with a numeric series + an options bag.

declare module "asciichart" {
  export interface PlotConfig {
    height?: number;
    offset?: number;
    padding?: string;
    colors?: string[] | undefined;
    format?: (x: number, i: number) => string;
    min?: number;
    max?: number;
  }
  export function plot(series: number[] | number[][], config?: PlotConfig): string;
  export const lightgray: string;
  export const blue: string;
  export const green: string;
  export const cyan: string;
  export const magenta: string;
  export const red: string;
  export const yellow: string;
  export const white: string;
  export const reset: string;
  const _default: {
    plot: typeof plot;
    lightgray: string;
    blue: string;
    green: string;
    cyan: string;
    magenta: string;
    red: string;
    yellow: string;
    white: string;
    reset: string;
  };
  export default _default;
}
