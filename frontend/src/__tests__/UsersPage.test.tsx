import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { UsersPage } from '../pages/admin/UsersPage';
import { adminService } from '../api/services/admin';
import { warehouseService } from '../api/services/warehouses';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/admin', () => ({
  adminService: {
    listUsers: vi.fn(),
    listRoles: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    listAuditLogs: vi.fn(),
  },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: {
    list: vi.fn(),
  },
}));

// Role codes and warehouse names deliberately differ from the dropdown option
// labels so the option text is unique when selecting (the table shows role /
// warehouse tags that would otherwise collide with findByText).
const mockUsers = [
  {
    id: 1,
    username: 'dipo.manager',
    email: 'dipo.inventory@peruri.co.id',
    full_name: 'Dipo Inventory (Manager)',
    phone: '081298421000',
    is_active: true,
    last_login_at: '2026-08-17 11:30:00',
    roles: ['INVENTORY_MANAGER'],
    warehouses: ['Gudang Cadangan Depok'],
    warehouse_ids: [9],
  },
  {
    id: 2,
    username: 'budi.outbound',
    email: 'budi.outbound@peruri.co.id',
    full_name: 'Budi Staff Outbound',
    phone: null,
    is_active: false,
    last_login_at: '2026-08-10 16:45:00',
    roles: ['OUTBOUND_STAFF'],
    warehouses: ['Gudang Cadangan Depok'],
    warehouse_ids: [9],
  },
];

const mockRoles = [
  { id: 1, code: 'WH_MANAGER', name: 'Warehouse Manager', description: null, permissions: [] },
  { id: 2, code: 'OUTBOUND_STAFF', name: 'Outbound Staff', description: null, permissions: [] },
];

const mockWarehouses = [
  { id: 1, code: 'WH-JKT', name: 'Gudang Utama Jakarta', address: 'Jl. Merdeka 1', is_active: true },
  { id: 2, code: 'WH-BDG', name: 'Gudang Satelit Bandung', address: 'Jl. Asia Afrika 2', is_active: true },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('UsersPage Component (FE-801)', () => {
  beforeEach(() => {
    queryClient.clear();
    (adminService.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsers);
    (adminService.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (adminService.createUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 99 });
    (adminService.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockWarehouses);
  });

  it('renders users table, search input, status filter, and create user button', async () => {
    await act(async () => {
      renderWithProviders(<UsersPage />);
    });

    expect(screen.getByTestId('users-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-users')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-users')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-user')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('dipo.manager')).toBeInTheDocument();
    });
  }, 10000);

  it('opens create user modal form on click create button', async () => {
    await act(async () => {
      renderWithProviders(<UsersPage />);
    });

    const createBtn = screen.getByTestId('btn-create-user');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-user-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-user')).toBeInTheDocument();
  }, 10000);

  it('creates a user via adminService.createUser on form submit', async () => {
    await act(async () => {
      renderWithProviders(<UsersPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-create-user'));
    });

    const submit = screen.getByTestId('btn-submit-user');
    await act(async () => {
      fireEvent.submit(submit.closest('form') as HTMLFormElement);
    });

    // Username, full name, email, password, a role, and a warehouse are all
    // required; an empty submit is blocked client-side without hitting the API.
    await waitFor(() => {
      expect(adminService.createUser).not.toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId('input-user-username'), { target: { value: 'new.staff' } });
    fireEvent.change(screen.getByTestId('input-user-fullname'), { target: { value: 'New Staff' } });
    fireEvent.change(screen.getByTestId('input-user-email'), { target: { value: 'new.staff@peruri.co.id' } });
    fireEvent.change(screen.getByTestId('input-user-password'), { target: { value: 'Secret123' } });

    // Select a role (code) and a warehouse through the antd dropdowns.
    const roleSelect = screen.getByTestId('select-user-roles').querySelector('.ant-select-selector') as Element;
    await act(async () => {
      fireEvent.mouseDown(roleSelect);
    });
    const roleOption = await screen.findByText('Warehouse Manager');
    await act(async () => {
      fireEvent.click(roleOption);
    });

    const whSelect = screen.getByTestId('select-user-warehouses').querySelector('.ant-select-selector') as Element;
    await act(async () => {
      fireEvent.mouseDown(whSelect);
    });
    const warehouseOption = await screen.findByText('Gudang Utama Jakarta');
    await act(async () => {
      fireEvent.click(warehouseOption);
    });

    await act(async () => {
      fireEvent.submit(submit.closest('form') as HTMLFormElement);
    });

    await waitFor(() => {
      expect(adminService.createUser).toHaveBeenCalledWith({
        username: 'new.staff',
        full_name: 'New Staff',
        email: 'new.staff@peruri.co.id',
        phone: undefined,
        password: 'Secret123',
        is_active: true,
        roles: ['WH_MANAGER'],
        warehouse_ids: [1],
      });
    });
  }, 10000);
});
