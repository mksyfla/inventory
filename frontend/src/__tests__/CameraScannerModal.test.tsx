import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraScannerModal } from '../components/CameraScannerModal';

// Mock ZXing browser reader
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockResolvedValue({ stop: vi.fn() }),
  })),
}));

// Attach static listVideoInputDevices mock
import { BrowserMultiFormatReader } from '@zxing/browser';
(BrowserMultiFormatReader as any).listVideoInputDevices = vi.fn().mockResolvedValue([
  { deviceId: 'cam-01', label: 'Kamera Belakang Utama' },
  { deviceId: 'cam-02', label: 'Kamera Depan' },
]);

describe('CameraScannerModal Component', () => {
  const handleScan = vi.fn();
  const handleClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Modal title, camera selector, and video viewport when open', async () => {
    await act(async () => {
      render(
        <CameraScannerModal open={true} onClose={handleClose} onScan={handleScan} />
      );
    });

    expect(screen.getByTestId('camera-scanner-modal')).toBeInTheDocument();
    expect(screen.getByText('Scan Barcode / QR Code Kamera PWA')).toBeInTheDocument();
    expect(screen.getByTestId('scanner-video-element')).toBeInTheDocument();
  });

  it('does not render Modal content when open is false', async () => {
    await act(async () => {
      render(
        <CameraScannerModal open={false} onClose={handleClose} onScan={handleScan} />
      );
    });

    expect(screen.queryByTestId('camera-scanner-modal')).not.toBeInTheDocument();
  });
});
