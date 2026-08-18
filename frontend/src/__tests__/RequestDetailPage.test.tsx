import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequestDetailPage } from '../pages/outbound/RequestDetailPage';

describe('RequestDetailPage Outbound Module', () => {
  it('renders request details, metadata, and items table', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/requests/1']}>
          <Routes>
            <Route path="/outbound/requests/:id" element={<RequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('request-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Permintaan Barang: REQ-2026-08-001')).toBeInTheDocument();
    expect(screen.getByTestId('table-request-items')).toBeInTheDocument();
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
  }, 10000);

  it('handles state machine transition from submitted to approved', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/requests/1']}>
          <Routes>
            <Route path="/outbound/requests/:id" element={<RequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const approveBtn = screen.getByTestId('btn-action-approve-request');
    expect(approveBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(approveBtn);
    });

    expect(screen.getByTestId('btn-action-fulfill-request')).toBeInTheDocument();
  }, 10000);

  it('opens RejectRequestModal and submits rejection reason', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/requests/1']}>
          <Routes>
            <Route path="/outbound/requests/:id" element={<RequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const rejectBtn = screen.getByTestId('btn-action-reject-request');
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    expect(screen.getByTestId('modal-reject-request')).toBeInTheDocument();

    const submitRejectionBtn = screen.getByTestId('btn-submit-request-rejection');
    await act(async () => {
      fireEvent.click(submitRejectionBtn);
    });

    expect(screen.getByTestId('alert-request-rejected')).toBeInTheDocument();
  }, 10000);
});
