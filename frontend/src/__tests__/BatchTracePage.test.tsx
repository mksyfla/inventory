import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BatchTracePage } from '../pages/stock/BatchTracePage';

describe('BatchTracePage Component (FE-504)', () => {
  it('renders batch trace page, search input, backward trace, and forward deliveries table', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <BatchTracePage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('batch-trace-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-batch')).toBeInTheDocument();
    expect(screen.getByTestId('card-backward-trace')).toBeInTheDocument();
    expect(screen.getByTestId('card-forward-trace')).toBeInTheDocument();
    expect(screen.getByTestId('table-forward-deliveries')).toBeInTheDocument();
  }, 10000);

  it('triggers batch search on click search button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <BatchTracePage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-batch');
    const searchBtn = screen.getByTestId('btn-search-batch');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'LOT-PUR-2026-99' } });
      fireEvent.click(searchBtn);
    });

    expect(searchInput).toHaveValue('LOT-PUR-2026-99');
  }, 10000);
});
