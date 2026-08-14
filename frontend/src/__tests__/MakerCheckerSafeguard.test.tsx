import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceiptDetailPage } from '../pages/inbound/ReceiptDetailPage';
import { useAuthStore } from '../store/useAuthStore';

describe('Maker-Checker Safeguard (BR-05) & Rejection Flow', () => {
  beforeEach(() => {
    // Reset AuthStore user
    useAuthStore.setState({
      user: {
        id: 1,
        username: 'budi_gudang',
        fullName: 'Budi Santoso (Admin Gudang)', // Same as maker of GRN-2026-08-002
        email: 'budi@peruri.co.id',
        roles: ['inbound_staff'],
        permissions: ['grn.approve', 'grn.read'],
        assignedWarehouseIds: [1],
      },
    });
  });

  it('disables Approve button and shows Maker-Checker alert when current user created the GRN', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/2']}>
          <Routes>
            <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('alert-maker-checker')).toBeInTheDocument();
    const approveBtn = screen.getByTestId('btn-action-approve');
    expect(approveBtn).toBeDisabled();
  });

  it('enables Approve button when current user is a different manager/checker', async () => {
    // Set logged in user to Manager
    useAuthStore.setState({
      user: {
        id: 2,
        username: 'dewi_manager',
        fullName: 'Dewi Lestari (Manager Gudang)',
        email: 'dewi@peruri.co.id',
        roles: ['manager'],
        permissions: ['grn.approve', 'grn.read'],
        assignedWarehouseIds: [1],
      },
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/2']}>
          <Routes>
            <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.queryByTestId('alert-maker-checker')).not.toBeInTheDocument();
    const approveBtn = screen.getByTestId('btn-action-approve');
    expect(approveBtn).not.toBeDisabled();
  });

  it('opens RejectReasonModal and submits rejection reason', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/2']}>
          <Routes>
            <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
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
