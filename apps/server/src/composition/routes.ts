/**
 * The one route list.
 *
 * Production registered these in `createServerApp` and the contract fixture
 * registered them again in `createApp`, in a different order, with a different
 * prefix, and missing four of them. Adding a route meant remembering both. Now
 * there is one list, and the surface decides what the transport level extras
 * are (spec 0056 AC-8).
 *
 * Order is load bearing. Feature routes come first, the protected catch all
 * after them so it only sees unmatched API paths, and the static asset handler
 * last so it only sees what is not an API path at all.
 */
import { realtimeJobEvent } from '../realtime/websocket';
import { registerAuditRoutes } from '../audit/routes';
import { registerAuthRoutes } from '../auth/routes';
import { registerBackupRoutes } from '../backup/routes';
import { registerConnectionRoutes } from '../connections/routes';
import { registerDataBrowserRoutes } from '../data-browser/routes';
import { registerDatabaseManagementRoutes } from '../database-management/routes';
import { registerExportRoutes } from '../export/routes';
import { registerImportRoutes } from '../import/routes';
import { registerJobsRoutes } from '../jobs/routes';
import { registerObjectExplorerRoutes } from '../object-explorer/routes';
import { registerProtectedApiGuard } from './guard';
import { registerQueryRoutes } from '../query/routes';
import { registerSchemaManagementRoutes } from '../schema-management/routes';
import { registerSecurityRoutes } from '../security/routes';
import { registerSettingsRoutes } from '../settings/routes';
import { registerSetupRoutes } from '../setup/routes';
import { registerTableDesignerRoutes } from '../table-designer/routes';
import { registerTableOperationsRoutes } from '../table-operations/routes';
import { registerUserRoutes } from '../users/routes';
import { registerViewRoutes } from '../view-management/routes';
import { registerWebSocketRoute } from '../realtime/routes';
import { registerWorkspaceRoutes } from '../workspace/routes';
import type { AnyElysia } from 'elysia';
import type { Lifecycle } from './lifecycle';
import type { ServerModules } from './modules';
import type { ServerSurface } from './surface';

/** Registers every route both assemblies share, then the surface extras. */
export function registerRoutes(
  application: AnyElysia,
  modules: ServerModules,
  surface: ServerSurface,
  lifecycle: Lifecycle,
): AnyElysia {
  const prefix = surface.prefix;
  const { authService, connectionManager, secureCookies, setupService } = modules;
  let current = application;

  current = registerSetupRoutes(current, prefix, setupService, modules.setupRateLimiter);
  current = registerAuthRoutes(current, prefix, setupService, authService, secureCookies, {
    closeForUser: (userId) => connectionManager?.closeForUser(userId) ?? Promise.resolve(),
  });
  current = registerSettingsRoutes(
    current,
    prefix,
    setupService,
    authService,
    modules.settingsService,
    secureCookies,
  );
  if (authService) {
    current = registerJobsRoutes(
      current,
      prefix,
      setupService,
      authService,
      secureCookies,
      modules.jobManager,
    );
  }
  current = registerAuditRoutes(
    current,
    prefix,
    setupService,
    authService,
    modules.auditRepository,
    secureCookies,
  );
  current = registerUserRoutes(
    current,
    prefix,
    setupService,
    authService,
    modules.userManagementService,
    secureCookies,
  );
  current = registerWorkspaceRoutes(
    current,
    prefix,
    setupService,
    authService,
    secureCookies,
    modules.workspaceService,
  );

  if (connectionManager && authService) {
    const base = { authService, setupService, connectionManager, secureCookies };
    current = registerConnectionRoutes(current, prefix, base);
    current = registerObjectExplorerRoutes(current, prefix, base);
    if (modules.securityService) {
      current = registerSecurityRoutes(current, prefix, {
        authService,
        setupService,
        securityService: modules.securityService,
        secureCookies,
      });
    }
    if (modules.databaseManagementService) {
      current = registerDatabaseManagementRoutes(current, prefix, {
        authService,
        setupService,
        service: modules.databaseManagementService,
        secureCookies,
      });
    }
    current = registerDataBrowserRoutes(current, prefix, {
      ...base,
      ...(modules.auditWriter ? { auditWriter: modules.auditWriter } : {}),
    });
    current = registerViewRoutes(current, prefix, {
      ...base,
      ...(modules.auditWriter ? { auditWriter: modules.auditWriter } : {}),
    });
    if (modules.schemaManagementService) {
      current = registerSchemaManagementRoutes(current, prefix, {
        authService,
        setupService,
        service: modules.schemaManagementService,
        secureCookies,
      });
    }
    if (modules.tableDesignerService) {
      current = registerTableDesignerRoutes(current, prefix, {
        authService,
        setupService,
        service: modules.tableDesignerService,
        secureCookies,
      });
    }
    if (modules.tableOperationsService) {
      current = registerTableOperationsRoutes(current, prefix, {
        authService,
        setupService,
        service: modules.tableOperationsService,
        secureCookies,
      });
    }
  }

  if (modules.queryExecutionService && authService) {
    current = registerQueryRoutes(current, prefix, {
      authService,
      setupService,
      queryService: modules.queryExecutionService,
      historyService: modules.queryHistoryService,
      secureCookies,
    });
  }
  if (modules.backupService && authService) {
    current = registerBackupRoutes(current, prefix, {
      authService,
      setupService,
      backupService: modules.backupService,
      restoreService: modules.restoreService,
      secureCookies,
    });
  }
  if (modules.exportService && authService) {
    current = registerExportRoutes(current, prefix, {
      authService,
      setupService,
      service: modules.exportService,
      secureCookies,
    });
  }
  if (modules.importService && authService) {
    current = registerImportRoutes(current, prefix, {
      authService,
      setupService,
      service: modules.importService,
      secureCookies,
      uploadRateLimiter: modules.importUploadRateLimiter,
    });
  }

  if (surface.realtime && authService && modules.realtimeHub) {
    const hub = modules.realtimeHub;
    current = registerWebSocketRoute(current, prefix, authService, hub);
    const stopJobEvents = modules.jobManager.subscribe((event) => {
      hub.publish(realtimeJobEvent(event));
    });
    lifecycle.register('realtime', 'job event subscription', stopJobEvents);
  }

  if (surface.guard) {
    current = registerProtectedApiGuard(current, prefix, setupService, authService, secureCookies);
  }

  return current;
}

/** The route paths this list registers, for the AC-8 comparison test. */
export function registeredRoutePaths(application: AnyElysia): readonly string[] {
  const routes = (application as unknown as { routes?: { method: string; path: string }[] }).routes;
  return (routes ?? []).map((route) => `${route.method} ${route.path}`).sort();
}
