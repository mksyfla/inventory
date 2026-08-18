import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PickingScanPage } from '../pages/outbound/PickingScanPage';

describe('PickingScanPage Outbound Mobile Scanner Workflow Component', () => {
  it('renders picking items table, target bin banner, and scan input controls', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/1/picking']}>
          <Routes>
            <Route path="/outbound/deliveries/:id/picking" element={<PickingScanPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('picking-scan-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-scan-barcode')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-camera-scanner')).toBeInTheDocument();
    expect(screen.getByTestId('table-picking-list')).toBeInTheDocument();

    expect(screen.getAllByText('JKT01-Z1-R01-B01')[0]).toBeInTheDocument();
    expect(screen.getAllByText('SKU-INK-001')[0]).toBeInTheDocument();
  }, 10000);

  it('triggers mismatch error alert when an invalid bin barcode is scanned', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/1/picking']}>
          <Routes>
            <Route path="/outbound/deliveries/:id/picking" element={<PickingScanPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const scanInput = screen.getByTestId('input-scan-barcode');
    const submitBtn = screen.getByTestId('btn-submit-scan');

    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'WRONG-BIN-LOCATION-999' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByTestId('alert-scan-mismatch')).toBeInTheDocument();
    expect(screen.getByText(/ERR_SCAN_MISMATCH/)).toBeInTheDocument();
  }, 10000);

  it('scans correct bin and SKU barcode to enable confirmation button', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/1/picking']}>
          <Routes>
            <Route path="/outbound/deliveries/:id/picking" element={<PickingScanPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const scanInput = screen.getByTestId('input-scan-barcode');
    const submitBtn = screen.getByTestId('btn-submit-scan');

    // 1. Scan valid Bin
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'JKT01-Z1-R01-B01' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText('Bin Terverifikasi')).toBeInTheDocument();

    // 2. Scan valid SKU
    await act(async () => {
      fireEvent.change(scanInput, { target: { value: 'SKU-INK-001' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText('SKU Terverifikasi')).toBeInTheDocument();

    // 3. Confirm pick button should be enabled
    const confirmPickBtn = screen.getByTestId('btn-confirm-item-pick');
    expect(confirmPickBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmPickBtn);
    });

    // Pick line #1 completed, active step moves to #2
    expect(screen.getByText('Target Picking Aktif - Langkah #2 dari 2')).toBeInTheDocument();
  }, 10000);
});
