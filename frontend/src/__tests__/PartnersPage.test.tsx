import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PartnersPage } from '../pages/master/PartnersPage';
import { partnerService } from '../api/services/partners';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/partners', () => ({
  partnerService: {
    listPartners: vi.fn(),
    getPartner: vi.fn(),
    createPartner: vi.fn(),
    updatePartner: vi.fn(),
  },
}));

const mockPartners = [
  {
    id: 1,
    code: 'SUP-INK-01',
    partner_type: 'supplier',
    name: 'PT SICPA Perdana Printing Inks',
    address: 'Kawasan Industri Pulogadung, Jakarta Timur',
    contact_name: 'Bpk. Hendra Wahyudi',
    contact_phone: '021-4601234',
    is_active: true,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('PartnersPage Master Data Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (partnerService.listPartners as ReturnType<typeof vi.fn>).mockResolvedValue(mockPartners);
    (partnerService.createPartner as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 2,
      code: 'SUP-NEW-01',
      partner_type: 'supplier',
      name: 'PT Vendor Baru Indonesia',
      is_active: true,
    });
    (partnerService.updatePartner as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      code: 'SUP-INK-01',
      partner_type: 'supplier',
      name: 'PT SICPA Perdana Printing Inks',
      address: 'Kawasan Industri Pulogadung, Jakarta Timur',
      contact_name: 'Bpk. Hendra Wahyudi',
      contact_phone: '021-4601234',
      is_active: true,
    });
  });

  it('renders partner list table, search bar, and add partner button', async () => {
    await act(async () => {
      renderWithProviders(<PartnersPage />);
    });

    expect(screen.getByTestId('partners-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-partner')).toBeInTheDocument();
    expect(screen.getByTestId('select-filter-type')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-partner')).toBeInTheDocument();
    expect(screen.getByTestId('table-partners')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('PT SICPA Perdana Printing Inks')).toBeInTheDocument();
    });
  }, 10000);

  it('opens add modal and submits new partner data', async () => {
    await act(async () => {
      renderWithProviders(<PartnersPage />);
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

    await waitFor(
      () => {
        expect(partnerService.createPartner).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  }, 10000);

  it('opens edit modal and submits updated partner data via PATCH', async () => {
    await act(async () => {
      renderWithProviders(<PartnersPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('PT SICPA Perdana Printing Inks')).toBeInTheDocument();
    });

    const editBtn = screen.getByTestId('btn-edit-partner-1');
    await act(async () => {
      fireEvent.click(editBtn);
    });

    expect(screen.getByTestId('modal-partner-form')).toBeInTheDocument();

    const nameInput = screen.getByTestId('input-partner-name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'PT SICPA Perdana Updated' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-partner');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(
      () => {
        expect(partnerService.updatePartner).toHaveBeenCalledWith(1, {
          code: 'SUP-INK-01',
          partner_type: 'supplier',
          name: 'PT SICPA Perdana Updated',
          address: 'Kawasan Industri Pulogadung, Jakarta Timur',
          contact_name: 'Bpk. Hendra Wahyudi',
          contact_phone: '021-4601234',
          is_active: true,
        });
      },
      { timeout: 3000 }
    );
  }, 10000);
});
