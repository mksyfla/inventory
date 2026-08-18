import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptsPage } from '../pages/inbound/ReceiptsPage';

describe('ReceiptsPage Inbound Module', () => {
  it('renders the create GRN button and the not-available notice (no GET /receipts endpoint)', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ReceiptsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('receipts-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-grn')).toBeInTheDocument();
    expect(screen.getByText(/Daftar GRN Belum Tersedia di Backend/i)).toBeInTheDocument();
  }, 10000);
});
