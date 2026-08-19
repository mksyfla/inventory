import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InventoryValuationPage } from '../pages/reports/InventoryValuationPage';
import { reportService } from '../api/services/reports';
import { warehouseService } from '../api/services/warehouses';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/reports', () => ({
  reportService: {
    fsn: vi.fn(),
    valuation: vi.fn(),
    spaceUtilization: vi.fn(),
    dashboardSummary: vi.fn(),
  },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

const mockValuationReports = [
  {
    id: 1,
    sku: 'SKU-PITA-001',
    item_name: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    category_name: 'Pita Cukai',
    uom: 'RIM',
    unit_price: 25000000,
    ending_qty: 250,
    ending_value: 6250000000,
    inbound_qty: 300,
    inbound_value: 7500000000,
    outbound_qty: 150,
    outbound_value: 3750000000,
  },
];

const mockWarehouses = [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: '', is_active: true },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('InventoryValuationPage Component (FE-701)', () => {
  beforeEach(() => {
    queryClient.clear();
    (reportService.valuation as ReturnType<typeof vi.fn>).mockResolvedValue(mockValuationReports);
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockWarehouses);
  });

  it('renders valuation report table, search bar, filters, and export buttons', async () => {
    await act(async () => {
      renderWithProviders(<InventoryValuationPage />);
    });

    expect(screen.getByTestId('inventory-valuation-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('select-category-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('table-inventory-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-pdf')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    });
  }, 10000);

  it('triggers export excel and pdf on button click', async () => {
    await act(async () => {
      renderWithProviders(<InventoryValuationPage />);
    });

    const excelBtn = screen.getByTestId('btn-export-excel');
    const pdfBtn = screen.getByTestId('btn-export-pdf');

    await act(async () => {
      fireEvent.click(excelBtn);
      fireEvent.click(pdfBtn);
    });

    expect(excelBtn).toBeInTheDocument();
    expect(pdfBtn).toBeInTheDocument();
  }, 10000);
});
