import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequestFormPage } from '../pages/outbound/RequestFormPage';

describe('RequestFormPage Outbound Component', () => {
  it('renders item request creation form inputs and items table', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/requests/new']}>
          <Routes>
            <Route path="/outbound/requests/new" element={<RequestFormPage />} />
            <Route path="/outbound/requests" element={<div data-testid="requests-list-page">Requests List</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('request-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-requesting-unit')).toBeInTheDocument();
    expect(screen.getByTestId('select-request-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-request-priority')).toBeInTheDocument();
    expect(screen.getByTestId('table-request-form-items')).toBeInTheDocument();
  }, 10000);

  it('adds dynamic SKU item row and submits request form', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/requests/new']}>
          <Routes>
            <Route path="/outbound/requests/new" element={<RequestFormPage />} />
            <Route path="/outbound/requests" element={<div data-testid="requests-list-page">Requests List</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    const unitInput = screen.getByTestId('input-requesting-unit');
    await act(async () => {
      fireEvent.change(unitInput, { target: { value: 'Divisi Cetak Paspor' } });
    });

    const addRowBtn = screen.getByTestId('btn-add-request-item-row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    expect(screen.getByTestId('select-request-sku-1')).toBeInTheDocument();

    const saveDraftBtn = screen.getByTestId('btn-save-request-draft');
    await act(async () => {
      fireEvent.click(saveDraftBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('requests-list-page')).toBeInTheDocument();
    });
  }, 10000);
});
