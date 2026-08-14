import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PutawayPage } from '../pages/inbound/PutawayPage';

describe('PutawayPage Inbound Workflow Component', () => {
  it('renders putaway items table, system bin suggestions, and manual scan inputs', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/1/putaway']}>
          <Routes>
            <Route path="/inbound/receipts/:id/putaway" element={<PutawayPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('putaway-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-camera-scanner')).toBeInTheDocument();
    expect(screen.getByTestId('input-manual-barcode-scan')).toBeInTheDocument();
    expect(screen.getByTestId('table-putaway-items')).toBeInTheDocument();

    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
    expect(screen.getAllByText('JKT01-Z1-R01-B01')[0]).toBeInTheDocument();
  }, 10000);

  it('scans bin barcode and confirms putaway completion', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/inbound/receipts/1/putaway']}>
          <Routes>
            <Route path="/inbound/receipts/:id/putaway" element={<PutawayPage />} />
            <Route path="/inbound/receipts/:id" element={<div data-testid="receipt-detail">Detail Page</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    const scanInput = screen.getByTestId('input-manual-barcode-scan');
    const submitScanBtn = screen.getByTestId('btn-submit-manual-scan');

    // Scan matching Bin location
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'JKT01-Z1-R01-B01' } });
      fireEvent.click(submitScanBtn);
    });

    expect(screen.getByText('Bin Match')).toBeInTheDocument();

    // Confirm putaway for line 0
    const confirmBtn0 = screen.getByTestId('btn-confirm-putaway-0');
    await act(async () => {
      fireEvent.click(confirmBtn0);
    });

    // Scan Bin location for line 1
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'JKT01-Z1-R01-B02' } });
      fireEvent.click(submitScanBtn);
    });

    // Confirm putaway for line 1
    const confirmBtn1 = screen.getByTestId('btn-confirm-putaway-1');
    await act(async () => {
      fireEvent.click(confirmBtn1);
    });

    const completeAllBtn = screen.getByTestId('btn-complete-all-putaway');
    expect(completeAllBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(completeAllBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-detail')).toBeInTheDocument();
    });
  }, 10000);
});
