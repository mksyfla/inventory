import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PermissionGuard } from '../components/PermissionGuard';

import { ItemsPage } from '../pages/master/ItemsPage';
import { ItemFormPage } from '../pages/master/ItemFormPage';
import { WarehousesPage } from '../pages/master/WarehousesPage';
import { LocationsPage } from '../pages/master/LocationsPage';
import { PartnersPage } from '../pages/master/PartnersPage';

import { ReceiptsPage } from '../pages/inbound/ReceiptsPage';
import { ReceiptDetailPage } from '../pages/inbound/ReceiptDetailPage';
import { ReceiptFormPage } from '../pages/inbound/ReceiptFormPage';
import { PutawayPage } from '../pages/inbound/PutawayPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/403',
    element: <ForbiddenPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: (
          <PermissionGuard permission="dashboard.read">
            <DashboardPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/items',
        element: (
          <PermissionGuard permission="item.read">
            <ItemsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/items/new',
        element: (
          <PermissionGuard permission="item.write">
            <ItemFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/items/:id/edit',
        element: (
          <PermissionGuard permission="item.write">
            <ItemFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/warehouses',
        element: (
          <PermissionGuard permission="location.read">
            <WarehousesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/locations',
        element: (
          <PermissionGuard permission="location.read">
            <LocationsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'master/partners',
        element: (
          <PermissionGuard permission="partner.read">
            <PartnersPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/receipts',
        element: (
          <PermissionGuard permission="grn.read">
            <ReceiptsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/receipts/new',
        element: (
          <PermissionGuard permission="grn.create">
            <ReceiptFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/receipts/:id',
        element: (
          <PermissionGuard permission="grn.read">
            <ReceiptDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/receipts/:id/edit',
        element: (
          <PermissionGuard permission="grn.create">
            <ReceiptFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/putaway',
        element: (
          <PermissionGuard permission="grn.putaway">
            <PutawayPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/receipts/:id/putaway',
        element: (
          <PermissionGuard permission="grn.putaway">
            <PutawayPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'inbound/*',
        element: (
          <PermissionGuard permission="grn.read">
            <ReceiptsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/*',
        element: (
          <PermissionGuard permission="do.read">
            <div style={{ padding: 24, background: '#fff' }}>Halaman Outbound Pengeluaran (FE-301)</div>
          </PermissionGuard>
        ),
      },
      {
        path: 'stock/*',
        element: (
          <PermissionGuard permission="stock.read">
            <div style={{ padding: 24, background: '#fff' }}>Halaman Stok & Ledger (FE-501)</div>
          </PermissionGuard>
        ),
      },
      {
        path: 'counting/*',
        element: (
          <PermissionGuard permission="count.create">
            <div style={{ padding: 24, background: '#fff' }}>Halaman Stock Opname (FE-601)</div>
          </PermissionGuard>
        ),
      },
      {
        path: 'reports/*',
        element: (
          <PermissionGuard permission="report.read">
            <div style={{ padding: 24, background: '#fff' }}>Halaman Laporan (FE-701)</div>
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/*',
        element: (
          <PermissionGuard permission="admin.user">
            <div style={{ padding: 24, background: '#fff' }}>Halaman Administrasi RBAC (FE-801)</div>
          </PermissionGuard>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
