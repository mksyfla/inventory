import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PutawayPage } from '../pages/inbound/PutawayPage';
import { receiptService } from '../api/services/receipts';
import { itemService } from '../api/services/items';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/receipts', () => ({
  receiptService: {
    createReceipt: vi.fn(),
    submitReceipt: vi.fn(),
    approveReceipt: vi.fn(),
    putawaySuggestion: vi.fn(),
    putaway: vi.fn(),
  },
}));

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

const mockSuggestions = [
  {
    line_id: 101,
    item_id: 1,
    qty_remaining: 50,
    locations: [{ location_id: 1, code: 'PK-01-01', zone: 'PK', rack: 'R01', level: 'L1', loc_type: 'pick', free_qty: 1000 }],
  },
  {
    line_id: 102,
    item_id: 2,
    qty_remaining: 30,
    locations: [{ location_id: 2, code: 'PK-01-02', zone: 'PK', rack: 'R02', level: 'L1', loc_type: 'pick', free_qty: 1000 }],
  },
];

const mockItems = [
  { id: 1, public_id: 'a', sku: 'SKU-INK-001', name: 'Tinta Cetak Hitam', base_uom: 'CAN', category_id: null, is_batch: true, is_expiry: true, is_serial: false, min_qty: 0, max_qty: null, safety_stock: 0, lead_time_days: 0, abc_class: null, is_active: true },
  { id: 2, public_id: 'b', sku: 'SKU-INK-002', name: 'Tinta Cetak Biru', base_uom: 'CAN', category_id: null, is_batch: true, is_expiry: true, is_serial: false, min_qty: 0, max_qty: null, safety_stock: 0, lead_time_days: 0, abc_class: null, is_active: true },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/inbound/receipts/1/putaway']}>
        <Routes>
          <Route path="/inbound/receipts/:id/putaway" element={ui} />
          <Route path="/inbound/receipts/:id" element={<div data-testid="receipt-detail">Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('PutawayPage Inbound Workflow Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (receiptService.putawaySuggestion as ReturnType<typeof vi.fn>).mockResolvedValue(mockSuggestions);
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);
    (receiptService.putaway as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, status: 'in_progress' });
  });

  it('renders putaway items table, system bin suggestions, and manual scan inputs', async () => {
    await act(async () => {
      renderWithProviders(<PutawayPage />);
    });

    expect(screen.getByTestId('putaway-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-camera-scanner')).toBeInTheDocument();
    expect(screen.getByTestId('table-putaway-items')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
      expect(screen.getAllByText('PK-01-01').length).toBeGreaterThan(0);
      expect(screen.getByTestId('input-manual-barcode-scan')).toBeInTheDocument();
    });
  }, 10000);

  it('scans bin barcode and confirms putaway completion', async () => {
    await act(async () => {
      renderWithProviders(<PutawayPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-putaway-0')).toBeInTheDocument();
    });

    const scanInput = screen.getByTestId('input-manual-barcode-scan');
    const submitScanBtn = screen.getByTestId('btn-submit-manual-scan');

    // Scan matching Bin location (PK-01-01)
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'PK-01-01' } });
      fireEvent.click(submitScanBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Bin Match')).toBeInTheDocument();
    });

    // Confirm putaway for line 0
    const confirmBtn0 = screen.getByTestId('btn-confirm-putaway-0');
    await act(async () => {
      fireEvent.click(confirmBtn0);
    });

    await waitFor(() => {
      expect(receiptService.putaway).toHaveBeenCalled();
    });
  }, 10000);
});
