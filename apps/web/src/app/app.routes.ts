import type { Routes } from '@angular/router';
import { environment } from '../environments/environment';
import { createAppRoutes } from './app.routes.shared';

export const routes: Routes = createAppRoutes(environment.devDemo);
