import { Component, inject } from '@angular/core';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import { ErrorPresenterService } from './error-presenter.service';

@Component({
  selector: 'app-feature-error-boundary',
  imports: [ButtonComponent],
  templateUrl: './feature-error-boundary.html',
  styleUrl: './feature-error-boundary.scss',
})
export class FeatureErrorBoundaryComponent {
  protected readonly errorPresenter = inject(ErrorPresenterService);
}
