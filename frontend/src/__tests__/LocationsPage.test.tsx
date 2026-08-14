import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocationsPage } from '../pages/master/LocationsPage';

describe('LocationsPage Component', () => {
  it('renders nested location tree structure, filter dropdown, and action buttons', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <LocationsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('locations-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-filter')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-root-location')).toBeInTheDocument();
    expect(screen.getByTestId('table-locations-tree')).toBeInTheDocument();

    // Check location tree nodes
    expect(screen.getByText('JKT01-Z1')).toBeInTheDocument();
    expect(screen.getByText('Zona A - Bahan Baku & Tinta Cetak')).toBeInTheDocument();
  });

  it('opens LocationBarcodeModal when clicking print barcode button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <LocationsPage />
        </MemoryRouter>
      );
    });

    const barcodeBtn = screen.getByTestId('btn-barcode-loc-10');
    await act(async () => {
      fireEvent.click(barcodeBtn);
    });

    expect(screen.getByTestId('modal-location-barcode')).toBeInTheDocument();
    expect(screen.getByTestId('qrcode-element')).toBeInTheDocument();
    expect(screen.getByTestId('btn-print-label')).toBeInTheDocument();
  });
});
