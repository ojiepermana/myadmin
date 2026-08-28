import '@angular/compiler';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastService } from '@ojiepermana/angular/component/toast';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { DEFAULT_WORKSPACE_STATE } from '@myadmin/workspace';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { ErrorPresenterService } from '../src/app/core/errors/error-presenter.service';
import { WorkspacePersistenceService } from '../src/app/core/state/workspace-persistence.service';
import { WorkspaceStore } from '../src/app/core/state/workspace.store';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

describe('WorkspacePersistenceService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('UT-0030-AC3 saves once after the last workspace change and flushes on unload', async () => {
    const save = jest.fn(() => of(undefined));
    const sdk = {
      workspace: {
        load: jest.fn(() => of({ state: DEFAULT_WORKSPACE_STATE, skippedTabs: 0 })),
        save,
      },
    } as unknown as MyadminSdk;
    const router = { url: '/workspace', navigateByUrl: jest.fn(() => Promise.resolve(true)) };
    const errorPresenter = { presentUnknown: jest.fn() };
    const toast = { info: jest.fn(), warning: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        WorkspaceStore,
        WorkspacePersistenceService,
        { provide: MyadminSdk, useValue: sdk },
        { provide: Router, useValue: router },
        { provide: ErrorPresenterService, useValue: errorPresenter },
        { provide: ToastService, useValue: toast },
      ],
    });

    const service = TestBed.inject(WorkspacePersistenceService);
    const workspace = TestBed.inject(WorkspaceStore);
    await service.restore('user-1');

    workspace.openTab({
      id: 'query-editor',
      type: 'query-editor',
      title: 'Query editor',
      context: { route: '/query-editor' },
    });
    TestBed.flushEffects();
    jest.advanceTimersByTime(1_999);
    expect(save).not.toHaveBeenCalled();

    workspace.setSidebarWidth(28);
    TestBed.flushEffects();
    jest.advanceTimersByTime(1_999);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);

    workspace.setBottomHeight(32);
    TestBed.flushEffects();
    window.dispatchEvent(new Event('beforeunload'));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
