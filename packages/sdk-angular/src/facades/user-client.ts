import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type UserListResponse =
  operations['listUsers']['responses'][200]['content']['application/json'];
export type CreateUserRequest =
  operations['createUser']['requestBody']['content']['application/json'];
export type UpdateUserRequest =
  operations['updateUser']['requestBody']['content']['application/json'];
export type ResetPasswordRequest =
  operations['resetUserPassword']['requestBody']['content']['application/json'];
export type ManagedUser = UserListResponse['items'][number];
export type ManagedUserResponse =
  operations['createUser']['responses'][201]['content']['application/json'];

export class UserClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(request: { page: number; pageSize: number }): Observable<UserListResponse> {
    const params = new URLSearchParams({
      page: String(request.page),
      pageSize: String(request.pageSize),
    });
    return this.transport.request<UserListResponse>({
      method: 'GET',
      path: `/users?${params.toString()}`,
      requiresSession: true,
    });
  }

  public create(request: CreateUserRequest): Observable<ManagedUserResponse> {
    return this.transport.request<ManagedUserResponse>({
      method: 'POST',
      path: '/users',
      body: request,
      requiresSession: true,
    });
  }

  public update(id: string, request: UpdateUserRequest): Observable<ManagedUserResponse> {
    return this.transport.request<ManagedUserResponse>({
      method: 'PATCH',
      path: `/users/${encodeURIComponent(id)}`,
      body: request,
      requiresSession: true,
    });
  }

  public resetPassword(id: string, request: ResetPasswordRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'POST',
        path: `/users/${encodeURIComponent(id)}/reset-password`,
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
