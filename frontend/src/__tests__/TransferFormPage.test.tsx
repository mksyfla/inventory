import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TransferFormPage } from '../pages/transfer/TransferFormPage';
import { warehouseService } from '../api/services/warehouses';
import { itemService } from '../api/services/items';
import { transferService } from '../api/services/transfer';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/warehouses', () => ({
  warehouseService: {
    list: vi.fn(),
  },
}));

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    listCategories: vi.fn(),
    importItems: vi.fn(),
  },
}));

vi.mock('../api/services/transfer', () => ({
  transferService: {
    createTransfer: vi.fn(),
    submitTransfer: vi.fn(),
    approveTransfer: vi.fn(),
    sendTransfer: vi.fn(),
    receiveTransfer: vi.fn(),
  },
}));

const makeMockWarehouses = () => [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: 'Jl. Sudirman No.1', is_active: true },
  { id: 2, code: 'WH02', name: 'Gudang Cabang Surabaya', address: 'Jl. Ahmad Yani No.2', is_active: true },
];

const makeMockItems = () => [
  {
    id: 1,
    public_id: 'itm-1',
    sku: 'SKU-PITA-001',
    name: 'Pita Cukai Hasil Tembakau 2026',
    category_id: 1,
    base_uom: 'RIM',
    is_batch: true,
    is_expiry: true,
    is_serial: false,
    min_qty: 10,
    max_qty: null,
    safety_stock: 5,
    lead_time_days: 1,
    abc_class: 'A',
    is_active: true,
  },
];

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/transfer/new']}>
        <Routes>
          <Route path="/transfer/new" element={<TransferFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('TransferFormPage Component (FE-401)', () => {
  beforeEach(() => {
    queryClient.clear();
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockWarehouses());
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItems());
  });

  it('renders transfer form, warehouse selectors, item fields, and submit button', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByTestId('transfer-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-origin-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-destination-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('datepicker-transfer-date')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-transfer')).toBeInTheDocument();
    expect(warehouseService.list).toHaveBeenCalled();
    expect(itemService.listItems).toHaveBeenCalled();
  }, 10000);

  it('submits transfer form via backend createTransfer with mapped payload', async () => {
    (transferService.createTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      public_id: 'trf-1',
      doc_no: 'TRF/WH01/2608/00001',
      doc_type: 'TRF',
      doc_date: '2026-08-16',
      status: 'submitted',
      warehouse_id: 1,
      dest_warehouse_id: 2,
      notes: 'Pengiriman persediaan barang antar gudang cabang',
      created_by: 3,
      lines: [],
    });

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-submit-transfer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-submit-transfer'));
    });

    await waitFor(() => {
      expect(transferService.createTransfer).toHaveBeenCalledWith({
        warehouse_id: 1,
        dest_warehouse_id: 2,
        notes: 'Pengiriman persediaan barang antar gudang cabang',
        lines: [{ item_id: 1, qty: 50, uom: 'EA' }],
      });
    });
  }, 10000);
});
