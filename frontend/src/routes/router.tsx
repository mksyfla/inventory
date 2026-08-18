import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { AppLayout } from '../layouts/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
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

import { RequestsPage } from '../pages/outbound/RequestsPage';
import { RequestDetailPage } from '../pages/outbound/RequestDetailPage';
import { RequestFormPage } from '../pages/outbound/RequestFormPage';
import { DeliveriesPage } from '../pages/outbound/DeliveriesPage';
import { DeliveryDetailPage } from '../pages/outbound/DeliveryDetailPage';
import { PickingScanPage } from '../pages/outbound/PickingScanPage';

import { TransfersPage } from '../pages/transfer/TransfersPage';
import { TransferFormPage } from '../pages/transfer/TransferFormPage';
import { TransferDetailPage } from '../pages/transfer/TransferDetailPage';

import { StockBalancesPage } from '../pages/stock/StockBalancesPage';
import { StockCardPage } from '../pages/stock/StockCardPage';
import { BatchTracePage } from '../pages/stock/BatchTracePage';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage';

import { CountingSessionsPage } from '../pages/counting/CountingSessionsPage';
import { CountExecutePage } from '../pages/counting/CountExecutePage';
import { CountingDetailPage } from '../pages/counting/CountingDetailPage';
import { AdjustmentFormPage } from '../pages/counting/AdjustmentFormPage';

import { InventoryValuationPage } from '../pages/reports/InventoryValuationPage';
import { FsnAnalysisPage } from '../pages/reports/FsnAnalysisPage';
import { SpaceUtilizationPage } from '../pages/reports/SpaceUtilizationPage';

import { UsersPage } from '../pages/admin/UsersPage';
import { RolesPage } from '../pages/admin/RolesPage';
import { SettingsPage } from '../pages/admin/SettingsPage';

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
        path: 'master/*',
        element: (
          <PermissionGuard permission="item.read">
            <ItemsPage />
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
        path: 'outbound/requests',
        element: (
          <PermissionGuard permission="request.read">
            <RequestsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/requests/new',
        element: (
          <PermissionGuard permission="request.create">
            <RequestFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/requests/:id',
        element: (
          <PermissionGuard permission="request.read">
            <RequestDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/requests/:id/edit',
        element: (
          <PermissionGuard permission="request.create">
            <RequestFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/deliveries',
        element: (
          <PermissionGuard permission="do.read">
            <DeliveriesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/deliveries/:id',
        element: (
          <PermissionGuard permission="do.read">
            <DeliveryDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/deliveries/:id/picking',
        element: (
          <PermissionGuard permission="do.read">
            <PickingScanPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/deliveries/picking',
        element: (
          <PermissionGuard permission="do.read">
            <PickingScanPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'outbound/*',
        element: (
          <PermissionGuard permission="do.read">
            <DeliveriesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'transfer',
        element: (
          <PermissionGuard permission="transfer.create">
            <TransfersPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'transfer/new',
        element: (
          <PermissionGuard permission="transfer.create">
            <TransferFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'transfer/:id',
        element: (
          <PermissionGuard permission="transfer.create">
            <TransferDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'transfer/*',
        element: (
          <PermissionGuard permission="transfer.create">
            <TransfersPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'stock/balances',
        element: (
          <PermissionGuard permission="stock.read">
            <StockBalancesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'stock/card',
        element: (
          <PermissionGuard permission="stock.read">
            <StockCardPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'stock/trace',
        element: (
          <PermissionGuard permission="stock.read">
            <BatchTracePage />
          </PermissionGuard>
        ),
      },
      {
        path: 'stock/*',
        element: (
          <PermissionGuard permission="stock.read">
            <StockBalancesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'counting',
        element: (
          <PermissionGuard permission="count.create">
            <CountingSessionsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'counting/adjustments/new',
        element: (
          <PermissionGuard permission="count.create">
            <AdjustmentFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'counting/:id',
        element: (
          <PermissionGuard permission="count.create">
            <CountingDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'counting/:id/execute',
        element: (
          <PermissionGuard permission="count.create">
            <CountExecutePage />
          </PermissionGuard>
        ),
      },
      {
        path: 'counting/*',
        element: (
          <PermissionGuard permission="count.create">
            <CountingSessionsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'reports/valuation',
        element: (
          <PermissionGuard permission="report.read">
            <InventoryValuationPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'reports/fsn',
        element: (
          <PermissionGuard permission="report.read">
            <FsnAnalysisPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'reports/space-utilization',
        element: (
          <PermissionGuard permission="report.read">
            <SpaceUtilizationPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'reports/*',
        element: (
          <PermissionGuard permission="report.read">
            <InventoryValuationPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <PermissionGuard permission="admin.user">
            <UsersPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/roles',
        element: (
          <PermissionGuard permission="admin.user">
            <RolesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/settings',
        element: (
          <PermissionGuard permission="admin.user">
            <SettingsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/audit-logs',
        element: (
          <PermissionGuard permission="admin.user">
            <AuditLogsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/*',
        element: (
          <PermissionGuard permission="admin.user">
            <UsersPage />
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
