import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ThemeModeService } from '@ojiepermana/angular/theme/styles';
import { provideMyadminTheme } from './myadmin-theme';
import { THEME_PREFERENCE_STORAGE_KEY, ThemePreferenceStore } from './theme-preference.store';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

describe('ThemePreferenceStore', () => {
  let mediaQuery: {
    matches: boolean;
    listeners: Set<(event: MediaQueryListEvent) => void>;
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    mediaQuery = { matches: false, listeners: new Set() };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: mediaQuery.matches,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          mediaQuery.listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          mediaQuery.listeners.delete(listener),
      }),
    });
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideMyadminTheme()] });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('uses system by default and changes mode without a reload', () => {
    const store = TestBed.inject(ThemePreferenceStore);
    const modeService = TestBed.inject(ThemeModeService);

    expect(store.mode()).toBe('system');
    store.setMode('dark');

    expect(store.mode()).toBe('dark');
    expect(modeService.mode()).toBe('dark');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
  });

  it('restores the local preference through the source abstraction', () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'light');

    const store = TestBed.inject(ThemePreferenceStore);

    expect(store.mode()).toBe('light');
    expect(store.resolvedMode()).toBe('light');
  });

  it('follows live operating system changes while using system mode', () => {
    const store = TestBed.inject(ThemePreferenceStore);

    expect(store.resolvedMode()).toBe('light');
    mediaQuery.matches = true;
    for (const listener of mediaQuery.listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(store.resolvedMode()).toBe('dark');
  });
});
