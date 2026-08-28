import { computed, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  minLength,
  pattern,
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
import { firstValueFrom } from 'rxjs';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';

@Component({
  selector: 'app-initial-setup',
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
  templateUrl: './initial-setup.html',
  styleUrl: './initial-setup.scss',
})
export class InitialSetup {
  private readonly sdk = inject(MyadminSdk);
  private readonly router = inject(Router);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly model = signal({ username: '', password: '' });
  protected readonly submitting = signal(false);
  protected readonly completed = signal(false);
  protected readonly setupForm = form(this.model, (path) => {
    required(path.username, { message: 'Username is required.' });
    minLength(path.username, 3, { message: 'Username must be at least 3 characters.' });
    maxLength(path.username, 32, { message: 'Username must be at most 32 characters.' });
    pattern(path.username, /^[A-Za-z0-9._-]+$/, {
      message: 'Use letters, numbers, dots, hyphens, and underscores only.',
    });
    required(path.password, { message: 'Password is required.' });
    minLength(path.password, 10, { message: 'Password must be at least 10 characters.' });
    maxLength(path.password, 256, { message: 'Password must be at most 256 characters.' });
    validate(path.password, ({ valueOf }) => {
      const password = valueOf(path.password);
      const username = valueOf(path.username);
      return password.length > 0 && password.toLowerCase() === username.toLowerCase()
        ? { kind: 'matches_username', message: 'Password must not match the username.' }
        : undefined;
    });
  });

  protected readonly passwordStrength = computed(() => {
    const { password, username } = this.model();
    if (password.length === 0) return { label: 'Not set', tone: 'muted', width: '0%' };
    if (password.length < 10 || password.toLowerCase() === username.toLowerCase()) {
      return { label: 'Needs improvement', tone: 'danger', width: '33%' };
    }
    if (password.length < 16) return { label: 'Good', tone: 'warning', width: '66%' };
    return { label: 'Strong', tone: 'success', width: '100%' };
  });

  protected onSubmit(): void {
    void submit(this.setupForm, async () => {
      this.submitting.set(true);
      this.errorPresenter.dismiss();
      try {
        await firstValueFrom(this.sdk.setup.createAdmin(this.model()));
        this.completed.set(true);
        await this.router.navigateByUrl('/auth');
      } catch (error) {
        this.errorPresenter.presentUnknown(error);
      } finally {
        this.submitting.set(false);
      }
    });
  }
}
