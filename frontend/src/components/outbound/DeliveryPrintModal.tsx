import React from 'react';
import { Modal, Button, Space, Typography, Row, Col, Tag } from 'antd';
import { PrinterOutlined, FileTextOutlined } from '@ant-design/icons';
import { DeliveryOrder } from '../../types/outbound';

const { Title, Text, Paragraph } = Typography;

export interface DeliveryPrintModalProps {
  open: boolean;
  delivery: DeliveryOrder;
  onClose: () => void;
}

export const DeliveryPrintModal: React.FC<DeliveryPrintModalProps> = ({
  open,
  delivery,
  onClose,
}) => {
  const handleTriggerPrint = () => {
    window.print();
  };

  const renderPrintPage = (plyLabel: string, plyColor: string) => (
    <div
      style={{
        border: '1px solid #d9d9d9',
        padding: 24,
        marginBottom: 24,
        background: '#fff',
        borderRadius: 8,
      }}
      className="printable-ply-page"
    >
      {/* Header Band */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `3px solid ${plyColor}`,
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, color: '#002140' }}>
            PERUM PERURI - SURAT JALAN (DELIVERY ORDER)
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Sistem Informasi Manajemen Barang (SIMBAR)
          </Text>
        </div>
        <Tag color={plyColor} style={{ fontSize: 13, padding: '4px 12px', fontWeight: 'bold' }}>
          {plyLabel}
        </Tag>
      </div>

      {/* Metadata Row */}
      <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>No. Surat Jalan (DO):</Text>
          <Text strong style={{ fontSize: 14, color: '#0052cc' }}>{delivery.doNo}</Text>
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Tanggal Pengiriman:</Text>
          <Text strong>{delivery.deliveryDate}</Text>
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Pelanggan / Penerima:</Text>
          <Text strong>{delivery.customerName}</Text>
          <Paragraph type="secondary" style={{ fontSize: 11, margin: 0 }}>
            {delivery.destinationAddress}
          </Paragraph>
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Gudang Pengirim:</Text>
          <Text strong>{delivery.warehouseName}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
            Driver: {delivery.driverName || '-'} | Plat: {delivery.vehiclePlateNo || '-'}
          </Text>
        </Col>
      </Row>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <thead>
          <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #d9d9d9' }}>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 12 }}>No</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 12 }}>Kode SKU</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 12 }}>Deskripsi Barang</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 12 }}>Batch No / Lot</th>
            <th style={{ padding: '8px', textAlign: 'right', fontSize: 12 }}>Jumlah (Qty)</th>
            <th style={{ padding: '8px', textAlign: 'center', fontSize: 12 }}>Satuan</th>
          </tr>
        </thead>
        <tbody>
          {delivery.items.map((item, idx) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '8px', fontSize: 12 }}>{idx + 1}</td>
              <td style={{ padding: '8px', fontSize: 12, fontWeight: 'bold', color: '#0052cc' }}>{item.sku}</td>
              <td style={{ padding: '8px', fontSize: 12 }}>{item.itemName}</td>
              <td style={{ padding: '8px', fontSize: 12 }}>
                {item.allocations?.[0]?.batchNo || 'LOT-SIC-202608-01'}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, fontWeight: 'bold' }}>
                {item.qtyOrdered}
              </td>
              <td style={{ padding: '8px', textAlign: 'center', fontSize: 12 }}>{item.uom}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature Boxes */}
      <Row gutter={24} style={{ marginTop: 24, textAlign: 'center' }}>
        <Col span={8}>
          <Text style={{ fontSize: 11, display: 'block', marginBottom: 40 }}>Pengirim (Gudang Peruri)</Text>
          <div style={{ borderTop: '1px dashed #bfbfbf', paddingTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>(..........................................)</Text>
          </div>
        </Col>

        <Col span={8}>
          <Text style={{ fontSize: 11, display: 'block', marginBottom: 40 }}>Pengemudi / Driver</Text>
          <div style={{ borderTop: '1px dashed #bfbfbf', paddingTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>( {delivery.driverName || 'Sujono'} )</Text>
          </div>
        </Col>

        <Col span={8}>
          <Text style={{ fontSize: 11, display: 'block', marginBottom: 40 }}>Penerima Barang</Text>
          <div style={{ borderTop: '1px dashed #bfbfbf', paddingTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>(..........................................)</Text>
          </div>
        </Col>
      </Row>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <FileTextOutlined style={{ color: '#0052cc' }} />
          <span>Cetak Surat Jalan (DO) 3-Rangkap (FE-305)</span>
        </Space>
      }
      footer={
        <Space>
          <Button onClick={onClose}>Tutup</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handleTriggerPrint}
            data-testid="btn-trigger-window-print"
          >
            Cetak Dokument Surat Jalan (3-Ply)
          </Button>
        </Space>
      }
      width={800}
      data-testid="modal-delivery-print"
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }} data-testid="print-container">
        {renderPrintPage('LEMBAR 1: PENERIMA (ORIGINAL)', '#0052cc')}
        {renderPrintPage('LEMBAR 2: PENGIRIM (GUDANG)', '#52c41a')}
        {renderPrintPage('LEMBAR 3: ARSIP LOGISTIK', '#8c8c8c')}
      </div>
    </Modal>
  );
};
