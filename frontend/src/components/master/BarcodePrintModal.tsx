import React, { useState } from 'react';
import {
  Modal,
  Button,
  InputNumber,
  Select,
  Radio,
  Space,
  Typography,
  Card,
  Row,
  Col,
  QRCode,
  Divider,
} from 'antd';
import { PrinterOutlined, BarcodeOutlined } from '@ant-design/icons';
import { Item } from '../../types/item';

const { Text } = Typography;

export type LabelSize = '50x30mm' | '70x40mm' | '100x50mm';
export type BarcodeType = 'qr' | 'code128';

export interface BarcodePrintModalProps {
  open: boolean;
  item: Item | null;
  onClose: () => void;
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  open,
  item,
  onClose,
}) => {
  const [copyCount, setCopyCount] = useState<number>(1);
  const [labelSize, setLabelSize] = useState<LabelSize>('50x30mm');
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('qr');

  if (!item) return null;

  const handlePrint = () => {
    window.print();
  };

  const getDimensionStyle = () => {
    switch (labelSize) {
      case '70x40mm':
        return { width: '220px', height: '130px' };
      case '100x50mm':
        return { width: '280px', height: '150px' };
      case '50x30mm':
      default:
        return { width: '180px', height: '110px' };
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <BarcodeOutlined style={{ color: '#0052cc' }} />
          <span>Cetak Label Barcode Thermal (FR-1.6 / FE-106)</span>
        </Space>
      }
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Batal
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          data-testid="btn-execute-print"
        >
          Cetak {copyCount} Label ({labelSize})
        </Button>,
      ]}
      destroyOnHidden
      width={680}
      data-testid="modal-barcode-print"
    >
      <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
        {/* Settings Panel */}
        <Card variant="borderless" style={{ background: '#fafafa' }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={8}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Format Barcode
              </label>
              <Radio.Group
                value={barcodeType}
                onChange={(e) => setBarcodeType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                data-testid="radio-barcode-type"
              >
                <Radio.Button value="qr">2D QR Code</Radio.Button>
                <Radio.Button value="code128">1D Code128</Radio.Button>
              </Radio.Group>
            </Col>

            <Col xs={12} sm={8}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Ukuran Label Thermal
              </label>
              <Select
                value={labelSize}
                onChange={(val) => setLabelSize(val)}
                style={{ width: '100%' }}
                options={[
                  { value: '50x30mm', label: '50 x 30 mm (Standar Rak)' },
                  { value: '70x40mm', label: '70 x 40 mm (Standar Box)' },
                  { value: '100x50mm', label: '100 x 50 mm (Standar Pallet)' },
                ]}
                data-testid="select-label-size"
              />
            </Col>

            <Col xs={12} sm={8}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Jumlah Salinan
              </label>
              <InputNumber
                min={1}
                max={100}
                value={copyCount}
                onChange={(val) => setCopyCount(val || 1)}
                style={{ width: '100%' }}
                data-testid="input-copy-count"
              />
            </Col>
          </Row>
        </Card>

        <Divider style={{ margin: '8px 0' }}>Pratinjau Cetak Label Thermal (Thermal Printer Preview)</Divider>

        {/* Printable Label Container with @media print CSS styling */}
        <div
          className="printable-label-area"
          style={{
            maxHeight: 320,
            overflowY: 'auto',
            padding: 12,
            background: '#f0f2f5',
            borderRadius: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
          }}
          data-testid="label-preview-container"
        >
          {Array.from({ length: copyCount }).map((_, idx) => (
            <div
              key={idx}
              className="thermal-label-sticker"
              style={{
                ...getDimensionStyle(),
                border: '1.5px dashed #0052cc',
                borderRadius: 6,
                background: '#ffffff',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
              data-testid={`sticker-label-${idx}`}
            >
              <Text type="secondary" style={{ fontSize: 9, letterSpacing: 0.5, lineHeight: 1 }}>
                SIMBAR PERURI
              </Text>

              {barcodeType === 'qr' ? (
                <div style={{ margin: '4px 0' }}>
                  <QRCode value={item.sku} size={64} bordered={false} data-testid={`qr-code-${idx}`} />
                </div>
              ) : (
                <div
                  style={{
                    margin: '6px 0',
                    padding: '2px 8px',
                    background: '#000',
                    color: '#fff',
                    fontFamily: 'monospace',
                    letterSpacing: 3,
                    fontSize: 12,
                    fontWeight: 'bold',
                    borderRadius: 2,
                  }}
                  data-testid={`code128-barcode-${idx}`}
                >
                  |||| ||| |||| | ||
                </div>
              )}

              <Text strong style={{ fontSize: 11, color: '#0052cc', margin: 0, lineHeight: 1.2 }}>
                {item.sku}
              </Text>
              <Text ellipsis style={{ fontSize: 10, maxWidth: '100%', marginTop: 2, lineHeight: 1 }}>
                {item.name} ({item.baseUom})
              </Text>
            </div>
          ))}
        </div>
      </Space>
    </Modal>
  );
};
