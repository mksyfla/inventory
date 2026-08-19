import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReceiptDetailPage } from '../pages/inbound/ReceiptDetailPage';
import { useAuthStore } from '../store/useAuthStore';
import { receiptService } from '../api/services/receipts';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';
import { DocumentDetailDTO } from '../api/dto';

vi.mock('../api/services/receipts', () => ({
  receiptService: {
    createReceipt: vi.fn(),
    submitReceipt: vi.fn(),
    approveReceipt: vi.fn(),
    putawaySuggestion: vi.fn(),
    putaway: vi.fn(),
    listAttachments: vi.fn(),
    createAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
}));

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const completedDoc: DocumentDetailDTO = {
  id: 1,
  public_id: 'pub-1',
  doc_no: 'GRN/WH01/2608/00001',
  doc_type: 'GRN',
  doc_date: '2026-08-10',
  status: 'completed',
  warehouse_id: 1,
  dest_warehouse_id: null,
  partner_id: 1,
  reason_code: '',
  notes: 'PO Ref: PO-2026-0102',
  created_at: '2026-08-10T09:00:00Z',
  created_by: 5,
  submitted_at: '2026-08-10T10:00:00Z',
  approved_at: '2026-08-10T11:00:00Z',
  approved_by: 2,
  completed_at: '2026-08-10T12:00:00Z',
  manager_approved_by: null,
  manager_approved_at: null,
  warehouse_code: 'WH01',
  warehouse_name: 'Gudang Utama Jakarta',
  dest_warehouse_code: '',
  dest_warehouse_name: '',
  partner_code: 'SUP-001',
  partner_name: 'PT SICPA Perdana Printing Inks',
  ref_doc_no: 'PO-2026-0102',
  line_count: 1,
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
      qty_request: 50,
      qty_processed: 50,
      batch_id: null,
      location_id: null,
      status: 'available',
      notes: '',
    },
  ],
};

const draftDoc: DocumentDetailDTO = {
  ...completedDoc,
  id: 3,
  doc_no: 'GRN/WH01/2608/00003',
  status: 'draft',
  completed_at: null,
};

const renderWithState = (doc: DocumentDetailDTO) => {
  useAuthStore.setState({
    isAuthenticated: true,
    token: 'token',
    user: {
      id: 5,
      username: 'supervisor',
      fullName: 'Supervisor',
      email: 'sup@peruri.co.id',
      roles: ['inbound_staff'],
      permissions: ['grn.approve', 'grn.read'],
      assignedWarehouseIds: [1],
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: `/inbound/receipts/${doc.id}`, state: { doc } }]}
      >
        <Routes>
          <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ReceiptDetailPage Inbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (receiptService.submitReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
      status: 'submitted',
    });
    (receiptService.approveReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
      status: 'approved',
    });
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(completedDoc);
    (receiptService.listAttachments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('renders locked alert and items table for completed GRN document', async () => {
    await act(async () => {
      renderWithState(completedDoc);
    });

    expect(screen.getByTestId('receipt-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Dokumen Penerimaan: GRN/WH01/2608/00001')).toBeInTheDocument();
    expect(screen.getAllByText(/Terkunci/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('table-grn-items')).toBeInTheDocument();
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
  }, 10000);

  it('handles state machine transition from draft to submitted', async () => {
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(draftDoc);

    await act(async () => {
      renderWithState(draftDoc);
    });

    expect(screen.getByText('Dokumen Penerimaan: GRN/WH01/2608/00003')).toBeInTheDocument();
    const submitBtn = screen.getByTestId('btn-action-submit');
    expect(submitBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Check that state transitions to Submitted and displays Approve/Reject buttons
    expect(screen.getByTestId('btn-action-approve')).toBeInTheDocument();
    expect(screen.getByTestId('btn-action-reject')).toBeInTheDocument();
  }, 10000);
});
