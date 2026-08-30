import '@angular/compiler';
import { describe, expect, test } from 'bun:test';
import { createAppRoutes, V1_ROUTE_DEFINITIONS } from '../../apps/web/src/app/app.routes.shared';

describe('app shell route acceptance', () => {
  test('IT-0015-AC5 defines every V1 feature as a lazy route', () => {
    const routes = createAppRoutes(false);
    const routeByPath = new Map(routes.map((route) => [route.path, route]));

    for (const definition of V1_ROUTE_DEFINITIONS) {
      const route = routeByPath.get(definition.path);
      expect(route, `${definition.id} route is missing`).toBeDefined();
      expect(route?.loadComponent, `${definition.id} must be lazy`).toEqual(expect.any(Function));
      expect(route?.data).toEqual(definition);
    }
  });
});
