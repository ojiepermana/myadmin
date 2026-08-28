import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import {
  CardComponent,
  CardContentComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { type AppRouteDefinition } from '../../app.routes.shared';

@Component({
  selector: 'app-route-placeholder',
  imports: [
    BadgeComponent,
    CardComponent,
    CardContentComponent,
    CardHeaderComponent,
    CardTitleComponent,
  ],
  templateUrl: './route-placeholder.html',
  styleUrl: './route-placeholder.scss',
})
export class RoutePlaceholder {
  private readonly route = inject(ActivatedRoute);
  protected readonly definition = this.route.snapshot.data as AppRouteDefinition;
}
