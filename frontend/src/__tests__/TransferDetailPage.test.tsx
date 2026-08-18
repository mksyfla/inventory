import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransferDetailPage } from '../pages/transfer/TransferDetailPage';

describe('TransferDetailPage Component (FE-402 & FE-403)', () => {
  it('renders transfer detail page, status tag, items table, and confirm transfer in button for TRF #1', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/transfer/1']}>
          <Routes>
            <Route path="/transfer/:id" element={<TransferDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('transfer-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-transfer-items')).toBeInTheDocument();
    expect(screen.getByTestId('btn-confirm-transfer-in')).toBeInTheDocument();
  }, 10000);

  it('renders discrepancy warning alert and reason textarea for TRF #2 with partial received status (FE-403)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/transfer/2']}>
          <Routes>
            <Route path="/transfer/:id" element={<TransferDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('alert-discrepancy-warning')).toBeInTheDocument();
    expect(screen.getByTestId('input-discrepancy-reason')).toBeInTheDocument();
  }, 10000);
});
