import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { StockBalancesPage } from '../pages/stock/StockBalancesPage';
import { stockQueryService } from '../api/services/stock';
import { warehouseService } from '../api/services/warehouses';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/stock', () => ({
  stockQueryService: {
    listBalances: vi.fn(),
    listBatchTrace: vi.fn(),
    listLedger: vi.fn(),
  },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

const mockBalances = [
  {
    balance_id: 1,
    item_id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    base_uom: 'RIM',
    category_name: 'Pita Cukai',
    warehouse_id: 1,
    warehouse_name: 'Gudang Utama Jakarta',
    location_id: 1,
    location_code: 'JKT01-Z1-R01-B01',
    zone: 'Z1',
    rack: 'R01',
    level: 'B01',
    batch_id: null,
    batch_no: 'LOT-SIC-202608-01',
    expiry_date: '2027-08-10',
    status: 'available',
    qty_onhand: 250,
    qty_reserved: 50,
    updated_at: '2026-08-17T00:00:00Z',
  },
  {
    balance_id: 2,
    item_id: 2,
    sku: 'SKU-TINTA-002',
    item_name: 'Tinta Cetak Sekuritas Siklamat Biru',
    base_uom: 'KG',
    category_name: 'Tinta Cetak Sekuritas',
    warehouse_id: 1,
    warehouse_name: 'Gudang Utama Jakarta',
    location_id: 2,
    location_code: 'JKT01-Z1-R01-B02',
    zone: 'Z1',
    rack: 'R01',
    level: 'B02',
    batch_id: null,
    batch_no: 'LOT-PUR-2026-99',
    expiry_date: '2028-08-10',
    status: 'quarantine',
    qty_onhand: 80,
    qty_reserved: 0,
    updated_at: '2026-08-17T00:00:00Z',
  },
  {
    balance_id: 3,
    item_id: 3,
    sku: 'SKU-KERTAS-003',
    item_name: 'Kertas Banknote Uang Kertas Rp 100.000',
    base_uom: 'REAM',
    category_name: 'Kertas Sekuritas',
    warehouse_id: 1,
    warehouse_name: 'Gudang Utama Jakarta',
    location_id: 3,
    location_code: 'JKT01-STG-IN',
    zone: 'STG',
    rack: '',
    level: '',
    batch_id: null,
    batch_no: 'LOT-EXP-2026-05',
    expiry_date: '2026-09-01',
    status: 'expired',
    qty_onhand: 15,
    qty_reserved: 0,
    updated_at: '2026-08-17T00:00:00Z',
  },
];

const mockWarehouses = [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: '', is_active: true },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('StockBalancesPage Component (FE-501)', () => {
  beforeEach(() => {
    queryClient.clear();
    (stockQueryService.listBalances as ReturnType<typeof vi.fn>).mockResolvedValue(mockBalances);
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockWarehouses);
  });

  it('renders stock balances table, search bar, filters, and statistic cards', async () => {
    await act(async () => {
      renderWithProviders(<StockBalancesPage />);
    });

    expect(screen.getByTestId('stock-balances-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-stock')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-filter')).toBeInTheDocument();
    expect(screen.getByTestId('select-category-filter')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-stock-balances')).toBeInTheDocument();
    expect(screen.getByTestId('btn-nav-batch-trace')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    });
  }, 10000);

  it('filters stock balance table by SKU search query', async () => {
    await act(async () => {
      renderWithProviders(<StockBalancesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('SKU-KERTAS-003')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-stock');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'SKU-PITA-001' } });
    });

    await waitFor(
      () => {
        expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
        expect(screen.queryByText('SKU-KERTAS-003')).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  }, 10000);
});
