import { Component } from '@angular/core';
import { AppShell } from './layout/app-shell/app-shell';

@Component({
  selector: 'app-root',
  imports: [AppShell],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
