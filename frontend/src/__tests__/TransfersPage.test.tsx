import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TransfersPage } from '../pages/transfer/TransfersPage';

describe('TransfersPage Component (FE-401)', () => {
  it('renders transfers table, search bar, status filter, and create transfer button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TransfersPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('transfers-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-transfer')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-transfers')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-transfer')).toBeInTheDocument();
  }, 10000);

  it('filters transfers table by search query', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TransfersPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-transfer');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'TRF-2026-08-001' } });
    });

    expect(screen.getByText('TRF-2026-08-001')).toBeInTheDocument();
  }, 10000);
});
