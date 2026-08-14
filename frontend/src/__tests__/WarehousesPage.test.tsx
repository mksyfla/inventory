import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WarehousesPage } from '../pages/master/WarehousesPage';

describe('WarehousesPage Component', () => {
  it('renders warehouse list table and add new warehouse button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <WarehousesPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('warehouses-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('table-warehouses')).toBeInTheDocument();

    expect(screen.getByText('WH-JKT01')).toBeInTheDocument();
    expect(screen.getByText('Gudang Utama Jakarta (Kawasan Peruri)')).toBeInTheDocument();
  });

  it('opens add modal and submits new warehouse data', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <WarehousesPage />
        </MemoryRouter>
      );
    });

    const addBtn = screen.getByTestId('btn-add-warehouse');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByTestId('modal-warehouse-form')).toBeInTheDocument();

    const codeInput = screen.getByTestId('input-wh-code');
    const nameInput = screen.getByTestId('input-wh-name');

    await act(async () => {
      fireEvent.change(codeInput, { target: { value: 'WH-SUB01' } });
      fireEvent.change(nameInput, { target: { value: 'Gudang Surabaya' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-wh');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('WH-SUB01')).toBeInTheDocument();
      expect(screen.getByText('Gudang Surabaya')).toBeInTheDocument();
    });
  });
});
