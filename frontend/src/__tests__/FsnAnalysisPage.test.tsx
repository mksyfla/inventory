import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { FsnAnalysisPage } from '../pages/reports/FsnAnalysisPage';
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

const mockFsnReports = [
  {
    id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    category_name: 'Pita Cukai',
    base_uom: 'RIM',
    last_movement_date: '2026-08-16',
    fsn_category: 'fast_moving',
    turnover_ratio: 14.5,
    current_qty: 250,
    total_valuation: 6250000000,
  },
  {
    id: 2,
    sku: 'SKU-TINTA-002',
    item_name: 'Tinta Cetak Sekuritas Siklamat Biru',
    category_name: 'Tinta Cetak Sekuritas',
    base_uom: 'KG',
    last_movement_date: '2026-07-20',
    fsn_category: 'slow_moving',
    turnover_ratio: 2.1,
    current_qty: 80,
    total_valuation: 1200000000,
  },
  {
    id: 3,
    sku: 'SKU-KERTAS-003',
    item_name: 'Kertas Banknote Uang Kertas Rp 100.000',
    category_name: 'Kertas Sekuritas',
    base_uom: 'REAM',
    last_movement_date: '2025-08-10',
    fsn_category: 'dead_stock',
    turnover_ratio: 0,
    current_qty: 15,
    total_valuation: 450000000,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('FsnAnalysisPage Component (FE-702)', () => {
  beforeEach(() => {
    queryClient.clear();
    (reportService.fsn as ReturnType<typeof vi.fn>).mockResolvedValue(mockFsnReports);
  });

  it('renders FSN analysis table, search input, FSN category filter, and statistic cards', async () => {
    await act(async () => {
      renderWithProviders(<FsnAnalysisPage />);
    });

    expect(screen.getByTestId('fsn-analysis-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-fsn')).toBeInTheDocument();
    expect(screen.getByTestId('select-fsn-category')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-category')).toBeInTheDocument();
    expect(screen.getByTestId('table-fsn-analysis')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    });
  }, 10000);

  it('filters FSN report table by SKU search query', async () => {
    await act(async () => {
      renderWithProviders(<FsnAnalysisPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('SKU-KERTAS-003')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-fsn');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'SKU-PITA-001' } });
    });

    await waitFor(() => {
      expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
      expect(screen.queryByText('SKU-KERTAS-003')).not.toBeInTheDocument();
    });
  }, 10000);
});
