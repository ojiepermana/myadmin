import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  NavigationContainerComponent,
  NavigationContentComponent,
  NavigationFooterComponent,
  NavigationFooterInitialComponent,
  NavigationFooterTitleComponent,
  NavigationHeaderComponent,
  NavigationHeaderInitialComponent,
  NavigationHeaderTitleComponent,
  NavigationIconDirective,
  NavigationSidebarComponent,
} from '@ojiepermana/angular/navigation';
import { ContextMenuTriggerDirective } from '@ojiepermana/angular/component/context-menu';
import {
  DialogCloseDirective,
  DialogComponent,
  DialogContentComponent,
  DialogDescriptionComponent,
  DialogFooterComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
} from '@ojiepermana/angular/component/dialog';
import {
  MenuContentDirective,
  MenuGroupComponent,
  MenuItemComponent,
  MenuLabelComponent,
  MenuSeparatorComponent,
  MenuSurfaceComponent,
  MenuTriggerDirective,
} from '@ojiepermana/angular/component/dropdown-menu';
import {
  ResizableHandleComponent,
  ResizablePanelComponent,
  ResizablePanelGroupComponent,
} from '@ojiepermana/angular/component/resizable';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  TabsComponent,
  TabsContentComponent,
  TabsListComponent,
  TabsTriggerComponent,
} from '@ojiepermana/angular/component/tabs';
import { ThemePreferenceStore } from '../../core/theme/theme-preference.store';
import { AppContextMenuDirective } from '../../core/context-menu/context-menu.directive';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';
import { FeatureErrorBoundaryComponent } from '../../core/errors/feature-error-boundary';
import { WorkspaceStore, type TabDescriptor } from '../../core/state/workspace.store';
import { AuthSessionStore } from '../../core/auth/auth-session.store';
import { DEV_ROUTE, V1_ROUTE_DEFINITIONS, type AppRouteDefinition } from '../../app.routes.shared';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-shell',
  imports: [
    AppContextMenuDirective,
    ButtonComponent,
    ContextMenuTriggerDirective,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
    FeatureErrorBoundaryComponent,
    MenuContentDirective,
    MenuGroupComponent,
    MenuItemComponent,
    MenuLabelComponent,
    MenuSeparatorComponent,
    MenuSurfaceComponent,
    MenuTriggerDirective,
    NavigationContainerComponent,
    NavigationContentComponent,
    NavigationFooterComponent,
    NavigationFooterInitialComponent,
    NavigationFooterTitleComponent,
    NavigationHeaderComponent,
    NavigationHeaderInitialComponent,
    NavigationHeaderTitleComponent,
    NavigationIconDirective,
    NavigationSidebarComponent,
    ResizableHandleComponent,
    ResizablePanelComponent,
    ResizablePanelGroupComponent,
    RouterLink,
    RouterOutlet,
    TabsComponent,
    TabsContentComponent,
    TabsListComponent,
    TabsTriggerComponent,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly themePreference = inject(ThemePreferenceStore);
  protected readonly errorPresenter = inject(ErrorPresenterService);
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly authSession = inject(AuthSessionStore);
  private readonly sdk = inject(MyadminSdk);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mobileViewport = signal(false);

  protected readonly mobileSidebarOpen = signal(false);
  protected readonly isMobileViewport = this.mobileViewport.asReadonly();
  protected readonly shortcutsOpen = signal(false);
  protected readonly activeTabId = computed(() => this.workspace.activeTabId());
  protected readonly mainPanelHeight = computed(() =>
    this.workspace.bottomCollapsed() ? 100 : 100 - this.workspace.bottomHeight(),
  );
  protected readonly navigationItems = this.createNavigationItems();

  constructor() {
    const matchMedia = this.document.defaultView?.matchMedia;
    const media =
      typeof matchMedia === 'function'
        ? matchMedia.call(this.document.defaultView, '(max-width: 1023px)')
        : undefined;
    this.mobileViewport.set(media?.matches ?? false);
    media?.addEventListener('change', this.handleViewportChange);
    this.destroyRef.onDestroy(() =>
      media?.removeEventListener('change', this.handleViewportChange),
    );

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.syncRouteTab(event.urlAfterRedirects));

    effect(() => {
      if (!this.mobileViewport()) {
        this.mobileSidebarOpen.set(false);
      }
    });
  }

  protected toggleSidebar(): void {
    if (this.mobileViewport()) {
      this.mobileSidebarOpen.update((open) => !open);
      return;
    }
    this.workspace.toggleSidebar();
  }

  protected closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  protected toggleTheme(): void {
    this.themePreference.setMode(this.themePreference.resolvedMode() === 'dark' ? 'light' : 'dark');
  }

  protected openTab(definition: AppRouteDefinition): void {
    this.workspace.openTab(this.toTab(definition));
    this.closeMobileSidebar();
    void this.router.navigateByUrl(`/${definition.path}`);
  }

  protected onTabValueChange(tabId: string | null): void {
    if (!tabId) {
      return;
    }
    const tab = this.workspace.activateTab(tabId);
    if (tab) {
      void this.router.navigateByUrl(this.routeForTab(tab));
    }
  }

  protected closeTab(event: Event, tab: TabDescriptor): void {
    event.preventDefault();
    event.stopPropagation();
    const nextTab = this.workspace.closeTab(tab.id);
    if (nextTab) {
      void this.router.navigateByUrl(this.routeForTab(nextTab));
    }
  }

  protected captureSidebarWidth(): void {
    this.capturePanelSize('sidebar', 'sidebar-panel', (size) =>
      this.workspace.setSidebarWidth(size),
    );
  }

  protected captureBottomHeight(): void {
    this.capturePanelSize('workspace', 'bottom-panel', (size) =>
      this.workspace.setBottomHeight(size),
    );
  }

  protected onBottomPanelToggle(): void {
    this.workspace.toggleBottomPanel();
  }

  protected onLogout(): void {
    void firstValueFrom(this.sdk.auth.logout())
      .then(() => {
        this.authSession.clear();
        return this.router.navigateByUrl('/login', { replaceUrl: true });
      })
      .catch((error: unknown) => this.errorPresenter.presentUnknown(error));
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  @HostListener('document:pointerup')
  protected capturePointerPanelSize(): void {
    this.captureSidebarWidth();
    this.captureBottomHeight();
  }

  private readonly handleViewportChange = (event: MediaQueryListEvent): void => {
    this.mobileViewport.set(event.matches);
  };

  private syncRouteTab(url: string): void {
    const path = (url.split(/[?#]/, 1)[0] ?? '').replace(/^\/+/, '');
    const definition = [DEV_ROUTE, ...V1_ROUTE_DEFINITIONS].find((item) => item.path === path);
    if (definition) {
      this.workspace.openTab(this.toTab(definition));
    }
  }

  private toTab(definition: AppRouteDefinition): TabDescriptor {
    return {
      id: definition.id,
      type: definition.type,
      title: definition.title,
      context: { route: `/${definition.path}` },
    };
  }

  private routeForTab(tab: TabDescriptor): string {
    const route = tab.context['route'];
    return typeof route === 'string' ? route : '/workspace';
  }

  private createNavigationItems() {
    const find = (id: string): AppRouteDefinition => {
      const definition = V1_ROUTE_DEFINITIONS.find((item) => item.id === id);
      if (!definition) {
        throw new Error(`Unknown navigation route: ${id}`);
      }
      return definition;
    };

    const item = (id: string) => {
      const definition = find(id);
      return {
        id: definition.id,
        title: definition.title,
        icon: definition.id,
        action: () => this.openTab(definition),
      };
    };

    return [
      {
        id: 'operate',
        type: 'group' as const,
        title: 'Operate',
        children: [item('workspace'), item('connections'), item('explorer'), item('query-editor')],
      },
      {
        id: 'build',
        type: 'group' as const,
        title: 'Build',
        children: [item('database'), item('schema'), item('table-designer'), item('data-browser')],
      },
      {
        id: 'review',
        type: 'group' as const,
        title: 'Review',
        children: [item('query-history'), item('monitoring'), item('audit')],
      },
      {
        id: 'admin',
        type: 'group' as const,
        title: 'Admin',
        children: [
          item('security'),
          item('import-export'),
          item('backup-restore'),
          item('settings'),
        ],
      },
    ] as const;
  }

  private capturePanelSize(splitId: string, panelId: string, update: (size: number) => void): void {
    const host = this.host.nativeElement as HTMLElement;
    const group = host.querySelector(`[data-split="${splitId}"]`) as HTMLElement | null;
    const panel = group?.querySelector(`[data-panel-id="${panelId}"]`) as HTMLElement | null;
    if (!group || !panel) {
      return;
    }

    const groupSize =
      splitId === 'sidebar'
        ? group.getBoundingClientRect().width
        : group.getBoundingClientRect().height;
    const panelSize =
      splitId === 'sidebar'
        ? panel.getBoundingClientRect().width
        : panel.getBoundingClientRect().height;
    if (groupSize > 0) {
      update((panelSize / groupSize) * 100);
    }
  }
}
