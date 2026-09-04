import '@angular/compiler';
import { NgZone, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DataBrowser } from '../src/app/features/data-browser/data-browser';
import { appConfig } from '../src/app/app.config';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const webSourceRoot = 'apps/web/src';

async function resolveWebResource(url: string): Promise<string> {
  const fileName = url.split('/').pop();
  if (!fileName) throw new Error(`Angular resource URL is invalid: ${url}`);
  for await (const path of new Bun.Glob(`**/${fileName}`).scan({
    cwd: webSourceRoot,
    absolute: true,
  })) {
    return Bun.file(path).text();
  }
  throw new Error(`Angular resource was not found: ${url}`);
}

await ɵresolveComponentResources(resolveWebResource);

/** A route stub with whatever query parameters a test needs. */
function routeWith(params: Readonly<Record<string, string>> = {}): ActivatedRoute {
  const map = { get: (key: string) => params[key] ?? null };
  return { snapshot: { queryParamMap: map }, queryParamMap: of(map) } as unknown as ActivatedRoute;
}

/** A selected table, so the page renders its data branches rather than the empty state. */
const selectedTable = {
  connection: 'connection-1',
  ref: JSON.stringify({ database: 'app', schema: 'public', name: 'users', type: 'table' }),
};

async function renderWith(params: Readonly<Record<string, string>>) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [DataBrowser],
    providers: [
      ...appConfig.providers,
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeWith(params) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(DataBrowser);
  await fixture.whenStable();
  return fixture;
}

describe('[UT-0057-AC9] success and error live on separate channels', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('renders a notice with role=status and no destructive styling', async () => {
    const fixture = await renderWith(selectedTable);
    const component = fixture.componentInstance as unknown as {
      notice: { set: (value: string | null) => void };
    };

    component.notice.set('3 rows deleted.');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const status = [...element.querySelectorAll('[role="status"]')].find((node) =>
      node.textContent?.includes('3 rows deleted.'),
    );
    expect(status).toBeTruthy();
    // A success must never be announced as an alert, and must not be painted
    // with the destructive palette.
    expect(status?.className).not.toContain('destructive');
    expect(
      [...element.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent?.includes('3 rows deleted.'),
      ),
    ).toBe(false);
  });

  test('still renders a failure as an alert', async () => {
    const fixture = await renderWith(selectedTable);
    const component = fixture.componentInstance as unknown as {
      error: { set: (value: string | null) => void };
    };

    component.error.set('The read failed.');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent ?? '').toContain('The read failed.');
    expect(alert?.className ?? '').toContain('destructive');
  });
});

describe('[UT-0057-AC10] zoneless change detection is declared', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  test('the application injector provides a zoneless NgZone', () => {
    // `provideZonelessChangeDetection()` swaps NgZone for a noop implementation.
    // Asserting the behaviour, not the provider list, keeps this honest.
    expect(TestBed.inject(NgZone).constructor.name).toContain('Noop');
  });
});
