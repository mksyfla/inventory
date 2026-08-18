import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { LocationsPage } from '../pages/master/LocationsPage';
import { locationService } from '../api/services/locations';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/locations', () => ({
  locationService: {
    listLocations: vi.fn(),
    createLocation: vi.fn(),
  },
}));

const mockLocations = [
  {
    id: 10,
    warehouse_id: 1,
    code: 'STG-01-01',
    zone: 'STG',
    rack: 'R01',
    level: 'L1',
    loc_type: 'staging',
    pick_seq: null,
    capacity: 500,
    is_active: true,
  },
  {
    id: 20,
    warehouse_id: 1,
    code: 'PK-01-01',
    zone: 'PK',
    rack: 'R01',
    level: 'L1',
    loc_type: 'pick',
    pick_seq: 1,
    capacity: 1000,
    is_active: true,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('LocationsPage Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (locationService.listLocations as ReturnType<typeof vi.fn>).mockResolvedValue(mockLocations);
  });

  it('renders location list, filter dropdown, and add button', async () => {
    await act(async () => {
      renderWithProviders(<LocationsPage />);
    });

    expect(screen.getByTestId('locations-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-filter')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-root-location')).toBeInTheDocument();
    expect(screen.getByTestId('table-locations-tree')).toBeInTheDocument();

    expect(await screen.findByText('PK-01-01')).toBeInTheDocument();
  });

  it('opens LocationBarcodeModal when clicking print barcode button', async () => {
    await act(async () => {
      renderWithProviders(<LocationsPage />);
    });

    const barcodeBtn = await screen.findByTestId('btn-barcode-loc-20');
    await act(async () => {
      fireEvent.click(barcodeBtn);
    });

    expect(screen.getByTestId('modal-location-barcode')).toBeInTheDocument();
    expect(screen.getByTestId('qrcode-element')).toBeInTheDocument();
    expect(screen.getByTestId('btn-print-label')).toBeInTheDocument();
  });
});
