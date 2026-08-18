import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RequestsPage } from '../pages/outbound/RequestsPage';

describe('RequestsPage Outbound Module', () => {
  it('renders item request list table, search bar, and filter dropdowns', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <RequestsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('requests-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-request')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-request')).toBeInTheDocument();
    expect(screen.getByTestId('table-requests')).toBeInTheDocument();

    expect(screen.getByText('REQ-2026-08-001')).toBeInTheDocument();
    expect(screen.getByText('Divisi Cetak Paspor & Dokumen Negara')).toBeInTheDocument();
  }, 10000);

  it('filters item request list when searching by requesting unit', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <RequestsPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-request');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Pita Cukai' } });
    });

    await waitFor(() => {
      expect(screen.getByText('REQ-2026-08-002')).toBeInTheDocument();
      expect(screen.queryByText('REQ-2026-08-001')).not.toBeInTheDocument();
    });
  }, 10000);
});
