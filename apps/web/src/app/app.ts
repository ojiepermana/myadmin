import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { moduleName as sdkModule } from '@myadmin/sdk-angular';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly moduleName = sdkModule;
}
