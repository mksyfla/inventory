import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BarcodePrintModal } from '../components/master/BarcodePrintModal';
import { MOCK_ITEMS } from '../types/item';

describe('BarcodePrintModal Component', () => {
  const handleClose = vi.fn();
  const mockItem = MOCK_ITEMS[0]; // SKU-INK-001

  it('renders thermal print modal with item barcode details, copy count, and size selector', async () => {
    await act(async () => {
      render(<BarcodePrintModal open={true} item={mockItem} onClose={handleClose} />);
    });

    expect(screen.getByTestId('modal-barcode-print')).toBeInTheDocument();
    expect(screen.getByTestId('radio-barcode-type')).toBeInTheDocument();
    expect(screen.getByTestId('select-label-size')).toBeInTheDocument();
    expect(screen.getByTestId('input-copy-count')).toBeInTheDocument();
    expect(screen.getByTestId('btn-execute-print')).toBeInTheDocument();

    expect(screen.getByTestId('sticker-label-0')).toBeInTheDocument();
  });

  it('updates sticker labels grid when copy count is increased', async () => {
    await act(async () => {
      render(<BarcodePrintModal open={true} item={mockItem} onClose={handleClose} />);
    });

    const copyInput = screen.getByTestId('input-copy-count');
    await act(async () => {
      fireEvent.change(copyInput, { target: { value: '3' } });
    });

    expect(screen.getByTestId('sticker-label-0')).toBeInTheDocument();
    expect(screen.getByTestId('sticker-label-1')).toBeInTheDocument();
    expect(screen.getByTestId('sticker-label-2')).toBeInTheDocument();
  });

  it('switches barcode format to 1D Code128', async () => {
    await act(async () => {
      render(<BarcodePrintModal open={true} item={mockItem} onClose={handleClose} />);
    });

    const code128Radio = screen.getByText('1D Code128');
    await act(async () => {
      fireEvent.click(code128Radio);
    });

    expect(screen.getByTestId('code128-barcode-0')).toBeInTheDocument();
  });
});
