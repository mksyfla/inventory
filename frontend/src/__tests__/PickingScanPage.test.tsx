import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PickingScanPage } from '../pages/outbound/PickingScanPage';
import { outboundService } from '../api/services/outbound';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/outbound', () => ({
  outboundService: {
    getPickingList: vi.fn(),
    confirmPick: vi.fn(),
  },
}));

vi.mock('../api/services/documents', () => ({
  documentService: {
    getDetail: vi.fn(),
  },
}));

// Picking list rows shaped exactly like the backend PickingListItem schema
// (GET /deliveries/:id/picking-list). qty_picked starts at 0 — the picker
// enters the quantity taken and confirms each line.
const mockPickingList = [
  {
    allocation_id: 5001,
    line_id: 1001,
    item_id: 1,
    sku: 'SKU-INK-001',
    base_uom: 'CAN',
    location_code: 'JKT01-Z1-R01-B01',
    pick_seq: 1,
    batch_id: 11,
    batch_no: 'LOT-SIC-202608-01',
    qty_allocated: 15,
    qty_picked: 0,
    qty_remaining: 15,
  },
  {
    allocation_id: 5002,
    line_id: 1002,
    item_id: 2,
    sku: 'SKU-INK-002',
    base_uom: 'CAN',
    location_code: 'JKT01-Z1-R01-B02',
    pick_seq: 2,
    batch_id: 12,
    batch_no: 'LOT-SIC-202608-02',
    qty_allocated: 10,
    qty_picked: 0,
    qty_remaining: 10,
  },
];

const mockDocDetail = {
  id: 1,
  doc_no: 'DO-2026-08-001',
  doc_type: 'DO',
  status: 'approved',
  warehouse_id: 1,
  doc_date: '2026-08-20',
  created_by: 1,
  created_at: '2026-08-14T10:00:00Z',
  partner_name: 'Kementerian Luar Negeri RI (Kemlu)',
  warehouse_name: 'Gudang Utama Jakarta',
  ref_doc_no: 'REQ-2026-08-001',
  notes: null,
  lines: [],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outbound/deliveries/1/picking']}>
        <Routes>
          <Route path="/outbound/deliveries/:id/picking" element={<PickingScanPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('PickingScanPage Outbound Mobile Scanner Workflow Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocDetail);
    (outboundService.getPickingList as ReturnType<typeof vi.fn>).mockResolvedValue(mockPickingList);
    (outboundService.confirmPick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, status: 'in_progress' });
  });

  it('renders picking items table loaded from the backend, target bin banner, and scan controls', async () => {
    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('picking-scan-page')).toBeInTheDocument();

    // Wait for the real picking list + DO header to load from the backend.
    await waitFor(() => {
      expect(screen.getByTestId('table-picking-list')).toBeInTheDocument();
    });

    expect(screen.getByTestId('input-scan-barcode')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-camera-scanner')).toBeInTheDocument();
    expect(screen.getByText(/DO-2026-08-001/)).toBeInTheDocument();
    expect(screen.getAllByText('JKT01-Z1-R01-B01')[0]).toBeInTheDocument();
    expect(screen.getAllByText('SKU-INK-001')[0]).toBeInTheDocument();
  }, 10000);

  it('triggers mismatch error alert when an invalid bin barcode is scanned', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-scan-barcode')).toBeInTheDocument();
    });

    const scanInput = screen.getByTestId('input-scan-barcode');
    const submitBtn = screen.getByTestId('btn-submit-scan');

    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'WRONG-BIN-LOCATION-999' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByTestId('alert-scan-mismatch')).toBeInTheDocument();
    expect(screen.getByText(/ERR_SCAN_MISMATCH/)).toBeInTheDocument();
  }, 10000);

  it('scans bin and SKU, enters qty, and confirms the pick via the backend', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-scan-barcode')).toBeInTheDocument();
    });

    const scanInput = screen.getByTestId('input-scan-barcode');
    const submitBtn = screen.getByTestId('btn-submit-scan');

    // 1. Scan valid Bin
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'JKT01-Z1-R01-B01' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText('Bin Terverifikasi')).toBeInTheDocument();

    // 2. Scan valid SKU
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'SKU-INK-001' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText('SKU Terverifikasi')).toBeInTheDocument();

    // 3. Enter the picked quantity (real data starts at 0).
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-qty-picked'), { target: { value: '15' } });
    });

    // 4. Confirm — pick must be persisted to the backend.
    const confirmPickBtn = screen.getByTestId('btn-confirm-item-pick');
    expect(confirmPickBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmPickBtn);
    });

    await waitFor(() => {
      expect(outboundService.confirmPick).toHaveBeenCalledWith(1, [
        {
          allocation_id: 5001,
          location_barcode: 'JKT01-Z1-R01-B01',
          item_barcode: 'SKU-INK-001',
          qty: 15,
        },
      ]);
    });

    // Pick line #1 completed, active step moves to #2
    expect(screen.getByText('Target Picking Aktif - Langkah #2 dari 2')).toBeInTheDocument();
  }, 10000);
});
