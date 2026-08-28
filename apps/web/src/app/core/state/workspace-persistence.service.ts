import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '@ojiepermana/angular/component/toast';
import { MyadminSdk, type SaveWorkspaceRequest, type WorkspaceNotice } from '@myadmin/sdk-angular';
import { WORKSPACE_SAVE_DEBOUNCE_MS } from '@myadmin/workspace';
import { firstValueFrom } from 'rxjs';
import { ErrorPresenterService } from '../errors/error-presenter.service';
import { WorkspaceStore } from './workspace.store';

@Injectable({ providedIn: 'root' })
export class WorkspacePersistenceService {
  private readonly document = inject(DOCUMENT);
  private readonly sdk = inject(MyadminSdk);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceStore);
  private readonly errorPresenter = inject(ErrorPresenterService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userId = signal<string | null>(null);
  private restoring = false;
  private restorePromise: Promise<void> | null = null;
  private restoreGeneration = 0;
  private timer: number | undefined;
  private lastPersisted: string | null = null;

  constructor() {
    const view = this.document.defaultView;
    view?.addEventListener('beforeunload', this.handleBeforeUnload);
    this.destroyRef.onDestroy(() => {
      this.cancelScheduledSave();
      view?.removeEventListener('beforeunload', this.handleBeforeUnload);
    });

    effect(() => {
      const userId = this.userId();
      const snapshot = this.workspace.persistenceSnapshot();
      if (userId === null || this.restoring) return;

      const serialized = serialize(snapshot);
      if (serialized === this.lastPersisted) return;
      this.scheduleSave();
    });
  }

  async restore(
    userId: string,
    options: { readonly navigateToRestoredRoute?: boolean } = {},
  ): Promise<void> {
    if (this.userId() === userId) {
      if (this.restorePromise) return this.restorePromise;
      if (!this.restoring) return;
    }

    const promise = this.restoreUser(userId, options);
    this.restorePromise = promise;
    try {
      await promise;
    } finally {
      if (this.restorePromise === promise) this.restorePromise = null;
    }
  }

  private async restoreUser(
    userId: string,
    options: { readonly navigateToRestoredRoute?: boolean },
  ): Promise<void> {
    const generation = ++this.restoreGeneration;
    this.cancelScheduledSave();
    this.restoring = true;
    this.userId.set(userId);
    this.lastPersisted = null;
    this.workspace.reset();

    try {
      const response = await firstValueFrom(this.sdk.workspace.load());
      if (generation !== this.restoreGeneration || this.userId() !== userId) return;
      const restore = this.workspace.restore(response.state);
      this.lastPersisted = serialize(this.workspace.persistenceSnapshot());
      this.showRestoreNotice(response.notice ?? restore.notice, response.skippedTabs);

      const activeTab = this.workspace.activeTab();
      const route = activeTab
        ? activeTab.type === 'query-editor'
          ? `/query-editor?tab=${encodeURIComponent(activeTab.id)}`
          : activeTab.context['route']
        : undefined;
      if (
        options.navigateToRestoredRoute &&
        typeof route === 'string' &&
        route !== this.router.url
      ) {
        await this.router.navigateByUrl(route);
      }
    } catch (error) {
      if (generation !== this.restoreGeneration || this.userId() !== userId) return;
      this.lastPersisted = serialize(this.workspace.persistenceSnapshot());
      this.errorPresenter.presentUnknown(error);
    } finally {
      if (generation === this.restoreGeneration) this.restoring = false;
    }
  }

  async flush(): Promise<void> {
    this.cancelScheduledSave();
    const userId = this.userId();
    if (userId === null || this.restoring) return;

    const snapshot = this.workspace.persistenceSnapshot();
    const serialized = serialize(snapshot);
    if (serialized === this.lastPersisted) return;

    try {
      await firstValueFrom(this.sdk.workspace.save(snapshot as SaveWorkspaceRequest));
      this.lastPersisted = serialized;
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    }
  }

  clear(): void {
    this.restoreGeneration += 1;
    this.cancelScheduledSave();
    this.restoring = false;
    this.lastPersisted = null;
    this.userId.set(null);
  }

  private scheduleSave(): void {
    const view = this.document.defaultView;
    if (!view) return;
    this.cancelScheduledSave();
    this.timer = view.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }

  private cancelScheduledSave(): void {
    const view = this.document.defaultView;
    if (this.timer === undefined) return;
    view?.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private readonly handleBeforeUnload = (): void => {
    void this.flush();
  };

  private showRestoreNotice(notice: WorkspaceNotice | null | undefined, skippedTabs: number): void {
    if (skippedTabs > 0) {
      this.toast.info({
        title: 'Workspace restored',
        description: `${skippedTabs} ${skippedTabs === 1 ? 'tab was' : 'tabs were'} skipped because the connection is no longer available.`,
        durationMs: 5_000,
      });
    }
    if (notice === undefined || notice === null) return;

    const descriptions: Record<WorkspaceNotice, string> = {
      'unknown-version':
        'The saved workspace version is not supported, so a fresh workspace was loaded.',
      'invalid-state': 'The saved workspace was invalid, so a fresh workspace was loaded.',
      'too-large': 'The saved workspace was too large, so a fresh workspace was loaded.',
    };
    this.toast.warning({
      title: 'Workspace reset',
      description: descriptions[notice],
      durationMs: 5_000,
    });
  }
}

function serialize(value: SaveWorkspaceRequest): string {
  return JSON.stringify(value);
}
