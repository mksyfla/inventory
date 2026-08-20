import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RequestDetailPage } from '../pages/outbound/RequestDetailPage';
import { documentService } from '../api/services/documents';
import { outboundService } from '../api/services/outbound';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

vi.mock('../api/services/outbound', () => ({
  outboundService: {
    createRequest: vi.fn(),
    submitRequest: vi.fn(),
    approveRequest: vi.fn(),
    submitDelivery: vi.fn(),
    approveDelivery: vi.fn(),
    allocateDelivery: vi.fn(),
  },
}));

const mockDetail = {
  id: 1,
  public_id: 'req-001-uuid',
  doc_no: 'REQ-2026-08-001',
  doc_type: 'REQ',
  doc_date: '2026-08-20',
  status: 'submitted',
  warehouse_id: 1,
  dest_warehouse_id: null,
  partner_id: 11,
  reason_code: '',
  notes: 'Kebutuhan tinta untuk pesanan paspor.',
  created_at: '2026-08-14T08:00:00Z',
  created_by: 2,
  submitted_at: '2026-08-14T08:05:00Z',
  approved_at: null,
  approved_by: null,
  completed_at: null,
  manager_approved_by: null,
  manager_approved_at: null,
  warehouse_code: 'WH01',
  warehouse_name: 'Gudang Utama Jakarta',
  dest_warehouse_code: '',
  dest_warehouse_name: '',
  partner_code: 'DIV-PASPOR',
  partner_name: 'Divisi Cetak Paspor & Dokumen Negara',
  ref_doc_no: '',
  line_count: 1,
  source_warehouse: { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', is_active: true },
  partner: {
    id: 11,
    code: 'DIV-PASPOR',
    partner_type: 'customer',
    name: 'Divisi Cetak Paspor & Dokumen Negara',
    is_active: true,
  },
  lines: [
    {
      id: 101,
      document_id: 1,
      line_no: 1,
      item_id: 1,
      sku: 'SKU-INK-001',
      item_name: 'Tinta Cetak Hitam Intaglio 1KG',
      uom: 'CAN',
      conv_factor: 1,
      qty_request: 15,
      qty_processed: 0,
      batch_id: null,
      location_id: null,
      status: 'available',
      notes: '',
    },
  ],
};

const renderWithProviders = (ui: React.ReactElement, initialEntry = '/outbound/requests/1') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/outbound/requests/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('RequestDetailPage Outbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);
    (outboundService.approveRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, status: 'approved' });
  });

  it('renders request details, metadata, and items table', async () => {
    await act(async () => {
      renderWithProviders(<RequestDetailPage />);
    });

    expect(screen.getByTestId('request-detail-page')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Permintaan Barang: REQ-2026-08-001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('table-request-items')).toBeInTheDocument();
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
  }, 10000);

  it('handles state machine transition from submitted to approved', async () => {
    await act(async () => {
      renderWithProviders(<RequestDetailPage />);
    });

    const approveBtn = await screen.findByTestId('btn-action-approve-request');
    expect(approveBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(approveBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-action-fulfill-request')).toBeInTheDocument();
    });
  }, 10000);

  it('opens RejectRequestModal and submits rejection reason', async () => {
    await act(async () => {
      renderWithProviders(<RequestDetailPage />);
    });

    const rejectBtn = await screen.findByTestId('btn-action-reject-request');
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    expect(screen.getByTestId('modal-reject-request')).toBeInTheDocument();

    const submitRejectionBtn = screen.getByTestId('btn-submit-request-rejection');
    await act(async () => {
      fireEvent.click(submitRejectionBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-request-rejected')).toBeInTheDocument();
    });
  }, 10000);
});
