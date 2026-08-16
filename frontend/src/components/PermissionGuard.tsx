import React from 'react';
import { PermissionCode, UserRole } from '../types/user';
import { useAuthStore } from '../store/useAuthStore';
import { ForbiddenPage } from '../pages/ForbiddenPage';

interface PermissionGuardProps {
  permission?: PermissionCode;
  role?: UserRole;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  role,
  fallback,
  children,
}) => {
  const { hasPermission, hasRole } = useAuthStore();

  let isAllowed = true;

  if (permission && !hasPermission(permission)) {
    isAllowed = false;
  }

  if (role && !hasRole(role)) {
    isAllowed = false;
  }

  if (!isAllowed) {
    return fallback !== undefined ? <>{fallback}</> : <ForbiddenPage />;
  }

  return <>{children}</>;
};
