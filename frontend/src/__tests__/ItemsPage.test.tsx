import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ItemsPage } from '../pages/master/ItemsPage';

describe('ItemsPage Master Data List', () => {
  it('renders table list, search input, and add new SKU button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ItemsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('items-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-new-sku')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-sku')).toBeInTheDocument();
    expect(screen.getByTestId('table-items')).toBeInTheDocument();

    // Check mock items
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
    expect(screen.getByText('Tinta Sekuriti Intaglio Hitam 5KG')).toBeInTheDocument();
  });

  it('filters item list when searching for SKU', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ItemsPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-sku');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Karton' } });
    });

    await waitFor(
      () => {
        expect(screen.getByText('SKU-PKG-003')).toBeInTheDocument();
        expect(screen.queryByText('SKU-INK-001')).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });
});
