import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReceiptDetailPage } from '../pages/inbound/ReceiptDetailPage';
import { useAuthStore } from '../store/useAuthStore';
import { receiptService } from '../api/services/receipts';
import { queryClient } from '../api/queryClient';
import { ReceiptDocumentDTO } from '../api/dto';

vi.mock('../api/services/receipts', () => ({
  receiptService: {
    createReceipt: vi.fn(),
    submitReceipt: vi.fn(),
    approveReceipt: vi.fn(),
    putawaySuggestion: vi.fn(),
    putaway: vi.fn(),
  },
}));

const completedDoc: ReceiptDocumentDTO = {
  id: 1,
  public_id: 'pub-1',
  doc_no: 'GRN/WH01/2608/00001',
  doc_type: 'GRN',
  doc_date: '2026-08-10',
  status: 'completed',
  warehouse_id: 1,
  partner_id: 1,
  created_by: 5,
  lines: [
    { id: 101, line_no: 1, item_id: 1, uom: 'CAN', qty_request: 50, qty_processed: 50, batch_id: 1, location_id: 1, status: 'available' },
  ],
};

const draftDoc: ReceiptDocumentDTO = {
  ...completedDoc,
  id: 3,
  doc_no: 'GRN/WH01/2608/00003',
  doc_date: '2026-08-13',
  status: 'draft',
};

const renderWithState = (doc: ReceiptDocumentDTO) => {
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
      <MemoryRouter initialEntries={[{ pathname: `/inbound/receipts/${doc.id}`, state: { receipt: doc } }]}>
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
    (receiptService.submitReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3, status: 'submitted' });
    (receiptService.approveReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3, status: 'approved' });
  });

  it('renders locked alert and items table for completed GRN document', async () => {
    await act(async () => {
      renderWithState(completedDoc);
    });

    expect(screen.getByTestId('receipt-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Dokumen Penerimaan: GRN/WH01/2608/00001')).toBeInTheDocument();
    expect(screen.getAllByText(/Terkunci/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('table-grn-items')).toBeInTheDocument();
  }, 10000);

  it('handles state machine transition from draft to submitted', async () => {
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
