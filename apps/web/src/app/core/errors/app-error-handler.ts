import { Injectable, inject, type ErrorHandler } from '@angular/core';
import { ErrorPresenterService } from './error-presenter.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly presenter = inject(ErrorPresenterService);

  handleError(error: unknown): void {
    this.presenter.presentUnknown(error);
  }
}
