import React, { useEffect, useRef, useState } from 'react';
import { Modal, Select, Button, Space, Typography, Alert } from 'antd';
import { CameraOutlined, BulbOutlined, BulbFilled, ReloadOutlined } from '@ant-design/icons';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { playSuccessBeep } from '../utils/audioFeedback';

const { Text } = Typography;

export interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  open,
  onClose,
  onScan,
  title = 'Scan Barcode / QR Code Kamera PWA',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  const [videoDevices, setVideoDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize ZXing reader
  useEffect(() => {
    if (!open) return;

    const reader = new BrowserMultiFormatReader();
    codeReaderRef.current = reader;

    // List video input devices
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((devices) => {
        const formatted = devices.map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Kamera ${idx + 1}`,
        }));
        setVideoDevices(formatted);

        // Default to back camera or first device
        const backCamera = formatted.find(
          (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('belakang')
        );
        const selected = backCamera ? backCamera.deviceId : formatted[0]?.deviceId || '';
        setSelectedDeviceId(selected);
      })
      .catch((err) => {
        setErrorMsg('Gagal mengakses kamera peranti: ' + (err.message || 'Izin kamera ditolak.'));
      });

    return () => {
      stopScanning();
    };
  }, [open]);

  // Start video stream & scanner when selectedDeviceId changes
  useEffect(() => {
    if (!open || !selectedDeviceId || !videoRef.current) return;

    stopScanning();

    const reader = codeReaderRef.current || new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result) => {
        if (result) {
          const barcodeText = result.getText();
          playSuccessBeep();
          onScan(barcodeText);
          onClose();
        }
      })
      .then((controls) => {
        controlsRef.current = controls;
        checkTorchSupport();
      })
      .catch((err) => {
        setErrorMsg('Gagal memulai stream kamera: ' + err.message);
      });

    return () => {
      stopScanning();
    };
  }, [open, selectedDeviceId]);

  const stopScanning = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      controlsRef.current = null;
    }
    setTorchOn(false);
  };

  const checkTorchSupport = () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (track && 'getCapabilities' in track) {
      const capabilities = (track as any).getCapabilities();
      setHasTorch(!!capabilities.torch);
    }
  };

  const toggleTorch = () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      const nextState = !torchOn;
      (track as any)
        .applyConstraints({
          advanced: [{ torch: nextState }],
        })
        .then(() => {
          setTorchOn(nextState);
        })
        .catch(() => {
          // Ignore torch toggle error
        });
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        stopScanning();
        onClose();
      }}
      title={
        <Space>
          <CameraOutlined style={{ color: '#0052cc' }} />
          <span>{title}</span>
        </Space>
      }
      footer={null}
      destroyOnHidden
      width={480}
      data-testid="camera-scanner-modal"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {errorMsg && <Alert message={errorMsg} type="error" showIcon data-testid="camera-error-alert" />}

        {/* Camera Selector & Flashlight Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Select
            value={selectedDeviceId}
            onChange={(val) => setSelectedDeviceId(val)}
            style={{ width: 260 }}
            options={videoDevices.map((d) => ({ value: d.deviceId, label: d.label }))}
            placeholder="Pilih Kamera"
            data-testid="camera-select"
          />

          <Space>
            {hasTorch && (
              <Button
                icon={torchOn ? <BulbFilled style={{ color: '#faad14' }} /> : <BulbOutlined />}
                onClick={toggleTorch}
                data-testid="btn-torch-toggle"
              >
                {torchOn ? 'Senter Aktif' : 'Senter'}
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setSelectedDeviceId(selectedDeviceId)}
              data-testid="btn-reload-camera"
            />
          </Space>
        </div>

        {/* Video Viewport Overlay */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 280,
            backgroundColor: '#000',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            data-testid="scanner-video-element"
          />

          {/* Scanner Laser Box & Crosshair Overlay */}
          <div
            style={{
              position: 'absolute',
              width: 220,
              height: 180,
              border: '2px dashed #1890ff',
              borderRadius: 8,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                height: 2,
                backgroundColor: '#ff4d4f',
                boxShadow: '0 0 8px #ff4d4f',
              }}
            />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Arahkan barcode 1D atau QR Code ke dalam kotak garis putus-putus.
          </Text>
        </div>
      </Space>
    </Modal>
  );
};
