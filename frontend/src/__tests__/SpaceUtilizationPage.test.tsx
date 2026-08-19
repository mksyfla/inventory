import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SpaceUtilizationPage } from '../pages/reports/SpaceUtilizationPage';
import { reportService } from '../api/services/reports';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/reports', () => ({
  reportService: {
    fsn: vi.fn(),
    valuation: vi.fn(),
    spaceUtilization: vi.fn(),
    dashboardSummary: vi.fn(),
  },
}));

const mockSpaceUtilization = [
  {
    warehouse_id: 1,
    warehouse_code: 'WH-JKT01',
    warehouse_name: 'Gudang Utama Jakarta (Kawasan Peruri)',
    location_id: 101,
    location_code: 'JKT01-Z1-R01-B01',
    zone_name: 'Zona A - Bahan Baku & Tinta Cetak',
    loc_type: 'bin',
    capacity_volume_m3: 200,
    used_volume_m3: 160,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('SpaceUtilizationPage Component (FE-703)', () => {
  beforeEach(() => {
    queryClient.clear();
    (reportService.spaceUtilization as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSpaceUtilization
    );
  });

  it('renders space utilization report page, warehouse cards, and zone occupancy tables', async () => {
    await act(async () => {
      renderWithProviders(<SpaceUtilizationPage />);
    });

    expect(screen.getByTestId('space-utilization-page')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('card-warehouse-space-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('table-zones-space-1')).toBeInTheDocument();
  }, 10000);
});
