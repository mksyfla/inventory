import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ItemUomTab } from '../components/master/ItemUomTab';
import { itemService } from '../api/services/items';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/items', () => ({
  itemService: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    softDeleteItem: vi.fn(),
    importItems: vi.fn(),
  },
}));

const mockItemDetail = {
  item: { id: 1, sku: 'SKU-001', base_uom: 'CAN' },
  uoms: [
    { id: 1, item_id: 1, uom: 'CAN', conv_factor: 1, barcode: '899000111222' },
    { id: 2, item_id: 1, uom: 'BOX', conv_factor: 12, barcode: '899000111999' },
    { id: 3, item_id: 1, uom: 'KARTON', conv_factor: 48, barcode: '899000111888' },
  ],
};

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );

describe('ItemUomTab Component', () => {
  beforeEach(() => {
    queryClient.clear();
    (itemService.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(mockItemDetail);
  });

  it('renders base UoM alert and conversion table list', async () => {
    await act(async () => {
      renderWithProviders(<ItemUomTab itemId={1} baseUom="CAN" />);
    });

    expect(screen.getByTestId('item-uom-tab')).toBeInTheDocument();
    expect(screen.getByText(/Satuan Dasar Terdaftar: CAN/i)).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-uom')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('CAN')[0]).toBeInTheDocument();
      expect(screen.getByText('BOX')).toBeInTheDocument();
      expect(screen.getByText('KARTON')).toBeInTheDocument();
    });
  });

  it('opens add modal and submits new UoM conversion', async () => {
    await act(async () => {
      renderWithProviders(<ItemUomTab itemId={1} baseUom="CAN" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-add-uom')).toBeInTheDocument();
    });

    const addBtn = screen.getByTestId('btn-add-uom');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByTestId('modal-uom-form')).toBeInTheDocument();
    expect(screen.getByTestId('input-uom-name')).toBeInTheDocument();

    const nameInput = screen.getByTestId('input-uom-name');
    const barcodeInput = screen.getByTestId('input-uom-barcode');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'PACK' } });
      fireEvent.change(barcodeInput, { target: { value: '899999000111' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-uom');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('PACK')).toBeInTheDocument();
      expect(screen.getByText('899999000111')).toBeInTheDocument();
    });
  });

  it('prevents adding duplicate barcode for a different UoM', async () => {
    await act(async () => {
      renderWithProviders(<ItemUomTab itemId={1} baseUom="CAN" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-add-uom')).toBeInTheDocument();
    });

    const addBtn = screen.getByTestId('btn-add-uom');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    const nameInput = screen.getByTestId('input-uom-name');
    const barcodeInput = screen.getByTestId('input-uom-barcode');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'PALLET' } });
      // Duplicate barcode used by BOX (899000111999)
      fireEvent.change(barcodeInput, { target: { value: '899000111999' } });
    });

    const submitBtn = screen.getByTestId('btn-submit-uom');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Barcode '899000111999' sudah digunakan/i)).toBeInTheDocument();
    });
  });
});
