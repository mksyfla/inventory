import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DeliveryDetailPage } from '../pages/outbound/DeliveryDetailPage';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const makeMockDODetail = () => ({
  id: 2,
  public_id: 'do-2',
  doc_no: 'DO/2026/08/0002',
  doc_type: 'DO',
  doc_date: '2026-08-16',
  status: 'partially_delivered',
  warehouse_id: 1,
  dest_warehouse_id: null,
  partner_id: 2,
  reason_code: '',
  notes: 'Pengiriman sebagian karena stok kurang',
  created_at: '2026-08-16T08:00:00Z',
  created_by: 3,
  submitted_at: null,
  approved_at: null,
  approved_by: null,
  completed_at: null,
  manager_approved_by: null,
  manager_approved_at: null,
  warehouse_code: 'WH01',
  warehouse_name: 'Gudang Utama Jakarta',
  dest_warehouse_code: '',
  dest_warehouse_name: '',
  partner_code: 'PT-002',
  partner_name: 'PT Mitra Dagang',
  ref_doc_no: 'RQ/2026/08/0011',
  line_count: 2,
  partner: { id: 2, code: 'PT-002', partner_type: 'customer', name: 'PT Mitra Dagang', is_active: true },
  lines: [
    {
      id: 201,
      document_id: 2,
      line_no: 1,
      item_id: 1,
      sku: 'SKU-PITA-001',
      item_name: 'Pita Cukai Hasil Tembakau 2026',
      uom: 'RIM',
      conv_factor: 1,
      qty_request: 100,
      qty_processed: 70,
      batch_id: 10,
      location_id: 5,
      status: 'partial',
      notes: '',
    },
    {
      id: 202,
      document_id: 2,
      line_no: 2,
      item_id: 2,
      sku: 'SKU-TINTA-002',
      item_name: 'Tinta Cetak Sekuritas Siklamat Biru',
      uom: 'KG',
      conv_factor: 1,
      qty_request: 50,
      qty_processed: 50,
      batch_id: 11,
      location_id: 6,
      status: 'delivered',
      notes: '',
    },
  ],
});

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outbound/deliveries/2']}>
        <Routes>
          <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('Partial Delivery Tracker (FE-307)', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockDODetail());
  });

  it('renders partial delivery alert banner and outstanding quantities table for DO #2', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-partial-delivery')).toBeInTheDocument();
    });
    expect(screen.getByTestId('table-partial-outstanding')).toBeInTheDocument();
    expect(screen.getByText('Terkirim Sebagian (Partial)')).toBeInTheDocument();
    expect(documentService.getDetail).toHaveBeenCalledWith(2);
  }, 10000);
});
