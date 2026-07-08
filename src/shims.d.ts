// marked@4 ships no type declarations. Minimal ambient typing for the small surface we use.
declare module "marked" {
  interface MarkedFn {
    (src: string, options?: Record<string, unknown>): string;
    parse(src: string, options?: Record<string, unknown>): string;
    setOptions(options: Record<string, unknown>): void;
  }
  export const marked: MarkedFn;
}
