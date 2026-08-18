import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DeliveriesPage } from '../pages/outbound/DeliveriesPage';

describe('DeliveriesPage Outbound Module', () => {
  it('renders Delivery Orders list table, search bar, and status filter', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <DeliveriesPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('deliveries-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-do')).toBeInTheDocument();
    expect(screen.getByTestId('select-filter-do-status')).toBeInTheDocument();
    expect(screen.getByTestId('table-deliveries')).toBeInTheDocument();

    expect(screen.getByText('DO-2026-08-001')).toBeInTheDocument();
    expect(screen.getByText('Kementerian Luar Negeri RI (Kemlu)')).toBeInTheDocument();
  }, 10000);

  it('filters delivery list when searching for DO Number', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <DeliveriesPage />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('input-search-do');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'DO-2026-08-002' } });
    });

    await waitFor(() => {
      expect(screen.getByText('DO-2026-08-002')).toBeInTheDocument();
      expect(screen.queryByText('DO-2026-08-001')).not.toBeInTheDocument();
    });
  }, 10000);
});
