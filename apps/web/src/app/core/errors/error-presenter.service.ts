import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '@ojiepermana/angular/component/toast';
import { isSdkError, type SdkError } from './sdk-error';

@Injectable({ providedIn: 'root' })
export class ErrorPresenterService {
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  private readonly error = signal<SdkError | null>(null);

  readonly current = this.error.asReadonly();

  present(error: SdkError): void {
    this.error.set(error);
    this.toast.error({
      title: error.message,
      description: `Correlation ID: ${error.correlationId}`,
      durationMs: null,
    });
  }

  presentUnknown(value: unknown): void {
    this.present(this.toSdkError(value));
  }

  presentToastUnknown(value: unknown): void {
    const error = this.toSdkError(value);
    this.toast.error({
      title: error.message,
      description: `Correlation ID: ${error.correlationId}`,
      durationMs: null,
    });
  }

  async copyCorrelationId(error: SdkError): Promise<void> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) {
      this.toast.info({ title: 'Correlation ID', description: error.correlationId });
      return;
    }

    try {
      await clipboard.writeText(error.correlationId);
      this.toast.success({ title: 'Correlation ID copied' });
    } catch {
      this.toast.info({ title: 'Correlation ID', description: error.correlationId });
    }
  }

  dismiss(): void {
    this.error.set(null);
    this.toast.dismiss();
  }

  private createCorrelationId(): string {
    const crypto = this.document.defaultView?.crypto;
    return crypto?.randomUUID() ?? `ui-${Date.now().toString(36)}`;
  }

  private toSdkError(value: unknown): SdkError {
    if (isSdkError(value)) return value;

    return {
      code: 'UI_RENDER_ERROR',
      message: 'This feature could not be rendered.',
      correlationId: this.createCorrelationId(),
      status: 500,
    };
  }
}
