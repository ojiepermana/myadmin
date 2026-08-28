import { Component, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import {
  NativeSelectComponent,
  NativeSelectOptionDirective,
} from '@ojiepermana/angular/component/native-select';
import {
  ResizableHandleComponent,
  ResizablePanelComponent,
  ResizablePanelGroupComponent,
} from '@ojiepermana/angular/component/resizable';
import { SkeletonComponent } from '@ojiepermana/angular/component/skeleton';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import { SwitchComponent } from '@ojiepermana/angular/component/switch';
import {
  TableBodyComponent,
  TableCellComponent,
  TableComponent,
  TableHeadComponent,
  TableHeaderComponent,
  TableRowComponent,
} from '@ojiepermana/angular/component/table';
import {
  TabsComponent,
  TabsContentComponent,
  TabsListComponent,
  TabsTriggerComponent,
} from '@ojiepermana/angular/component/tabs';
import { ToastService } from '@ojiepermana/angular/component/toast';
import type { ThemeMode } from '@ojiepermana/angular/theme/styles';
import { ThemePreferenceStore } from '../../core/theme/theme-preference.store';

interface CapabilityRow {
  readonly name: string;
  readonly status: 'Ready' | 'Composed';
  readonly usage: string;
}

@Component({
  selector: 'app-ui-foundation-demo',
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
    FormsModule,
    TitleCasePipe,
    InputComponent,
    NativeSelectComponent,
    NativeSelectOptionDirective,
    ResizableHandleComponent,
    ResizablePanelComponent,
    ResizablePanelGroupComponent,
    SkeletonComponent,
    SpinnerComponent,
    SwitchComponent,
    TableBodyComponent,
    TableCellComponent,
    TableComponent,
    TableHeadComponent,
    TableHeaderComponent,
    TableRowComponent,
    TabsComponent,
    TabsContentComponent,
    TabsListComponent,
    TabsTriggerComponent,
  ],
  templateUrl: './ui-foundation-demo.html',
})
export class UiFoundationDemo {
  private readonly toast = inject(ToastService);
  protected readonly themePreference = inject(ThemePreferenceStore);
  protected readonly activeTab = signal<string | null>('overview');
  protected readonly showDetails = signal(true);

  protected readonly modes: readonly ThemeMode[] = ['system', 'light', 'dark'];
  protected readonly capabilities: readonly CapabilityRow[] = [
    { name: 'Button', status: 'Ready', usage: 'button[Button]' },
    { name: 'Input and form', status: 'Composed', usage: 'Input + native labels' },
    { name: 'Table and data grid', status: 'Composed', usage: 'Table + pagination' },
    { name: 'Feedback', status: 'Ready', usage: 'Alert, Toast, Spinner' },
    { name: 'Resizable panel', status: 'Ready', usage: 'ResizablePanelGroup' },
  ];

  protected setMode(mode: ThemeMode): void {
    this.themePreference.setMode(mode);
  }

  protected showToast(): void {
    this.toast.success({
      title: 'Theme preference saved',
      description: 'The foundation updates immediately and keeps the choice locally.',
      durationMs: 3200,
    });
  }
}
