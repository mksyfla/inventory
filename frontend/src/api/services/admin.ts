import { get, patch, post, put } from '../base';
import {
  AuditLogDTO,
  CreateUserPayload,
  PermissionDTO,
  RolePayload,
  RoleSummaryDTO,
  SettingsPayload,
  UpdateUserPayload,
  UserSummaryDTO,
} from '../dto';

export interface AuditLogParams {
  limit?: number;
  offset?: number;
}

export const adminService = {
  listUsers(): Promise<UserSummaryDTO[]> {
    return get<UserSummaryDTO[]>('/users');
  },

  createUser(payload: CreateUserPayload): Promise<{ id: number }> {
    return post<{ id: number }>('/users', payload);
  },

  updateUser(id: number, payload: UpdateUserPayload): Promise<{ id: number }> {
    return patch<{ id: number }>(`/users/${id}`, payload);
  },

  listRoles(): Promise<RoleSummaryDTO[]> {
    return get<RoleSummaryDTO[]>('/roles');
  },

  createRole(payload: RolePayload): Promise<{ id: number }> {
    return post<{ id: number }>('/roles', payload);
  },

  updateRole(id: number, payload: RolePayload): Promise<{ id: number }> {
    return patch<{ id: number }>(`/roles/${id}`, payload);
  },

  listPermissions(): Promise<PermissionDTO[]> {
    return get<PermissionDTO[]>('/permissions');
  },

  getSettings(): Promise<SettingsPayload> {
    return get<SettingsPayload>('/settings');
  },

  updateSettings(payload: SettingsPayload): Promise<{ updated: boolean }> {
    return put<{ updated: boolean }>('/settings', payload);
  },

  listAuditLogs(params: AuditLogParams = {}): Promise<AuditLogDTO[]> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return get<AuditLogDTO[]>(`/audit-logs${qs ? `?${qs}` : ''}`);
  },
};
