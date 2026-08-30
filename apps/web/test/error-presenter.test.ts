import '@angular/compiler';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '@ojiepermana/angular/component/toast';
import { afterEach, describe, expect, it, jest } from 'bun:test';
import { ErrorPresenterService } from '../src/app/core/errors/error-presenter.service';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

describe('ErrorPresenterService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('[IT-0015-AC6] presents a safe SDK error with its correlation ID and dismisses it', () => {
    const toast = { error: jest.fn(), dismiss: jest.fn(), info: jest.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: toast }],
    });

    const service = TestBed.inject(ErrorPresenterService);
    const error = {
      code: 'QUERY_FAILED',
      message: 'The query failed.',
      correlationId: 'corr-0015',
      status: 422,
    };

    service.present(error);
    expect(service.current()).toEqual(error);
    expect(toast.error).toHaveBeenCalledWith({
      title: error.message,
      description: 'Correlation ID: corr-0015',
      durationMs: null,
    });

    service.dismiss();
    expect(service.current()).toBeNull();
    expect(toast.dismiss).toHaveBeenCalledTimes(1);
  });

  it('[IT-0015-AC6] converts unknown render failures to a safe UI error and copies by fallback toast', async () => {
    const toast = { error: jest.fn(), dismiss: jest.fn(), info: jest.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: toast }],
    });

    const service = TestBed.inject(ErrorPresenterService);
    service.presentUnknown(new Error('secret database password'));
    const error = service.current();
    expect(error).toMatchObject({
      code: 'UI_RENDER_ERROR',
      message: 'This feature could not be rendered.',
      status: 500,
    });
    expect(error?.message).not.toContain('secret database password');

    await service.copyCorrelationId(error!);
    expect(toast.info).toHaveBeenCalledWith({
      title: 'Correlation ID',
      description: error?.correlationId,
    });
  });
});
