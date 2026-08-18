import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WarehousesPage } from '../pages/master/WarehousesPage';

describe('WarehousesPage Component', () => {
  it('renders the warehouse list from session context with a not-available notice', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <WarehousesPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('warehouses-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-warehouses')).toBeInTheDocument();
    expect(screen.getByText(/Endpoint Gudang Tidak Tersedia/i)).toBeInTheDocument();
    // Mock warehouses are seeded in the store (JKT01 is first)
    expect(screen.getByText('JKT01')).toBeInTheDocument();
  }, 10000);
});
