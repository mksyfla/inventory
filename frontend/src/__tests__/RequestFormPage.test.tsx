import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { RequestFormPage } from '../pages/outbound/RequestFormPage';
import { itemService } from '../api/services/items';
import { warehouseService } from '../api/services/warehouses';
import { partnerService } from '../api/services/partners';
import { outboundService } from '../api/services/outbound';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    importItems: vi.fn(),
    listCategories: vi.fn(),
  },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

vi.mock('../api/services/partners', () => ({
  partnerService: {
    listPartners: vi.fn(),
    getPartner: vi.fn(),
    createPartner: vi.fn(),
  },
}));

vi.mock('../api/services/outbound', () => ({
  outboundService: {
    createRequest: vi.fn(),
    submitRequest: vi.fn(),
    approveRequest: vi.fn(),
    submitDelivery: vi.fn(),
    approveDelivery: vi.fn(),
    allocateDelivery: vi.fn(),
  },
}));

const mockItems = [
  {
    id: 1,
    public_id: 'itm-001-uuid',
    sku: 'SKU-INK-001',
    name: 'Tinta Cetak Hitam Intaglio 1KG',
    category_id: 1,
    base_uom: 'CAN',
    is_batch: true,
    is_expiry: true,
    is_serial: false,
    min_qty: 1,
    max_qty: 100,
    safety_stock: 1,
    lead_time_days: 1,
    abc_class: 'A',
    is_active: true,
  },
];

const mockWarehouses = [
  { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: '', is_active: true },
];

const mockPartners = [
  {
    id: 11,
    code: 'DIV-PASPOR',
    partner_type: 'customer',
    name: 'Divisi Cetak Paspor',
    is_active: true,
  },
];

const renderWithProviders = (initialEntry = '/outbound/requests/new') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/outbound/requests/new" element={<RequestFormPage />} />
          <Route path="/outbound/requests" element={<div data-testid="requests-list-page">Requests List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('RequestFormPage Outbound Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (itemService.listItems as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockWarehouses);
    (partnerService.listPartners as ReturnType<typeof vi.fn>).mockResolvedValue(mockPartners);
    (outboundService.createRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 99, status: 'draft' });
  });

  it('renders item request creation form inputs and items table', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByTestId('request-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-requesting-unit')).toBeInTheDocument();
    expect(screen.getByTestId('select-request-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-request-priority')).toBeInTheDocument();
    expect(screen.getByTestId('table-request-form-items')).toBeInTheDocument();
  }, 10000);

  it('adds dynamic SKU item row and submits request form', async () => {
    await act(async () => {
      renderWithProviders();
    });

    const unitInput = screen.getByTestId('input-requesting-unit');
    await act(async () => {
      fireEvent.change(unitInput, { target: { value: 'Divisi Cetak Paspor' } });
    });

    const addRowBtn = screen.getByTestId('btn-add-request-item-row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    expect(screen.getByTestId('select-request-sku-1')).toBeInTheDocument();

    const saveDraftBtn = screen.getByTestId('btn-save-request-draft');
    await act(async () => {
      fireEvent.click(saveDraftBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('requests-list-page')).toBeInTheDocument();
    });
    expect(outboundService.createRequest).toHaveBeenCalled();
  }, 10000);
});
