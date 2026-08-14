import React from 'react';
import { Modal, Button, Space, Typography, Card, QRCode } from 'antd';
import { PrinterOutlined, QrcodeOutlined } from '@ant-design/icons';
import { LocationNode } from '../../types/location';

const { Title, Text } = Typography;

export interface LocationBarcodeModalProps {
  open: boolean;
  location: LocationNode | null;
  onClose: () => void;
}

export const LocationBarcodeModal: React.FC<LocationBarcodeModalProps> = ({
  open,
  location,
  onClose,
}) => {
  if (!location) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <QrcodeOutlined style={{ color: '#0052cc' }} />
          <span>Cetak Label Barcode / QR Code Lokasi Bin (FR-1.6)</span>
        </Space>
      }
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Tutup
        </Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} data-testid="btn-print-label">
          Cetak Label Rak
        </Button>,
      ]}
      destroyOnHidden
      width={420}
      data-testid="modal-location-barcode"
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <Card
          variant="borderless"
          style={{
            border: '2px dashed #0052cc',
            borderRadius: 12,
            background: '#fafafa',
            padding: 12,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1 }}>
            SISTEM MANAJEMEN GUDANG (SIMBAR PERURI)
          </Text>

          <div style={{ margin: '16px 0', display: 'flex', justifyContent: 'center' }}>
            <QRCode value={location.code} size={160} bordered={false} data-testid="qrcode-element" />
          </div>

          <Title level={4} style={{ margin: '0 0 4px 0', color: '#0052cc', letterSpacing: 1 }}>
            {location.code}
          </Title>

          <Text strong style={{ fontSize: 13, display: 'block' }}>
            {location.name}
          </Text>

          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
            Tipe: {location.type.toUpperCase()} | Kapasitas: {location.capacityVolumeM3 || '-'} m³ / {location.capacityWeightKg || '-'} kg
          </Text>
        </Card>
      </div>
    </Modal>
  );
};
