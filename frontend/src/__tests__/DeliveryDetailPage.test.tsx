import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DeliveryDetailPage } from '../pages/outbound/DeliveryDetailPage';
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

const makeMockDetail = (id: number, docNo: string) => ({
  id,
  public_id: `do-${id}-uuid`,
  doc_no: docNo,
  doc_type: 'DO',
  doc_date: '2026-08-20',
  status: 'draft',
  warehouse_id: 1,
  dest_warehouse_id: null,
  partner_id: 11,
  reason_code: '',
  notes: '',
  created_at: '2026-08-15T08:00:00Z',
  created_by: 2,
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
  partner_code: 'DIV-PASPOR',
  partner_name: 'Divisi Cetak Paspor & Dokumen Negara',
  ref_doc_no: 'REQ-2026-08-001',
  line_count: 2,
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
      document_id: id,
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
    {
      id: 102,
      document_id: id,
      line_no: 2,
      item_id: 2,
      sku: 'SKU-PUR-001',
      item_name: 'Kertas Pengaman PVC 100gsm',
      uom: 'REAM',
      conv_factor: 1,
      qty_request: 10,
      qty_processed: 0,
      batch_id: null,
      location_id: null,
      status: 'available',
      notes: '',
    },
  ],
});

const mockAllocations = [
  { line_id: 101, allocation_id: 1, balance_id: 5, location_code: 'JKT01-Z1-R01-B01', batch_id: 10, qty_allocated: 15 },
  { line_id: 102, allocation_id: 2, balance_id: 6, location_code: 'JKT01-Z1-R01-B02', batch_id: 11, qty_allocated: 10 },
];

const renderWithProviders = (initialEntry = '/outbound/deliveries/1') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('DeliveryDetailPage Outbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockImplementation((id: number) =>
      Promise.resolve(makeMockDetail(id, id === 2 ? 'DO-2026-08-002' : 'DO-2026-08-001'))
    );
    (outboundService.allocateDelivery as ReturnType<typeof vi.fn>).mockResolvedValue(mockAllocations);
  });

  it('renders Delivery Order details, customer metadata, and items table', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('Surat Jalan DO: DO-2026-08-001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('delivery-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-do-items')).toBeInTheDocument();
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
  }, 10000);

  it('triggers FEFO/FIFO stock allocation via backend on draft DO', async () => {
    await act(async () => {
      renderWithProviders();
    });

    const triggerBtn = await screen.findByTestId('btn-action-trigger-allocation');
    expect(triggerBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-action-start-picking')).toBeInTheDocument();
    });
    expect(outboundService.allocateDelivery).toHaveBeenCalledWith(1, [
      { line_id: 101, qty: 15 },
      { line_id: 102, qty: 10 },
    ]);
    expect(screen.getByText('Batch: LOT-10')).toBeInTheDocument();
    expect(screen.getByText('JKT01-Z1-R01-B01')).toBeInTheDocument();
    expect(screen.getByTestId('btn-override-item-0')).toBeInTheDocument();
  }, 10000);

  it('opens OverrideAllocationModal and submits manual allocation adjustment', async () => {
    await act(async () => {
      renderWithProviders('/outbound/deliveries/2');
    });

    const triggerBtn = await screen.findByTestId('btn-action-trigger-allocation');
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    const overrideBtn = await screen.findByTestId('btn-override-item-0');
    await act(async () => {
      fireEvent.click(overrideBtn);
    });

    expect(screen.getByTestId('modal-override-allocation')).toBeInTheDocument();

    const notesInput = screen.getByTestId('input-override-notes');
    await act(async () => {
      fireEvent.change(notesInput, { target: { value: 'Kemasan kaleng penyok pada batch FEFO rekomendasi' } });
    });

    const submitOverrideBtn = screen.getByTestId('btn-submit-override-allocation');
    await act(async () => {
      fireEvent.click(submitOverrideBtn);
    });

    expect(screen.getByText('Override FEFO')).toBeInTheDocument();
  }, 10000);
});
