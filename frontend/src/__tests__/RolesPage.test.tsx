import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RolesPage } from '../pages/admin/RolesPage';
import { adminService } from '../api/services/admin';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/admin', () => ({
  adminService: {
    listUsers: vi.fn(),
    listRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    listPermissions: vi.fn(),
    listAuditLogs: vi.fn(),
  },
}));

const mockRoles = [
  {
    id: 1,
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Akses penuh',
    permissions: ['dashboard.read', 'item.read', 'report.read'],
  },
  {
    id: 2,
    code: 'WH_MANAGER',
    name: 'Warehouse Manager',
    description: null,
    permissions: ['dashboard.read', 'grn.approve', 'report.read'],
  },
];

const mockPermissions = [
  { id: 1, code: 'dashboard.read' },
  { id: 2, code: 'item.read' },
  { id: 3, code: 'report.read' },
  { id: 4, code: 'grn.approve' },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('RolesPage Component (FE-802)', () => {
  beforeEach(() => {
    queryClient.clear();
    (adminService.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (adminService.listPermissions as ReturnType<typeof vi.fn>).mockResolvedValue(mockPermissions);
    (adminService.createRole as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 99 });
    (adminService.updateRole as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
  });

  it('renders roles table and create role button', async () => {
    await act(async () => {
      renderWithProviders(<RolesPage />);
    });

    expect(screen.getByTestId('roles-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-roles')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-role')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Super Administrator')).toBeInTheDocument();
    });
  }, 10000);

  it('opens create role modal form and displays granular permission matrix', async () => {
    await act(async () => {
      renderWithProviders(<RolesPage />);
    });

    const createBtn = screen.getByTestId('btn-create-role');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-role-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-role')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-perm-dashboard.read')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-perm-grn.approve')).toBeInTheDocument();
  }, 10000);

  it('creates a role via adminService.createRole on form submit', async () => {
    await act(async () => {
      renderWithProviders(<RolesPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-create-role'));
    });

    fireEvent.change(screen.getByTestId('input-role-code'), { target: { value: 'AUDITOR' } });
    fireEvent.change(screen.getByTestId('input-role-name'), { target: { value: 'Auditor Lapangan' } });

    // Toggle an extra permission on top of the two defaults. userEvent drives
    // the native input like a real browser (fireEvent alone drops the group's
    // existing selection under React 19 + antd v5 compat).
    const user = userEvent.setup();
    await user.click(screen.getByTestId('checkbox-perm-report.read'));

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-role'));
    });

    await waitFor(() => {
      expect(adminService.createRole).toHaveBeenCalledWith({
        code: 'AUDITOR',
        name: 'Auditor Lapangan',
        description: undefined,
        permissions: ['dashboard.read', 'item.read', 'report.read'],
      });
    });
  }, 10000);
});
