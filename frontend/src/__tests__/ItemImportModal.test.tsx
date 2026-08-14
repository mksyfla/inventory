import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ItemImportModal } from '../components/master/ItemImportModal';

describe('ItemImportModal Component', () => {
  const handleClose = vi.fn();

  it('renders import modal with template download button and drag-and-drop area', async () => {
    await act(async () => {
      render(<ItemImportModal open={true} onClose={handleClose} />);
    });

    expect(screen.getByTestId('modal-item-import')).toBeInTheDocument();
    expect(screen.getByTestId('btn-download-template')).toBeInTheDocument();
    expect(screen.getByTestId('upload-dragger-area')).toBeInTheDocument();
    expect(screen.getByTestId('btn-process-import')).toBeDisabled();
  });

  it('enables process import button when a valid spreadsheet file is selected and displays row errors log', async () => {
    await act(async () => {
      render(<ItemImportModal open={true} onClose={handleClose} />);
    });

    const file = new File(['SKU,Nama\nSKU-001,Test'], 'master_items.csv', { type: 'text/csv' });
    const draggerArea = screen.getByTestId('upload-dragger-area');

    // Query input or trigger drop event
    const uploaderInput = document.querySelector('input[type="file"]');
    if (uploaderInput) {
      await act(async () => {
        fireEvent.change(uploaderInput, { target: { files: [file] } });
      });
    } else {
      await act(async () => {
        fireEvent.drop(draggerArea, {
          dataTransfer: {
            files: [file],
            items: [
              {
                kind: 'file',
                type: 'text/csv',
                getAsFile: () => file,
              },
            ],
            types: ['Files'],
          },
        });
      });
    }

    const processBtn = screen.getByTestId('btn-process-import');
    // Click process button to trigger import simulation
    await act(async () => {
      fireEvent.click(processBtn);
    });

    // Wait for step 2 (Laporan Hasil) with error table
    await waitFor(
      () => {
        expect(screen.getByTestId('table-import-errors')).toBeInTheDocument();
        expect(screen.getByText('Baris 4')).toBeInTheDocument();
        expect(screen.getByText('Kode SKU sudah terdaftar di database master barang (Duplikat).')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
