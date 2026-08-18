import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StockCardPage } from '../pages/stock/StockCardPage';

describe('StockCardPage Component (FE-502)', () => {
  it('renders stock card page, item summary, append-only banner, and ledger movement table', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockCardPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('stock-card-page')).toBeInTheDocument();
    expect(screen.getByTestId('alert-append-only-banner')).toBeInTheDocument();
    expect(screen.getByTestId('select-sku-card')).toBeInTheDocument();
    expect(screen.getByTestId('card-item-summary')).toBeInTheDocument();
    expect(screen.getByTestId('table-stock-ledger')).toBeInTheDocument();
  }, 10000);
});
