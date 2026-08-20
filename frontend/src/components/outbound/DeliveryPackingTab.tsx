import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Alert,
  notification,
} from 'antd';
import {
  CheckCircleOutlined,
  CarOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { DeliveryOrder, DeliveryItemLine } from '../../types/outbound';

const { Text } = Typography;

export interface DeliveryPackingTabProps {
  delivery: DeliveryOrder;
  onPostShipment: (driverName: string, vehiclePlateNo: string, notes?: string) => void;
}

export const DeliveryPackingTab: React.FC<DeliveryPackingTabProps> = ({
  delivery,
  onPostShipment,
}) => {
  const [items, setItems] = useState<DeliveryItemLine[]>(delivery.items);
  const [driverName, setDriverName] = useState<string>(delivery.driverName || 'Sujono (Kurir Peruri)');
  const [vehiclePlateNo, setVehiclePlateNo] = useState<string>(delivery.vehiclePlateNo || 'B 9842 PQA');
  const [shippingNotes, setShippingNotes] = useState<string>(delivery.shippingNotes || '');

  const handleQtyPackedChange = (index: number, val: number | null) => {
    if (val === null) return;
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qtyPacked: val };
      return updated;
    });
  };

  const isAllReconciled = items.every((item) => (item.qtyPacked || 0) === item.qtyOrdered);

  const handleShipSubmit = () => {
    if (!driverName.trim() || !vehiclePlateNo.trim()) {
      notification.error({
        message: 'Form Pengiriman Tidak Lengkap',
        description: 'Nama Driver/Kurir dan Plat Nomor Kendaraan wajib diisi.',
      });
      return;
    }

    onPostShipment(driverName, vehiclePlateNo, shippingNotes);
  };

  const columns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 140,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang SKU',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Satuan',
      dataIndex: 'uom',
      key: 'uom',
      width: 90,
      render: (uom: string) => <Tag color="blue">{uom}</Tag>,
    },
    {
      title: 'Qty Picked',
      dataIndex: 'qtyPicked',
      key: 'qtyPicked',
      width: 110,
      render: (qty: number) => <Text strong>{qty || 0}</Text>,
    },
    {
      title: 'Verifikasi Qty Packed',
      key: 'qtyPacked',
      width: 170,
      render: (_: any, record: DeliveryItemLine, idx: number) => (
        <InputNumber
          min={0}
          max={record.qtyOrdered}
          value={record.qtyPacked || record.qtyOrdered}
          onChange={(val) => handleQtyPackedChange(idx, val)}
          data-testid={`input-qty-packed-${idx}`}
        />
      ),
    },
    {
      title: 'Status Verifikasi',
      key: 'status',
      width: 170,
      render: (_: any, record: DeliveryItemLine) => {
        const isMatched = (record.qtyPacked || 0) === record.qtyOrdered;
        return isMatched ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>Reconciled 100%</Tag>
        ) : (
          <Tag color="error" icon={<ExclamationCircleOutlined />}>Belum Cocok</Tag>
        );
      },
    },
  ];

  return (
    <div data-testid="delivery-packing-tab">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="Tahap Packing & QC Pengeluaran Barang (FE-4.5)"
          description="Lakukan rekonsiliasi jumlah barang yang dipack sebelum dimuat ke armada pengiriman. Tombol 'Posting Pengeluaran / Ship' hanya aktif jika verifikasi 100% sesuai."
          type="info"
          showIcon
        />

        <Card variant="borderless" title="1. Rekonsiliasi Item Picked vs Packed">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            data-testid="table-packing-reconciliation"
          />
        </Card>

        <Card variant="borderless" title="2. Detail Armada & Catatan Pengiriman">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Driver / Kurir Peruri <Text type="danger">*</Text>
              </label>
              <Input
                placeholder="Contoh: Sujono (Kurir Peruri)"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                data-testid="input-driver-name"
              />
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Plat Nomor Kendaraan Armada <Text type="danger">*</Text>
              </label>
              <Input
                placeholder="Contoh: B 9842 PQA"
                value={vehiclePlateNo}
                onChange={(e) => setVehiclePlateNo(e.target.value)}
                data-testid="input-vehicle-plate"
              />
            </Col>

            <Col xs={24}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Catatan Pengiriman Khusus</label>
              <Input.TextArea
                rows={2}
                placeholder="Contoh: Harap bawa Surat Jalan 3-rangkap ter-stampel"
                value={shippingNotes}
                onChange={(e) => setShippingNotes(e.target.value)}
                data-testid="input-shipping-notes"
              />
            </Col>
          </Row>
        </Card>

        <Row justify="end" align="middle">
          <Button
            type="primary"
            size="large"
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            icon={<CarOutlined />}
            disabled={!isAllReconciled}
            onClick={handleShipSubmit}
            data-testid="btn-post-shipment"
          >
            Posting Pengeluaran / Ship (DO Out)
          </Button>
        </Row>
      </Space>
    </div>
  );
};
