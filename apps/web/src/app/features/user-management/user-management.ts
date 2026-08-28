import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import {
  AlertComponent,
  AlertDescriptionComponent,
  AlertTitleComponent,
} from '@ojiepermana/angular/component/alert';
import {
  AlertDialogActionComponent,
  AlertDialogCancelComponent,
  AlertDialogComponent,
  AlertDialogContentComponent,
  AlertDialogDescriptionComponent,
  AlertDialogFooterComponent,
  AlertDialogHeaderComponent,
  AlertDialogTitleComponent,
} from '@ojiepermana/angular/component/alert-dialog';
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
import {
  DialogCloseDirective,
  DialogComponent,
  DialogContentComponent,
  DialogDescriptionComponent,
  DialogFooterComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
} from '@ojiepermana/angular/component/dialog';
import { InputComponent } from '@ojiepermana/angular/component/input';
import {
  NativeSelectComponent,
  NativeSelectOptionDirective,
} from '@ojiepermana/angular/component/native-select';
import { PaginationComponent } from '@ojiepermana/angular/component/pagination';
import { SkeletonComponent } from '@ojiepermana/angular/component/skeleton';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import {
  TableBodyComponent,
  TableCellComponent,
  TableComponent,
  TableHeadComponent,
  TableHeaderComponent,
  TableRowComponent,
} from '@ojiepermana/angular/component/table';
import { ToastService } from '@ojiepermana/angular/component/toast';
import {
  MyadminSdk,
  type CreateUserRequest,
  type ManagedUser,
  type ResetPasswordRequest,
  type UpdateUserRequest,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';

const PAGE_SIZE = 10;

type PendingAction =
  | { readonly kind: 'create'; readonly request: CreateUserRequest }
  | {
      readonly kind: 'update';
      readonly userId: string;
      readonly request: UpdateUserRequest;
      readonly username: string;
    }
  | {
      readonly kind: 'reset';
      readonly userId: string;
      readonly request: ResetPasswordRequest;
      readonly username: string;
    };

@Component({
  selector: 'app-user-management',
  imports: [
    AlertComponent,
    AlertDescriptionComponent,
    AlertDialogActionComponent,
    AlertDialogCancelComponent,
    AlertDialogComponent,
    AlertDialogContentComponent,
    AlertDialogDescriptionComponent,
    AlertDialogFooterComponent,
    AlertDialogHeaderComponent,
    AlertDialogTitleComponent,
    AlertTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardFooterComponent,
    CardHeaderComponent,
    CardTitleComponent,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
    FormField,
    FormRoot,
    InputComponent,
    NativeSelectComponent,
    NativeSelectOptionDirective,
    PaginationComponent,
    SkeletonComponent,
    SpinnerComponent,
    TableBodyComponent,
    TableCellComponent,
    TableComponent,
    TableHeadComponent,
    TableHeaderComponent,
    TableRowComponent,
  ],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
})
export class UserManagement {
  private readonly sdk = inject(MyadminSdk);
  private readonly toast = inject(ToastService);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly users = signal<readonly ManagedUser[]>([]);
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly submitting = signal(false);
  protected readonly createOpen = signal(false);
  protected readonly resetOpen = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly pending = signal<PendingAction | null>(null);
  protected readonly resetTarget = signal<ManagedUser | null>(null);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected readonly createModel = signal<CreateUserRequest>({
    username: '',
    password: '',
    role: 'user',
  });
  protected readonly resetModel = signal<ResetPasswordRequest>({ newPassword: '' });
  protected readonly createForm = form(this.createModel, (path) => {
    required(path.username, { message: 'Username is required.' });
    minLength(path.username, 3, { message: 'Username must be at least 3 characters.' });
    maxLength(path.username, 32, { message: 'Username must be at most 32 characters.' });
    pattern(path.username, /^[A-Za-z0-9._-]+$/, {
      message: 'Use letters, numbers, dots, hyphens, and underscores only.',
    });
    required(path.password, { message: 'Password is required.' });
    minLength(path.password, 10, { message: 'Password must be at least 10 characters.' });
    maxLength(path.password, 256, { message: 'Password must be at most 256 characters.' });
    required(path.role, { message: 'Role is required.' });
  });
  protected readonly resetForm = form(this.resetModel, (path) => {
    required(path.newPassword, { message: 'New password is required.' });
    minLength(path.newPassword, 10, { message: 'Password must be at least 10 characters.' });
    maxLength(path.newPassword, 256, { message: 'Password must be at most 256 characters.' });
  });

  constructor() {
    void this.loadUsers();
  }

  protected async loadUsers(nextPage = this.page()): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const response = await firstValueFrom(
        this.sdk.users.list({ page: nextPage, pageSize: PAGE_SIZE }),
      );
      this.users.set(response.items);
      this.page.set(response.page);
      this.total.set(response.total);
    } catch (error) {
      this.loadFailed.set(true);
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected openCreateDialog(): void {
    this.createModel.set({ username: '', password: '', role: 'user' });
    this.createOpen.set(true);
  }

  protected requestCreate(): void {
    void submit(this.createForm, async () => {
      this.pending.set({ kind: 'create', request: this.createModel() });
      this.createOpen.set(false);
      this.confirmOpen.set(true);
    });
  }

  protected requestReset(user: ManagedUser): void {
    this.resetTarget.set(user);
    this.resetModel.set({ newPassword: '' });
    this.resetOpen.set(true);
  }

  protected requestResetSubmit(): void {
    void submit(this.resetForm, async () => {
      const user = this.resetTarget();
      if (!user) return;
      this.pending.set({
        kind: 'reset',
        userId: user.id,
        request: this.resetModel(),
        username: user.username,
      });
      this.resetOpen.set(false);
      this.confirmOpen.set(true);
    });
  }

  protected requestRoleChange(user: ManagedUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value;
    if ((role !== 'admin' && role !== 'user') || role === user.role) return;
    this.pending.set({
      kind: 'update',
      userId: user.id,
      request: { role },
      username: user.username,
    });
    this.confirmOpen.set(true);
  }

  protected requestStatusChange(user: ManagedUser): void {
    this.pending.set({
      kind: 'update',
      userId: user.id,
      request: { isActive: !user.isActive },
      username: user.username,
    });
    this.confirmOpen.set(true);
  }

  protected cancelMutation(): void {
    this.pending.set(null);
    void this.loadUsers();
  }

  protected confirmationTitle(): string {
    const action = this.pending();
    if (!action) return 'Confirm change';
    if (action.kind === 'create') return 'Create this user?';
    if (action.kind === 'reset') return `Reset ${action.username}'s password?`;
    return 'Apply this user change?';
  }

  protected confirmationDescription(): string {
    const action = this.pending();
    if (!action) return '';
    if (action.kind === 'create') {
      return `Create ${action.request.username} as an ${action.request.role === 'admin' ? 'administrator' : 'ordinary user'}.`;
    }
    if (action.kind === 'reset') {
      return 'The new password will not be shown again, and all sessions for this user will be revoked.';
    }
    if ('isActive' in action.request) {
      return `${action.username} will be ${action.request.isActive ? 'activated' : 'deactivated'}.`;
    }
    return `${action.username}'s role will change to ${action.request.role}.`;
  }

  protected confirmationActionLabel(): string {
    const action = this.pending();
    if (action?.kind === 'reset') return 'Reset password';
    if (action?.kind === 'update' && 'isActive' in action.request) {
      return action.request.isActive ? 'Activate user' : 'Deactivate user';
    }
    return action?.kind === 'create' ? 'Create user' : 'Apply change';
  }

  protected async confirmMutation(): Promise<void> {
    const action = this.pending();
    if (!action) return;
    this.confirmOpen.set(false);
    this.submitting.set(true);
    this.errorPresenter.dismiss();
    try {
      if (action.kind === 'create') {
        await firstValueFrom(this.sdk.users.create(action.request));
        this.toast.success({ title: 'User created' });
      } else if (action.kind === 'reset') {
        await firstValueFrom(this.sdk.users.resetPassword(action.userId, action.request));
        this.toast.success({
          title: 'Password reset',
          description: 'All target sessions were revoked.',
        });
      } else {
        await firstValueFrom(this.sdk.users.update(action.userId, action.request));
        this.toast.success({ title: 'User updated' });
      }
      this.pending.set(null);
      this.createModel.set({ username: '', password: '', role: 'user' });
      this.resetModel.set({ newPassword: '' });
      await this.loadUsers();
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
      this.pending.set(null);
      await this.loadUsers();
    } finally {
      this.submitting.set(false);
    }
  }
}
