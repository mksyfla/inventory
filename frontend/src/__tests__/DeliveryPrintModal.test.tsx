import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryPrintModal } from '../components/outbound/DeliveryPrintModal';
import { MOCK_DO_LIST } from '../types/outbound';

describe('DeliveryPrintModal Component (FE-305)', () => {
  it('renders 3-ply printable Delivery Order document with header and item details', async () => {
    const mockOnClose = vi.fn();

    await act(async () => {
      render(
        <DeliveryPrintModal
          open={true}
          delivery={MOCK_DO_LIST[0]}
          onClose={mockOnClose}
        />
      );
    });

    expect(screen.getByTestId('modal-delivery-print')).toBeInTheDocument();
    expect(screen.getByTestId('print-container')).toBeInTheDocument();
    expect(screen.getByText('LEMBAR 1: PENERIMA (ORIGINAL)')).toBeInTheDocument();
    expect(screen.getByText('LEMBAR 2: PENGIRIM (GUDANG)')).toBeInTheDocument();
    expect(screen.getByText('LEMBAR 3: ARSIP LOGISTIK')).toBeInTheDocument();
    expect(screen.getByTestId('btn-trigger-window-print')).toBeInTheDocument();
  }, 10000);

  it('triggers browser window print when print button is clicked', async () => {
    const mockOnClose = vi.fn();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    await act(async () => {
      render(
        <DeliveryPrintModal
          open={true}
          delivery={MOCK_DO_LIST[0]}
          onClose={mockOnClose}
        />
      );
    });

    const printBtn = screen.getByTestId('btn-trigger-window-print');
    await act(async () => {
      fireEvent.click(printBtn);
    });

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  }, 10000);
});
