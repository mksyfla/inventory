import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ReceiptFormPage } from '../pages/inbound/ReceiptFormPage';
import { itemService } from '../api/services/items';
import { warehouseService } from '../api/services/warehouses';
import { partnerService } from '../api/services/partners';
import { receiptService } from '../api/services/receipts';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    importItems: vi.fn(),
  },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

vi.mock('../api/services/partners', () => ({
  partnerService: {
    listPartners: vi.fn(),
    getPartner: vi.fn(),
    createPartner: vi.fn(),
  },
}));

vi.mock('../api/services/receipts', () => ({
  receiptService: {
    createReceipt: vi.fn(),
    submitReceipt: vi.fn(),
    approveReceipt: vi.fn(),
    putawaySuggestion: vi.fn(),
    putaway: vi.fn(),
  },
}));

const mockItems = [
  {
    id: 1,
    public_id: 'itm-001-uuid',
    sku: 'SKU-INK-001',
    name: 'Tinta Cetak Hitam Intaglio 1KG',
    category_id: 2,
    base_uom: 'CAN',
    is_batch: true,
    is_expiry: true,
    is_serial: false,
    min_qty: 10,
    max_qty: 100,
    safety_stock: 5,
    lead_time_days: 7,
    abc_class: 'A',
    is_active: true,
  },
];

const mockPartners = [
  {
    id: 1,
    code: 'SUP-001',
    partner_type: 'supplier',
    name: 'PT Sumber Pangan Sejahtera',
    is_active: true,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/inbound/receipts/new']}>
        <Routes>
          <Route path="/inbound/receipts/new" element={ui} />
          <Route path="/inbound/receipts" element={<div data-testid="receipts-list-page">Receipts List</div>} />
          <Route path="/inbound/receipts/:id" element={<div data-testid="receipt-detail-page">Receipt Detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('ReceiptFormPage Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: 'WH01', name: 'Gudang Utama', address: '', is_active: true },
    ]);
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);
    (partnerService.listPartners as ReturnType<typeof vi.fn>).mockResolvedValue(mockPartners);
    (receiptService.createReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      doc_no: 'GRN/WH01/2608/00001',
      status: 'draft',
    });
    (receiptService.submitReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      status: 'submitted',
    });
  });

  it('renders GRN creation form header, supplier select, and dynamic item lines table', async () => {
    await act(async () => {
      renderWithProviders(<ReceiptFormPage />);
    });

    expect(screen.getByTestId('receipt-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-po-reference')).toBeInTheDocument();
    expect(screen.getByTestId('select-supplier')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('table-form-items')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-item-row')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-draft')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-submit')).toBeInTheDocument();
  });

  it('adds dynamic item line row when clicking add button and submits form', async () => {
    await act(async () => {
      renderWithProviders(<ReceiptFormPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('select-item-sku-0')).toBeInTheDocument();
    });

    const poInput = screen.getByTestId('input-po-reference');
    await act(async () => {
      fireEvent.change(poInput, { target: { value: 'PO-2026-0888' } });
    });

    const addRowBtn = screen.getByTestId('btn-add-item-row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    // Check second item row fields exist
    expect(screen.getByTestId('select-item-sku-1')).toBeInTheDocument();

    const saveDraftBtn = screen.getByTestId('btn-save-draft');
    await act(async () => {
      fireEvent.click(saveDraftBtn);
    });

    await waitFor(() => {
      expect(receiptService.createReceipt).toHaveBeenCalled();
    });
  }, 10000);
});
