import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceiptDetailPage } from '../pages/inbound/ReceiptDetailPage';

describe('ReceiptDetailPage Inbound Module', () => {
  it('renders locked alert and items table for completed GRN document', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/1']}>
          <Routes>
            <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('receipt-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Dokumen Penerimaan: GRN-2026-08-001')).toBeInTheDocument();
    expect(screen.getByText(/Dokumen Penerimaan Terkunci/i)).toBeInTheDocument();
    expect(screen.getByTestId('table-grn-items')).toBeInTheDocument();

    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
    expect(screen.getByText('Tinta Cetak Hitam Intaglio 1KG')).toBeInTheDocument();
  }, 10000);

  it('handles state machine transition from draft to submitted', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/3']}>
          <Routes>
            <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Dokumen Penerimaan: GRN-2026-08-003')).toBeInTheDocument();
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
