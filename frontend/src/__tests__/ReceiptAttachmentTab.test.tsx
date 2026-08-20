import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReceiptAttachmentTab } from '../components/inbound/ReceiptAttachmentTab';
import { receiptService } from '../api/services/receipts';
import { queryClient } from '../api/queryClient';
import { notification } from 'antd';
import { AddAttachmentRequestDTO, AttachmentDTO } from '../api/dto';

vi.mock('../api/services/receipts', () => ({
  receiptService: {
    listAttachments: vi.fn(),
    createAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
}));

const seededAttachment: AttachmentDTO = {
  id: 1,
  document_id: 1,
  category: 'delivery_note',
  file_name: 'Surat_Jalan_SJ-2026-9912.pdf',
  file_size_bytes: 204800,
  file_url: '/uploads/grn/1/Surat_Jalan_SJ-2026-9912.pdf',
  uploaded_by: 7,
  created_at: '2026-08-10T09:00:00Z',
};

const renderTab = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <ReceiptAttachmentTab receiptId={1} isLocked={false} />
    </QueryClientProvider>
  );

describe('ReceiptAttachmentTab Component (API-backed)', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders uploaded attachments list table and upload dragger area', async () => {
    (receiptService.listAttachments as ReturnType<typeof vi.fn>).mockResolvedValue([
      seededAttachment,
    ]);

    renderTab();

    expect(screen.getByTestId('receipt-attachment-tab')).toBeInTheDocument();
    expect(screen.getByTestId('select-attachment-category')).toBeInTheDocument();
    expect(screen.getByTestId('table-attachments')).toBeInTheDocument();
    expect(await screen.findByText('Surat_Jalan_SJ-2026-9912.pdf')).toBeInTheDocument();
  });

  it('rejects unsupported file extensions (.exe)', async () => {
    const errorSpy = vi.spyOn(notification, 'error');
    (receiptService.listAttachments as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderTab();
    await screen.findByTestId('upload-attachment-dragger');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const invalidFile = new File(['content'], 'malicious.exe', { type: 'application/x-msdownload' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Format Berkas Tidak Sesuai',
      })
    );
    expect(receiptService.createAttachment).not.toHaveBeenCalled();
  });

  it('uploads valid PDF, persists a metadata row, and refreshes the list', async () => {
    const successSpy = vi.spyOn(notification, 'success');
    const persisted: AttachmentDTO[] = [];

    (receiptService.listAttachments as ReturnType<typeof vi.fn>).mockImplementation(async () => [
      ...persisted,
    ]);
    (receiptService.createAttachment as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id: number, payload: AddAttachmentRequestDTO): Promise<AttachmentDTO> => {
        const created: AttachmentDTO = {
          id: 2,
          document_id: 1,
          category: payload.category,
          file_name: payload.file_name,
          file_size_bytes: payload.file_size_bytes ?? 0,
          file_url: payload.file_url,
          uploaded_by: 7,
          created_at: '2026-08-11T09:00:00Z',
        };
        persisted.push(created);
        return created;
      }
    );

    renderTab();
    await screen.findByTestId('upload-attachment-dragger');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(['dummy content'], 'BAP_QC_Tinta_2026.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [validFile] } });
    });

    await waitFor(() => {
      expect(receiptService.createAttachment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          category: 'delivery_note',
          file_name: 'BAP_QC_Tinta_2026.pdf',
          file_size_bytes: 'dummy content'.length,
          file_url: '/uploads/grn/1/BAP_QC_Tinta_2026.pdf',
        })
      );
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Lampiran Berhasil Diunggah',
      })
    );

    expect(await screen.findByText('BAP_QC_Tinta_2026.pdf')).toBeInTheDocument();
  });

  it('deletes an attachment and refreshes the list', async () => {
    const persisted: AttachmentDTO[] = [{ ...seededAttachment }];
    (receiptService.listAttachments as ReturnType<typeof vi.fn>).mockImplementation(async () => [
      ...persisted,
    ]);
    (receiptService.deleteAttachment as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id: number, attachmentId: number) => {
        const idx = persisted.findIndex((a) => a.id === attachmentId);
        if (idx !== -1) persisted.splice(idx, 1);
        return { deleted: true };
      }
    );

    renderTab();
    await screen.findByText('Surat_Jalan_SJ-2026-9912.pdf');

    fireEvent.click(screen.getByTestId('btn-delete-att-1'));
    const confirmBtn = await waitFor(() => screen.getByRole('button', { name: 'Hapus' }));
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(receiptService.deleteAttachment).toHaveBeenCalledWith(1, 1);
    });
    await waitFor(() => {
      expect(screen.queryByText('Surat_Jalan_SJ-2026-9912.pdf')).not.toBeInTheDocument();
    });
  });
});
