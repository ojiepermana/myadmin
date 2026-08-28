import { Component, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import {
  AlertComponent,
  AlertDescriptionComponent,
  AlertTitleComponent,
} from '@ojiepermana/angular/component/alert';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardFooterComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { InputComponent } from '@ojiepermana/angular/component/input';
import { ToastService } from '@ojiepermana/angular/component/toast';
import { firstValueFrom } from 'rxjs';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';
import { AuthSessionStore } from '../../core/auth/auth-session.store';

@Component({
  selector: 'app-change-password',
  imports: [
    AlertComponent,
    AlertDescriptionComponent,
    AlertTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardFooterComponent,
    CardHeaderComponent,
    CardTitleComponent,
    FormField,
    FormRoot,
    InputComponent,
  ],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword {
  private readonly sdk = inject(MyadminSdk);
  private readonly toast = inject(ToastService);
  protected readonly authSession = inject(AuthSessionStore);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly model = signal({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  protected readonly submitting = signal(false);
  protected readonly completed = signal(false);
  protected readonly passwordForm = form(this.model, (path) => {
    required(path.currentPassword, { message: 'Current password is required.' });
    required(path.newPassword, { message: 'New password is required.' });
    minLength(path.newPassword, 10, { message: 'New password must be at least 10 characters.' });
    maxLength(path.newPassword, 256, { message: 'New password must be at most 256 characters.' });
    validate(path.newPassword, ({ valueOf }) => {
      const password = valueOf(path.newPassword);
      const username = this.authSession.currentUser()?.username ?? '';
      return password.length > 0 && password.toLowerCase() === username.toLowerCase()
        ? { kind: 'matches_username', message: 'New password must not match your username.' }
        : undefined;
    });
    required(path.confirmPassword, { message: 'Please confirm your new password.' });
    validate(path.confirmPassword, ({ valueOf }) =>
      valueOf(path.confirmPassword) === valueOf(path.newPassword)
        ? undefined
        : { kind: 'password_mismatch', message: 'Passwords do not match.' },
    );
  });

  protected onSubmit(): void {
    void submit(this.passwordForm, async () => {
      this.submitting.set(true);
      this.completed.set(false);
      this.errorPresenter.dismiss();
      try {
        const { currentPassword, newPassword } = this.model();
        await firstValueFrom(this.sdk.auth.changePassword({ currentPassword, newPassword }));
        this.model.set({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.completed.set(true);
        this.toast.success({
          title: 'Password changed',
          description: 'Other sessions have been signed out for your protection.',
        });
      } catch (error) {
        this.model.update((model) => ({
          ...model,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));
        this.errorPresenter.presentUnknown(error);
      } finally {
        this.submitting.set(false);
      }
    });
  }
}
