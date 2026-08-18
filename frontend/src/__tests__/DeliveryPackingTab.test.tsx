import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryPackingTab } from '../components/outbound/DeliveryPackingTab';
import { MOCK_DO_LIST, DeliveryOrder } from '../types/outbound';

describe('DeliveryPackingTab Component (FE-304)', () => {
  it('renders packing reconciliation table, driver inputs, and post shipment button', async () => {
    const mockOnPost = vi.fn();

    await act(async () => {
      render(
        <DeliveryPackingTab
          delivery={MOCK_DO_LIST[0]}
          onPostShipment={mockOnPost}
        />
      );
    });

    expect(screen.getByTestId('delivery-packing-tab')).toBeInTheDocument();
    expect(screen.getByTestId('table-packing-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('input-driver-name')).toBeInTheDocument();
    expect(screen.getByTestId('input-vehicle-plate')).toBeInTheDocument();
    expect(screen.getByTestId('btn-post-shipment')).toBeInTheDocument();
  }, 10000);

  it('submits shipment posting when driver name and vehicle plate are entered and items are reconciled', async () => {
    const mockOnPost = vi.fn();

    const reconciledDelivery: DeliveryOrder = {
      ...MOCK_DO_LIST[0],
      items: MOCK_DO_LIST[0].items.map((item) => ({
        ...item,
        qtyPacked: item.qtyOrdered,
      })),
    };

    await act(async () => {
      render(
        <DeliveryPackingTab
          delivery={reconciledDelivery}
          onPostShipment={mockOnPost}
        />
      );
    });

    const driverInput = screen.getByTestId('input-driver-name');
    const plateInput = screen.getByTestId('input-vehicle-plate');
    const shipBtn = screen.getByTestId('btn-post-shipment');

    expect(shipBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.change(driverInput, { target: { value: 'Sujono (Kurir Peruri)' } });
      fireEvent.change(plateInput, { target: { value: 'B 9842 PQA' } });
      fireEvent.click(shipBtn);
    });

    expect(mockOnPost).toHaveBeenCalledWith('Sujono (Kurir Peruri)', 'B 9842 PQA', '');
  }, 10000);
});
