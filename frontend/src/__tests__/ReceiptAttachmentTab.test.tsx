import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReceiptAttachmentTab } from '../components/inbound/ReceiptAttachmentTab';
import { notification } from 'antd';

describe('ReceiptAttachmentTab Component', () => {
  it('renders uploaded attachments list table and upload dragger area', async () => {
    await act(async () => {
      render(<ReceiptAttachmentTab receiptId={1} isLocked={false} />);
    });

    expect(screen.getByTestId('receipt-attachment-tab')).toBeInTheDocument();
    expect(screen.getByTestId('select-attachment-category')).toBeInTheDocument();
    expect(screen.getByTestId('table-attachments')).toBeInTheDocument();
    expect(screen.getByText('Surat_Jalan_SJ-2026-9912.pdf')).toBeInTheDocument();
  });

  it('rejects unsupported file extensions (.exe)', async () => {
    const errorSpy = vi.spyOn(notification, 'error');

    await act(async () => {
      render(<ReceiptAttachmentTab receiptId={1} isLocked={false} />);
    });

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
  });

  it('uploads valid PDF file and adds to attachment list', async () => {
    const successSpy = vi.spyOn(notification, 'success');

    await act(async () => {
      render(<ReceiptAttachmentTab receiptId={1} isLocked={false} />);
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(['dummy content'], 'BAP_QC_Tinta_2026.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [validFile] } });
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Lampiran Berhasil Diunggah',
      })
    );

    expect(screen.getByText('BAP_QC_Tinta_2026.pdf')).toBeInTheDocument();
  });
});
