import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { StockCardPage } from '../pages/stock/StockCardPage';
import { itemService } from '../api/services/items';
import { stockQueryService } from '../api/services/stock';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    importItems: vi.fn(),
    listCategories: vi.fn(),
  },
}));

vi.mock('../api/services/stock', () => ({
  stockQueryService: {
    listBalances: vi.fn(),
    listBatchTrace: vi.fn(),
    listLedger: vi.fn(),
  },
}));

const mockItem = {
  id: 1,
  public_id: 'itm-001-uuid',
  sku: 'SKU-PITA-001',
  name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
  category_id: 2,
  base_uom: 'RIM',
  is_batch: true,
  is_expiry: true,
  is_serial: false,
  min_qty: 10,
  max_qty: 100,
  safety_stock: 5,
  lead_time_days: 7,
  abc_class: 'A',
  is_active: true,
};

const mockMovements = [
  {
    id: 1,
    moved_at: '2026-08-15T10:15:00Z',
    item_id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    base_uom: 'RIM',
    location_id: 1,
    location_code: 'JKT01-STG-IN',
    batch_id: null,
    batch_no: '',
    status: 'available',
    movement_type: 'receipt',
    qty: 300,
    qty_after: 300,
    doc_no: 'GRN-2026-08-001',
    created_by: 1,
    operator_name: 'Ahmad Staff Inbound',
  },
  {
    id: 2,
    moved_at: '2026-08-16T14:30:00Z',
    item_id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    base_uom: 'RIM',
    location_id: 2,
    location_code: 'JKT01-Z1-R01-B01',
    batch_id: null,
    batch_no: 'LOT-SIC-202608-01',
    status: 'available',
    movement_type: 'issue',
    qty: -50,
    qty_after: 250,
    doc_no: 'DO-2026-08-001',
    created_by: 2,
    operator_name: 'Budi Kurir Outbound',
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('StockCardPage Component (FE-502)', () => {
  beforeEach(() => {
    queryClient.clear();
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue([mockItem]);
    (stockQueryService.listLedger as ReturnType<typeof vi.fn>).mockResolvedValue(mockMovements);
  });

  it('renders stock card page, item summary, append-only banner, and ledger movement table', async () => {
    await act(async () => {
      renderWithProviders(<StockCardPage />);
    });

    expect(screen.getByTestId('stock-card-page')).toBeInTheDocument();
    expect(screen.getByTestId('alert-append-only-banner')).toBeInTheDocument();
    expect(screen.getByTestId('select-sku-card')).toBeInTheDocument();
    expect(screen.getByTestId('card-item-summary')).toBeInTheDocument();
    expect(screen.getByTestId('table-stock-ledger')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    });
  }, 10000);
});
