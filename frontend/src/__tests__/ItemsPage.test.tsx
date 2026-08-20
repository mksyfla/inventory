import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ItemsPage } from '../pages/master/ItemsPage';
import { itemService } from '../api/services/items';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    importItems: vi.fn(),
    listCategories: vi.fn(),
  },
}));

const mockItems = [
  {
    id: 1,
    public_id: 'itm-001-uuid',
    sku: 'SKU-INK-001',
    name: 'Tinta Sekuriti Intaglio Hitam 5KG',
    category_id: 2,
    base_uom: 'CAN',
    is_batch: true,
    is_expiry: true,
    is_serial: false,
    min_qty: 10,
    max_qty: 100,
    safety_stock: 5,
    lead_time_days: 7,
    abc_class: 'A',
    is_active: true,
  },
  {
    id: 2,
    public_id: 'itm-002-uuid',
    sku: 'SKU-PPR-002',
    name: 'Kertas Sekuriti Watermark 90GSM Roll',
    category_id: 3,
    base_uom: 'ROLL',
    is_batch: true,
    is_expiry: false,
    is_serial: true,
    min_qty: 5,
    max_qty: 50,
    safety_stock: 2,
    lead_time_days: 14,
    abc_class: 'A',
    is_active: true,
  },
  {
    id: 3,
    public_id: 'itm-003-uuid',
    sku: 'SKU-PKG-003',
    name: 'Karton Kemasan Korogated 40x30x20',
    category_id: 5,
    base_uom: 'PCS',
    is_batch: false,
    is_expiry: false,
    is_serial: false,
    min_qty: 100,
    max_qty: 1000,
    safety_stock: 50,
    lead_time_days: 3,
    abc_class: 'C',
    is_active: true,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('ItemsPage Master Data List', () => {
  beforeEach(() => {
    queryClient.clear();
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);
    (itemService.listCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 31, code: 'CAT-RAW', name: 'Bahan Baku', is_active: true },
      { id: 33, code: 'CAT-FG', name: 'Barang Jadi', is_active: true },
      { id: 36, code: 'CAT-PHA', name: 'Farmasi', is_active: true },
    ]);
  });

  it('renders table list, search input, and add new SKU button', async () => {
    await act(async () => {
      renderWithProviders(<ItemsPage />);
    });

    expect(screen.getByTestId('items-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-new-sku')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-sku')).toBeInTheDocument();
    expect(screen.getByTestId('table-items')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
      expect(screen.getByText('Tinta Sekuriti Intaglio Hitam 5KG')).toBeInTheDocument();
    });
  });

  it('filters item list when searching for SKU', async () => {
    await act(async () => {
      renderWithProviders(<ItemsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('SKU-PKG-003')).toBeInTheDocument();
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
