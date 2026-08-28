declare module 'jsdom' {
  export class JSDOM {
    public readonly window: Window & typeof globalThis;

    public constructor(
      html?: string,
      options?: { readonly url?: string; readonly pretendToBeVisual?: boolean },
    );
  }
}
