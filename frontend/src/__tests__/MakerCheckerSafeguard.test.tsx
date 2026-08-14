import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

const submittedDoc: ReceiptDocumentDTO = {
  id: 2,
  public_id: 'pub-2',
  doc_no: 'GRN/WH01/2608/00002',
  doc_type: 'GRN',
  doc_date: '2026-08-12',
  status: 'submitted',
  warehouse_id: 1,
  partner_id: 1,
  created_by: 1,
  lines: [
    { id: 1, line_no: 1, item_id: 3, uom: 'ROLL', qty_request: 20, qty_processed: 0, batch_id: null, location_id: null, status: 'available' },
  ],
};

const renderWithState = (createdBy: number, user: any) => {
  useAuthStore.setState({
    isAuthenticated: true,
    token: 'token',
    user,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: '/inbound/receipts/2', state: { receipt: { ...submittedDoc, created_by: createdBy } } }]}>
        <Routes>
          <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Maker-Checker Safeguard (BR-05) & Rejection Flow', () => {
  beforeEach(() => {
    queryClient.clear();
    (receiptService.submitReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2, status: 'submitted' });
    (receiptService.approveReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2, status: 'approved' });
  });

  it('disables Approve button and shows Maker-Checker alert when current user created the GRN', async () => {
    await act(async () => {
      renderWithState(1, {
        id: 1,
        username: 'budi_gudang',
        fullName: 'Budi Santoso',
        email: 'budi@peruri.co.id',
        roles: ['inbound_staff'],
        permissions: ['grn.approve', 'grn.read'],
        assignedWarehouseIds: [1],
      });
    });

    expect(screen.getByTestId('alert-maker-checker')).toBeInTheDocument();
    const approveBtn = screen.getByTestId('btn-action-approve');
    expect(approveBtn).toBeDisabled();
  });

  it('enables Approve button when current user is a different manager/checker', async () => {
    await act(async () => {
      renderWithState(1, {
        id: 2,
        username: 'dewi_manager',
        fullName: 'Dewi Lestari',
        email: 'dewi@peruri.co.id',
        roles: ['manager'],
        permissions: ['grn.approve', 'grn.read'],
        assignedWarehouseIds: [1],
      });
    });

    expect(screen.queryByTestId('alert-maker-checker')).not.toBeInTheDocument();
    const approveBtn = screen.getByTestId('btn-action-approve');
    expect(approveBtn).not.toBeDisabled();
  });

  it('opens RejectReasonModal and submits rejection reason', async () => {
    await act(async () => {
      renderWithState(1, {
        id: 2,
        username: 'dewi_manager',
        fullName: 'Dewi Lestari',
        email: 'dewi@peruri.co.id',
        roles: ['manager'],
        permissions: ['grn.approve', 'grn.read'],
        assignedWarehouseIds: [1],
      });
    });

    const rejectBtn = screen.getByTestId('btn-action-reject');
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    expect(screen.getByTestId('modal-reject-reason')).toBeInTheDocument();

    const submitRejectionBtn = screen.getByTestId('btn-submit-rejection');
    await act(async () => {
      fireEvent.click(submitRejectionBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-action-submit')).toBeInTheDocument();
    });
  });
});
