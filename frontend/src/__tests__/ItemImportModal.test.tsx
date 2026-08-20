import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemImportModal } from '../components/master/ItemImportModal';
import { itemService } from '../api/services/items';

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

describe('ItemImportModal Component', () => {
  const handleClose = vi.fn();

  beforeEach(() => {
    (itemService.importItems as ReturnType<typeof vi.fn>).mockResolvedValue({
      job_id: 'import-sku-123',
      status: 'queued',
    });
  });

  it('renders import modal with template download button and drag-and-drop area', async () => {
    await act(async () => {
      render(<ItemImportModal open={true} onClose={handleClose} />);
    });

    expect(screen.getByTestId('modal-item-import')).toBeInTheDocument();
    expect(screen.getByTestId('btn-download-template')).toBeInTheDocument();
    expect(screen.getByTestId('upload-dragger-area')).toBeInTheDocument();
    expect(screen.getByTestId('btn-process-import')).toBeDisabled();
  });

  it('enables process import button and calls the import API with the selected file', async () => {
    await act(async () => {
      render(<ItemImportModal open={true} onClose={handleClose} />);
    });

    const file = new File(['sku,name,base_uom\nSKU-001,Tinta,BOX'], 'master_items.csv', { type: 'text/csv' });
    const draggerArea = screen.getByTestId('upload-dragger-area');

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
            items: [{ kind: 'file', type: 'text/csv', getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });
    }

    const processBtn = screen.getByTestId('btn-process-import');
    await act(async () => {
      fireEvent.click(processBtn);
    });

    await waitFor(
      () => {
        expect(itemService.importItems).toHaveBeenCalled();
        expect(screen.getByText(/Job ID: import-sku-123/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
