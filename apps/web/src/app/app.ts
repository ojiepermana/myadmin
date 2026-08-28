import { Component } from '@angular/core';
import { moduleName as sdkModule } from '@myadmin/sdk-angular';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly moduleName = sdkModule;
}
