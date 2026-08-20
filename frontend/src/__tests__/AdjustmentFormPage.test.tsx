import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AdjustmentFormPage } from '../pages/counting/AdjustmentFormPage';
import { warehouseService } from '../api/services/warehouses';
import { itemService } from '../api/services/items';
import { locationService } from '../api/services/locations';
import { countService } from '../api/services/counting';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

vi.mock('../api/services/items', () => ({
  itemService: { listItems: vi.fn() },
}));

vi.mock('../api/services/locations', () => ({
  locationService: { listLocations: vi.fn() },
}));

vi.mock('../api/services/counting', () => ({
  countService: { createAdjustment: vi.fn() },
}));

const makeMockWarehouses = () => [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: '', is_active: true },
  { id: 2, code: 'WH02', name: 'Gudang Cabang Bandung', address: '', is_active: true },
];

const makeMockItems = () => [
  {
    id: 1,
    public_id: 'item-1',
    sku: 'SKU-PITA-001',
    name: 'Pita Cukai Hasil Tembakau 2026',
    category_id: 1,
    base_uom: 'RIM',
    is_batch: true,
    is_expiry: false,
    is_serial: false,
    min_qty: 0,
    max_qty: null,
    safety_stock: 0,
    lead_time_days: 0,
    abc_class: 'A',
    is_active: true,
  },
];

const makeMockLocations = () => [
  {
    id: 101,
    warehouse_id: 1,
    code: 'JKT01-Z1-R01-B01',
    zone: 'Z1',
    rack: 'R01',
    level: 'B01',
    loc_type: 'bulk',
    pick_seq: null,
    capacity: 1000,
    is_active: true,
  },
];

const makeMockCreatedDoc = () => ({
  id: 900,
  public_id: 'adj-900',
  doc_no: 'ADJ/2026/08/0900',
  doc_type: 'ADJ',
  doc_date: '2026-08-18',
  status: 'completed',
  warehouse_id: 1,
  reason_code: 'COUNT_DISCREPANCY',
  notes: 'Penyesuaian hasil temuan stok fisik dilapangan',
  created_by: 3,
});

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdjustmentFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('AdjustmentFormPage Component (FE-604)', () => {
  beforeEach(() => {
    queryClient.clear();
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockWarehouses());
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItems());
    (locationService.listLocations as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockLocations());
    (countService.createAdjustment as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCreatedDoc());
  });

  it('renders manual adjustment form, warehouse & bin selectors, SKU select, adjustment type radio, and submit button', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByTestId('adjustment-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-bin')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-sku')).toBeInTheDocument();
    expect(screen.getByTestId('input-adj-batch')).toBeInTheDocument();
    expect(screen.getByTestId('radio-adj-type')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-reason')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-adjustment')).toBeInTheDocument();
  }, 10000);

  it('submits a plus adjustment calling createAdjustment with the FR-6.5 payload', async () => {
    await act(async () => {
      renderWithProviders();
    });

    // Wait for the bin options to load so the code->id mapping is available.
    expect(await screen.findByText('JKT01-Z1-R01-B01 - bulk')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('btn-submit-adjustment');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(countService.createAdjustment).toHaveBeenCalledWith({
        warehouse_id: 1,
        reason_code: 'COUNT_DISCREPANCY',
        notes: 'Penyesuaian hasil temuan stok fisik dilapangan',
        lines: [{ item_id: 1, location_id: 101, qty: 10, status: 'available' }],
      });
    });
  }, 10000);

  it('submits a minus adjustment with a signed negative qty', async () => {
    await act(async () => {
      renderWithProviders();
    });

    // Wait for the bin options to load so the code->id mapping is available.
    expect(await screen.findByText('JKT01-Z1-R01-B01 - bulk')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Kurang Stok (-)'));
    });

    const submitBtn = screen.getByTestId('btn-submit-adjustment');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(countService.createAdjustment).toHaveBeenCalledWith({
        warehouse_id: 1,
        reason_code: 'COUNT_DISCREPANCY',
        notes: 'Penyesuaian hasil temuan stok fisik dilapangan',
        lines: [{ item_id: 1, location_id: 101, qty: -10, status: 'available' }],
      });
    });
  }, 10000);
});
