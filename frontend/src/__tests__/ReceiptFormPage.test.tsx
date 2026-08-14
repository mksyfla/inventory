import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceiptFormPage } from '../pages/inbound/ReceiptFormPage';

describe('ReceiptFormPage Component', () => {
  it('renders GRN creation form header, supplier select, and dynamic item lines table', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/new']}>
          <Routes>
            <Route path="/inbound/receipts/new" element={<ReceiptFormPage />} />
            <Route path="/inbound/receipts" element={<div data-testid="receipts-list-page">Receipts List</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('receipt-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-po-reference')).toBeInTheDocument();
    expect(screen.getByTestId('select-supplier')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('table-form-items')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-item-row')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-draft')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-submit')).toBeInTheDocument();
  });

  it('adds dynamic item line row when clicking add button and submits form', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/new']}>
          <Routes>
            <Route path="/inbound/receipts/new" element={<ReceiptFormPage />} />
            <Route path="/inbound/receipts" element={<div data-testid="receipts-list-page">Receipts List</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    const poInput = screen.getByTestId('input-po-reference');
    await act(async () => {
      fireEvent.change(poInput, { target: { value: 'PO-2026-0888' } });
    });

    const addRowBtn = screen.getByTestId('btn-add-item-row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    // Check second item row fields exist
    expect(screen.getByTestId('select-item-sku-1')).toBeInTheDocument();

    const saveDraftBtn = screen.getByTestId('btn-save-draft');
    await act(async () => {
      fireEvent.click(saveDraftBtn);
    });

    await waitFor(() => {
      // Navigates successfully to receipts list page
      expect(screen.getByTestId('receipts-list-page')).toBeInTheDocument();
    });
  }, 10000);
});
