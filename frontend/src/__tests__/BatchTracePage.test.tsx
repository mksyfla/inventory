import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { BatchTracePage } from '../pages/stock/BatchTracePage';
import { stockQueryService } from '../api/services/stock';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/stock', () => ({
  stockQueryService: {
    listBalances: vi.fn(),
    listBatchTrace: vi.fn(),
    listLedger: vi.fn(),
  },
}));

const mockTraces = [
  {
    batch_id: 10,
    batch_no: 'LOT-SIC-202608-01',
    item_id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    base_uom: 'RIM',
    mfg_date: '2026-08-01',
    expiry_date: '2027-08-10',
    balance_id: 1,
    location_id: 1,
    location_code: 'JKT01-Z1-R01-B01',
    status: 'available',
    qty_onhand: 200,
    qty_reserved: 50,
    grn_no: 'GRN-2026-08-001',
    grn_date: '2026-08-15',
    supplier_name: 'PT Pura Barutama (Supplier Pita)',
  },
  {
    batch_id: 10,
    batch_no: 'LOT-SIC-202608-01',
    item_id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    base_uom: 'RIM',
    mfg_date: '2026-08-01',
    expiry_date: '2027-08-10',
    balance_id: 2,
    location_id: 2,
    location_code: 'JKT01-STG-IN',
    status: 'available',
    qty_onhand: 100,
    qty_reserved: 0,
    grn_no: 'GRN-2026-08-001',
    grn_date: '2026-08-15',
    supplier_name: 'PT Pura Barutama (Supplier Pita)',
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('BatchTracePage Component (FE-504)', () => {
  beforeEach(() => {
    queryClient.clear();
    (stockQueryService.listBatchTrace as ReturnType<typeof vi.fn>).mockResolvedValue(mockTraces);
  });

  it('renders batch trace page, search input, backward trace, and forward deliveries table', async () => {
    await act(async () => {
      renderWithProviders(<BatchTracePage />);
    });

    expect(screen.getByTestId('batch-trace-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-batch')).toBeInTheDocument();
    expect(screen.getByTestId('card-backward-trace')).toBeInTheDocument();
    expect(screen.getByTestId('card-forward-trace')).toBeInTheDocument();
    expect(screen.getByTestId('table-forward-deliveries')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('PT Pura Barutama (Supplier Pita)')).toBeInTheDocument();
    });
  }, 10000);

  it('triggers batch search on click search button', async () => {
    await act(async () => {
      renderWithProviders(<BatchTracePage />);
    });

    await waitFor(() => {
      expect(screen.getByText('PT Pura Barutama (Supplier Pita)')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-batch');
    const searchBtn = screen.getByTestId('btn-search-batch');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'LOT-PUR-2026-99' } });
      fireEvent.click(searchBtn);
    });

    expect(searchInput).toHaveValue('LOT-PUR-2026-99');
  }, 10000);
});
