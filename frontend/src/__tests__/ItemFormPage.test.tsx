import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ItemFormPage } from '../pages/master/ItemFormPage';

describe('ItemFormPage Component', () => {
  it('renders SKU creation form fields and submits valid form data', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/master/items/new']}>
          <Routes>
            <Route path="/master/items/new" element={<ItemFormPage />} />
            <Route path="/master/items" element={<div data-testid="items-list-target">Items List</div>} />
          </Routes>
        </MemoryRouter>
      );
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
      render(
        <MemoryRouter initialEntries={['/master/items/new']}>
          <ItemFormPage />
        </MemoryRouter>
      );
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
