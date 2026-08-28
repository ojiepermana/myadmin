import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { App } from './app';
import { appConfig } from './app.config';

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

describe('App', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the foundation outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
