// Generated from packages/api-contract/openapi/v1/openapi.yaml. Do not edit.

import type { AuthorizationMatrixRow } from '../../../scripts/security/generate-authorization-matrix';

// prettier-ignore
export const authorizationMatrix: readonly AuthorizationMatrixRow[] = [
  {
    "operationId": "applySecurityGrants",
    "method": "POST",
    "path": "/security/grants/apply",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "applyTableDdl",
    "method": "POST",
    "path": "/tables/ddl/apply",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "cancelJob",
    "method": "POST",
    "path": "/jobs/{id}/cancel",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "cancelQueryExecution",
    "method": "POST",
    "path": "/query/executions/{id}/cancel",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "changePassword",
    "method": "POST",
    "path": "/auth/change-password",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "closeQuerySession",
    "method": "POST",
    "path": "/query/sessions/{id}/close",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "connectConnection",
    "method": "POST",
    "path": "/connections/{id}/connect",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "createBackup",
    "method": "POST",
    "path": "/backup",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "createConnection",
    "method": "POST",
    "path": "/connections",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createDatabase",
    "method": "POST",
    "path": "/connections/{id}/databases",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createExport",
    "method": "POST",
    "path": "/export",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "createImportCsv",
    "method": "POST",
    "path": "/import/csv",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "createImportSql",
    "method": "POST",
    "path": "/import/sql",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "createInitialAdmin",
    "method": "POST",
    "path": "/setup/admin",
    "anonymous": 201,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createRestore",
    "method": "POST",
    "path": "/restore",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "createSavedQuery",
    "method": "POST",
    "path": "/query/saved",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createSchema",
    "method": "POST",
    "path": "/connections/{id}/databases/{db}/schemas",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createSecurityPrincipal",
    "method": "POST",
    "path": "/security/principals",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createServerGroup",
    "method": "POST",
    "path": "/server-groups",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "createUser",
    "method": "POST",
    "path": "/users",
    "anonymous": 401,
    "user": 403,
    "admin": 201
  },
  {
    "operationId": "createView",
    "method": "POST",
    "path": "/views",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "deleteBackup",
    "method": "DELETE",
    "path": "/backups/{id}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteConnection",
    "method": "DELETE",
    "path": "/connections/{id}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteDataRows",
    "method": "POST",
    "path": "/data/rows/delete",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "deleteQueryHistory",
    "method": "DELETE",
    "path": "/query/history",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteQueryHistoryEntry",
    "method": "DELETE",
    "path": "/query/history/{id}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteSavedQuery",
    "method": "DELETE",
    "path": "/query/saved/{id}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteServerGroup",
    "method": "DELETE",
    "path": "/server-groups/{id}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "deleteView",
    "method": "DELETE",
    "path": "/views/{ref}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "describeExplorerObject",
    "method": "GET",
    "path": "/connections/{id}/objects/describe",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "describeSecurityPrincipalForm",
    "method": "GET",
    "path": "/security/principals/form",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "disconnectConnection",
    "method": "POST",
    "path": "/connections/{id}/disconnect",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "downloadBackup",
    "method": "GET",
    "path": "/backups/{id}/download",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "downloadExport",
    "method": "GET",
    "path": "/export/{id}/download",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "dropDatabase",
    "method": "DELETE",
    "path": "/connections/{id}/databases/{db}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "dropSchema",
    "method": "DELETE",
    "path": "/connections/{id}/databases/{db}/schemas/{name}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "dropSecurityPrincipal",
    "method": "DELETE",
    "path": "/security/principals/{name}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "dropTable",
    "method": "DELETE",
    "path": "/tables/drop",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "duplicateConnection",
    "method": "POST",
    "path": "/connections/{id}/duplicate",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "explainQuery",
    "method": "POST",
    "path": "/query/explain",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getAuditActions",
    "method": "GET",
    "path": "/audit/actions",
    "anonymous": 401,
    "user": 403,
    "admin": 200
  },
  {
    "operationId": "getBackupCapability",
    "method": "GET",
    "path": "/backup/capability",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getConnectionStatus",
    "method": "GET",
    "path": "/connections/status",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getConnectionStatusInfo",
    "method": "GET",
    "path": "/connections/{id}/status-info",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getCurrentUser",
    "method": "GET",
    "path": "/auth/me",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getDatabaseCreateOptions",
    "method": "GET",
    "path": "/connections/{id}/databases/options",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getDatabaseProperties",
    "method": "GET",
    "path": "/connections/{id}/databases/{db}/properties",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getExport",
    "method": "GET",
    "path": "/export/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getHealth",
    "method": "GET",
    "path": "/health",
    "anonymous": 200,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getJob",
    "method": "GET",
    "path": "/jobs/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getPreferences",
    "method": "GET",
    "path": "/preferences",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getQueryExecution",
    "method": "GET",
    "path": "/query/executions/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getQueryMetadata",
    "method": "GET",
    "path": "/query/metadata",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getSecurityPrivilegeCatalog",
    "method": "GET",
    "path": "/security/privileges/catalog",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getSettings",
    "method": "GET",
    "path": "/settings",
    "anonymous": 401,
    "user": 403,
    "admin": 200
  },
  {
    "operationId": "getSetupStatus",
    "method": "GET",
    "path": "/setup/status",
    "anonymous": 200,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getTableDesignerTypes",
    "method": "POST",
    "path": "/tables/ddl/types",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getTableDestructiveImpact",
    "method": "POST",
    "path": "/tables/impact",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getView",
    "method": "GET",
    "path": "/views/{ref}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "getWorkspace",
    "method": "GET",
    "path": "/workspace",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "insertDataRow",
    "method": "POST",
    "path": "/data/rows",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listBackups",
    "method": "GET",
    "path": "/backups",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listConnections",
    "method": "GET",
    "path": "/connections",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listExplorerDatabaseChildren",
    "method": "GET",
    "path": "/connections/{id}/databases/{db}/children",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listExplorerDatabases",
    "method": "GET",
    "path": "/connections/{id}/databases",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listExplorerSchemaObjects",
    "method": "GET",
    "path": "/connections/{id}/schemas/{schema}/objects",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listJobs",
    "method": "GET",
    "path": "/jobs",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listQueryHistory",
    "method": "GET",
    "path": "/query/history",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listSavedQueries",
    "method": "GET",
    "path": "/query/saved",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listSecurityPrincipalGrants",
    "method": "GET",
    "path": "/security/principals/{name}/grants",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listSecurityPrincipals",
    "method": "GET",
    "path": "/security/principals",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listServerGroups",
    "method": "GET",
    "path": "/server-groups",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "listUsers",
    "method": "GET",
    "path": "/users",
    "anonymous": 401,
    "user": 403,
    "admin": 200
  },
  {
    "operationId": "listViews",
    "method": "GET",
    "path": "/views",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "login",
    "method": "POST",
    "path": "/auth/login",
    "anonymous": 200,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "logout",
    "method": "POST",
    "path": "/auth/logout",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "previewImport",
    "method": "GET",
    "path": "/import/preview",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "previewSecurityGrants",
    "method": "POST",
    "path": "/security/grants/preview",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "previewTableDdl",
    "method": "POST",
    "path": "/tables/ddl/preview",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "previewViewDdl",
    "method": "POST",
    "path": "/views/ddl/preview",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "previewViewDrop",
    "method": "POST",
    "path": "/views/ddl/drop-preview",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "queryAudit",
    "method": "GET",
    "path": "/audit",
    "anonymous": 401,
    "user": 403,
    "admin": 200
  },
  {
    "operationId": "readData",
    "method": "POST",
    "path": "/data/read",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "reconnectConnection",
    "method": "POST",
    "path": "/connections/{id}/reconnect",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "renameSchema",
    "method": "PATCH",
    "path": "/connections/{id}/databases/{db}/schemas/{name}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "renameTable",
    "method": "POST",
    "path": "/tables/rename",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "resetSecurityPrincipalPassword",
    "method": "POST",
    "path": "/security/principals/{name}/reset-password",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "resetUserPassword",
    "method": "POST",
    "path": "/users/{id}/reset-password",
    "anonymous": 401,
    "user": 403,
    "admin": 204
  },
  {
    "operationId": "saveWorkspace",
    "method": "PUT",
    "path": "/workspace",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "searchExplorerObjects",
    "method": "GET",
    "path": "/connections/{id}/search",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "startQueryExecution",
    "method": "POST",
    "path": "/query/executions",
    "anonymous": 401,
    "user": 202,
    "admin": 202
  },
  {
    "operationId": "testConnection",
    "method": "POST",
    "path": "/connections/test",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "truncateTable",
    "method": "POST",
    "path": "/tables/truncate",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "updateConnection",
    "method": "PATCH",
    "path": "/connections/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "updateDataRow",
    "method": "PATCH",
    "path": "/data/rows",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "updatePreference",
    "method": "PUT",
    "path": "/preferences/{key}",
    "anonymous": 401,
    "user": 204,
    "admin": 204
  },
  {
    "operationId": "updateSavedQuery",
    "method": "PATCH",
    "path": "/query/saved/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "updateSecurityPrincipal",
    "method": "PATCH",
    "path": "/security/principals/{name}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "updateServerGroup",
    "method": "PATCH",
    "path": "/server-groups/{id}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "updateSetting",
    "method": "PUT",
    "path": "/settings/{key}",
    "anonymous": 401,
    "user": 403,
    "admin": 204
  },
  {
    "operationId": "updateUser",
    "method": "PATCH",
    "path": "/users/{id}",
    "anonymous": 401,
    "user": 403,
    "admin": 200
  },
  {
    "operationId": "updateView",
    "method": "PUT",
    "path": "/views/{ref}",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "uploadImport",
    "method": "POST",
    "path": "/import/upload",
    "anonymous": 401,
    "user": 201,
    "admin": 201
  },
  {
    "operationId": "validateRestore",
    "method": "POST",
    "path": "/restore/validate",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  },
  {
    "operationId": "validateViewDefinition",
    "method": "POST",
    "path": "/views/ddl/validate",
    "anonymous": 401,
    "user": 200,
    "admin": 200
  }
];
