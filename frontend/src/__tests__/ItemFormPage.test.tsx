import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ItemFormPage } from '../pages/master/ItemFormPage';
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
  },
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/master/items/new']}>
        <Routes>
          <Route path="/master/items/new" element={ui} />
          <Route path="/master/items" element={<div data-testid="items-list-target">Items List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('ItemFormPage Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (itemService.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 999 });
    (itemService.updateItem as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 999 });
  });

  it('renders SKU creation form fields and submits valid form data', async () => {
    await act(async () => {
      renderWithProviders(<ItemFormPage />);
    });

    expect(screen.getByTestId('item-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-sku')).toBeInTheDocument();
    expect(screen.getByTestId('input-name')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-item-form')).toBeInTheDocument();

    // Fill in required fields
    const skuInput = screen.getByTestId('input-sku');
    const nameInput = screen.getByTestId('input-name');

    await act(async () => {
      fireEvent.change(skuInput, { target: { value: 'SKU-NEW-999' } });
      fireEvent.change(nameInput, { target: { value: 'Kertas Uang Baru 100GSM' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-item-form');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('items-list-target')).toBeInTheDocument();
    });
  });

  it('automatically enables isBatch when isExpiry switch is toggled on', async () => {
    await act(async () => {
      renderWithProviders(<ItemFormPage />);
    });

    const expirySwitch = screen.getByTestId('switch-is-expiry');
    const batchSwitch = screen.getByTestId('switch-is-batch');

    // Toggle Expiry ON
    await act(async () => {
      fireEvent.click(expirySwitch);
    });

    // Batch switch should automatically be checked
    expect(batchSwitch).toBeChecked();
  });
});
