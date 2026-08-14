import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptsPage } from '../pages/inbound/ReceiptsPage';

describe('ReceiptsPage Inbound Module', () => {
  it('renders GRN document list table, search bar, and status filters', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ReceiptsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('receipts-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-grn')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-grn')).toBeInTheDocument();
    expect(screen.getByTestId('table-receipts')).toBeInTheDocument();

    expect(screen.getByText('GRN-2026-08-001')).toBeInTheDocument();
    expect(screen.getByText('PO-2026-0102')).toBeInTheDocument();
    expect(screen.getAllByText('PT SICPA Perdana Printing Inks')[0]).toBeInTheDocument();
  }, 10000);

  it('filters GRN document list when searching for PO Reference', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ReceiptsPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-grn');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'PO-2026-0108' } });
    });

    await waitFor(() => {
      expect(screen.getByText('GRN-2026-08-002')).toBeInTheDocument();
      expect(screen.queryByText('GRN-2026-08-001')).not.toBeInTheDocument();
    });
  }, 10000);
});
