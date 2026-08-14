import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PartnersPage } from '../pages/master/PartnersPage';

describe('PartnersPage Master Data Component', () => {
  it('renders partner list table, search bar, and add partner button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PartnersPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('partners-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-partner')).toBeInTheDocument();
    expect(screen.getByTestId('select-filter-type')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-partner')).toBeInTheDocument();
    expect(screen.getByTestId('table-partners')).toBeInTheDocument();

    expect(screen.getByText('PT SICPA Perdana Printing Inks')).toBeInTheDocument();
  }, 10000);

  it('opens add modal and submits new partner data', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <PartnersPage />
        </MemoryRouter>
      );
    });

    const addBtn = screen.getByTestId('btn-add-partner');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByTestId('modal-partner-form')).toBeInTheDocument();

    const codeInput = screen.getByTestId('input-partner-code');
    const nameInput = screen.getByTestId('input-partner-name');

    await act(async () => {
      fireEvent.change(codeInput, { target: { value: 'SUP-NEW-01' } });
      fireEvent.change(nameInput, { target: { value: 'PT Vendor Baru Indonesia' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-partner');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('SUP-NEW-01')).toBeInTheDocument();
      expect(screen.getByText('PT Vendor Baru Indonesia')).toBeInTheDocument();
    });
  }, 10000);
});
