import React from 'react';
import { Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  // Login Guard Temporarily Bypassed for Testing
  return children ? <>{children}</> : <Outlet />;
};
