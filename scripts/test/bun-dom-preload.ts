import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const window = dom.window;
const global = globalThis as typeof globalThis & Record<string, unknown>;

for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  Document: window.Document,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MessageEvent: window.MessageEvent,
  CloseEvent: window.CloseEvent,
  DOMParser: window.DOMParser,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  global[name] = value;
}

global.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  window.setTimeout(() => callback(Date.now()), 0);
global.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
global.matchMedia =
  window.matchMedia?.bind(window) ??
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
