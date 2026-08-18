import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PODUploadModal } from '../components/outbound/PODUploadModal';

describe('PODUploadModal Component (FE-306)', () => {
  it('renders digital POD upload modal, inputs, signature pad, and photo dragger', async () => {
    const mockOnClose = vi.fn();
    const mockOnSubmit = vi.fn();

    await act(async () => {
      render(
        <PODUploadModal
          open={true}
          doNo="DO-2026-08-001"
          onClose={mockOnClose}
          onSubmitPOD={mockOnSubmit}
        />
      );
    });

    expect(screen.getByTestId('modal-pod-upload')).toBeInTheDocument();
    expect(screen.getByTestId('input-pod-received-by')).toBeInTheDocument();
    expect(screen.getByTestId('datepicker-pod-received-at')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-signature-pad')).toBeInTheDocument();
    expect(screen.getByTestId('dragger-pod-photo')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-pod')).toBeInTheDocument();
  }, 10000);

  it('submits digital POD form data when receiver name is entered', async () => {
    const mockOnClose = vi.fn();
    const mockOnSubmit = vi.fn();

    await act(async () => {
      render(
        <PODUploadModal
          open={true}
          doNo="DO-2026-08-001"
          onClose={mockOnClose}
          onSubmitPOD={mockOnSubmit}
        />
      );
    });

    const receivedByInput = screen.getByTestId('input-pod-received-by');
    const submitBtn = screen.getByTestId('btn-submit-pod');

    await act(async () => {
      fireEvent.change(receivedByInput, { target: { value: 'Ahmad Subagyo' } });
      fireEvent.click(submitBtn);
    });

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedBy: 'Ahmad Subagyo',
        signatureDataUrl: 'digital-sig-signed-by-receiver',
      })
    );
  }, 10000);
});
