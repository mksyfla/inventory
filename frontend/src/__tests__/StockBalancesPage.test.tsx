import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StockBalancesPage } from '../pages/stock/StockBalancesPage';

describe('StockBalancesPage Component (FE-501)', () => {
  it('renders stock balances table, search bar, filters, and statistic cards', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockBalancesPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('stock-balances-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-stock')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-filter')).toBeInTheDocument();
    expect(screen.getByTestId('select-category-filter')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-stock-balances')).toBeInTheDocument();
    expect(screen.getByTestId('btn-nav-batch-trace')).toBeInTheDocument();
  }, 10000);

  it('filters stock balance table by SKU search query', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockBalancesPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-stock');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'SKU-PITA-001' } });
    });

    expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
  }, 10000);
});
