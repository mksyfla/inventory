import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ItemUomTab } from '../components/master/ItemUomTab';

describe('ItemUomTab Component', () => {
  it('renders base UoM alert and conversion table list', async () => {
    await act(async () => {
      render(<ItemUomTab itemId={1} baseUom="CAN" />);
    });

    expect(screen.getByTestId('item-uom-tab')).toBeInTheDocument();
    expect(screen.getByText(/Satuan Dasar Terdaftar: CAN/i)).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-uom')).toBeInTheDocument();

    // Check mock items
    expect(screen.getByText('CAN')).toBeInTheDocument();
    expect(screen.getByText('BOX')).toBeInTheDocument();
    expect(screen.getByText('KARTON')).toBeInTheDocument();
  });

  it('opens add modal and submits new UoM conversion', async () => {
    await act(async () => {
      render(<ItemUomTab itemId={1} baseUom="CAN" />);
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
      render(<ItemUomTab itemId={1} baseUom="CAN" />);
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
