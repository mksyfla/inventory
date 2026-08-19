import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { WarehousesPage } from '../pages/master/WarehousesPage';
import { warehouseService } from '../api/services/warehouses';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

const mockWarehouses = [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: 'Jl. Peruri No.1', is_active: true },
  { id: 2, code: 'WH02', name: 'Gudang Karawang', address: '', is_active: false },
];

describe('WarehousesPage Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockWarehouses);
  });

  it('renders warehouse rows loaded from GET /warehouses', async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <WarehousesPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(screen.getByTestId('warehouses-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-warehouses')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Gudang Utama Jakarta')).toBeInTheDocument();
    });
    expect(screen.getByText('Gudang Karawang')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
    expect(warehouseService.list).toHaveBeenCalled();
  }, 10000);
});
