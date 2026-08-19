import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage';
import { adminService } from '../api/services/admin';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/admin', () => ({
  adminService: {
    listUsers: vi.fn(),
    listRoles: vi.fn(),
    listAuditLogs: vi.fn(),
  },
}));

const mockAuditLogs = [
  {
    id: 1,
    occurred_at: '2026-08-17 11:30:22',
    user_id: 1,
    actor_username: 'Dipo Inventory (Manager)',
    action: 'approve',
    entity: 'GoodsReceiptNote',
    entity_id: 101,
    old_value: { status: 'submitted' },
    new_value: { status: 'approved', approvedBy: 'Dipo Inventory' },
    ip_address: '192.168.1.45',
    request_id: 'req-uuid-984210',
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('AuditLogsPage Component (FE-503)', () => {
  beforeEach(() => {
    queryClient.clear();
    (adminService.listAuditLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuditLogs);
  });

  it('renders audit logs table, search input, and action filter', async () => {
    await act(async () => {
      renderWithProviders(<AuditLogsPage />);
    });

    expect(screen.getByTestId('audit-logs-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-audit')).toBeInTheDocument();
    expect(screen.getByTestId('select-action-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-audit-logs')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Dipo Inventory (Manager)')).toBeInTheDocument();
    });
  }, 10000);

  it('opens side-by-side JSON diff modal when clicking view diff button', async () => {
    await act(async () => {
      renderWithProviders(<AuditLogsPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-view-diff-1')).toBeInTheDocument();
    });

    const diffBtn = screen.getByTestId('btn-view-diff-1');

    await act(async () => {
      fireEvent.click(diffBtn);
    });

    expect(screen.getByTestId('modal-audit-diff')).toBeInTheDocument();
    expect(screen.getByTestId('json-old-value')).toBeInTheDocument();
    expect(screen.getByTestId('json-new-value')).toBeInTheDocument();
  }, 10000);
});
