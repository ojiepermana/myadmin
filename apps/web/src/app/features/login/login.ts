import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
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
import { AuthSessionStore } from '../../core/auth/auth-session.store';

@Component({
  selector: 'app-login',
  imports: [
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
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly sdk = inject(MyadminSdk);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionStore);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly model = signal({ username: '', password: '' });
  protected readonly submitting = signal(false);
  protected readonly loginForm = form(this.model, (path) => {
    required(path.username, { message: 'Username is required.' });
    required(path.password, { message: 'Password is required.' });
  });

  protected onSubmit(): void {
    void submit(this.loginForm, async () => {
      this.submitting.set(true);
      this.errorPresenter.dismiss();
      try {
        const response = await firstValueFrom(this.sdk.auth.login(this.model()));
        this.authSession.setUser(response.user);
        this.model.set({ username: '', password: '' });
        await this.router.navigateByUrl('/workspace', { replaceUrl: true });
      } catch (error) {
        this.model.update((model) => ({ ...model, password: '' }));
        this.errorPresenter.presentUnknown(error);
      } finally {
        this.submitting.set(false);
      }
    });
  }
}
