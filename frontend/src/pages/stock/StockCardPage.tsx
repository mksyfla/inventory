import React, { useState } from 'react';
import {
  Card,
  Table,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  LockOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StockMovement, MovementType, MOCK_STOCK_MOVEMENTS } from '../../types/stock';
import { MOCK_ITEMS } from '../../types/item';

const { Title, Paragraph, Text } = Typography;

export const StockCardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSku = searchParams.get('sku') || MOCK_ITEMS[0].sku;

  const [selectedSku, setSelectedSku] = useState<string>(initialSku);
  const [movements] = useState<StockMovement[]>(MOCK_STOCK_MOVEMENTS);

  const selectedItem = MOCK_ITEMS.find((i) => i.sku === selectedSku) || MOCK_ITEMS[0];

  const getMovementTag = (type: MovementType) => {
    switch (type) {
      case 'receipt':
        return <Tag color="blue">Penerimaan (GRN)</Tag>;
      case 'issue':
        return <Tag color="green">Pengeluaran (DO)</Tag>;
      case 'transfer_out':
        return <Tag color="orange">Mutasi Out (TRF-OUT)</Tag>;
      case 'transfer_in':
        return <Tag color="purple">Mutasi In (TRF-IN)</Tag>;
      case 'adjustment_plus':
        return <Tag color="cyan">Penyesuaian (+)</Tag>;
      case 'adjustment_minus':
        return <Tag color="magenta">Penyesuaian (-)</Tag>;
      default:
        return <Tag color="default">{type}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Waktu Transaksi (WIB)',
      dataIndex: 'movedAt',
      key: 'movedAt',
      width: 170,
      render: (time: string) => <Text strong style={{ fontSize: 12 }}>{time}</Text>,
    },
    {
      title: 'Tipe Pergerakan',
      dataIndex: 'movementType',
      key: 'movementType',
      width: 160,
      render: (type: MovementType) => getMovementTag(type),
    },
    {
      title: 'No. Dokumen Referensi',
      dataIndex: 'docNo',
      key: 'docNo',
      width: 170,
      render: (docNo: string) => (
        <Space>
          <FileTextOutlined style={{ color: '#0052cc' }} />
          <Text code strong>{docNo}</Text>
        </Space>
      ),
    },
    {
      title: 'Lokasi Bin & Batch',
      key: 'locationBatch',
      width: 200,
      render: (_: any, record: StockMovement) => (
        <div>
          <Tag color="geekblue">{record.locationCode}</Tag>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
            Batch: {record.batchNo}
          </Text>
        </div>
      ),
    },
    {
      title: 'Qty Masuk (+)',
      dataIndex: 'qtyIn',
      key: 'qtyIn',
      width: 130,
      render: (qty: number, record: StockMovement) =>
        qty > 0 ? (
          <Text type="success" strong>
            +{qty} {record.uom}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Qty Keluar (-)',
      dataIndex: 'qtyOut',
      key: 'qtyOut',
      width: 130,
      render: (qty: number, record: StockMovement) =>
        qty > 0 ? (
          <Text type="danger" strong>
            -{qty} {record.uom}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Saldo Berjalan (Qty After)',
      dataIndex: 'qtyAfter',
      key: 'qtyAfter',
      width: 160,
      render: (qty: number, record: StockMovement) => (
        <Text strong style={{ fontSize: 14, color: '#0052cc' }}>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Petugas / Operator',
      dataIndex: 'operatorName',
      key: 'operatorName',
      render: (op: string) => op,
    },
  ];

  return (
    <div data-testid="stock-card-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/stock/balances')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Kartu Stok Barang & Movement Ledger (FE-502)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Catatan kronologis mutasi persediaan barang secara immutable / read-only.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        {/* Read-Only Append-Only Banner */}
        <Alert
          message={
            <Space>
              <LockOutlined style={{ color: '#0052cc' }} />
              <strong>Prinsip Kartu Stok: Immutable Append-Only Ledger</strong>
            </Space>
          }
          description="Seluruh entri pergerakan stok dicatat secara permanen tanpa opsi edit/hapus. Setiap perubahan posisi fisik wajib melalui transaksi jurnal baru."
          type="info"
          showIcon
          data-testid="alert-append-only-banner"
        />

        {/* Item Selector & Filters */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Pilih Barang SKU
              </label>
              <Select
                value={selectedSku}
                onChange={(val) => setSelectedSku(val)}
                style={{ width: '100%' }}
                data-testid="select-sku-card"
                options={MOCK_ITEMS.map((item) => ({
                  value: item.sku,
                  label: `[${item.sku}] ${item.name} (${item.baseUom})`,
                }))}
              />
            </Col>

            <Col xs={24} md={8}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Rentang Tanggal Mutasi
              </label>
              <DatePicker.RangePicker style={{ width: '100%' }} data-testid="datepicker-range-card" />
            </Col>
          </Row>

          {/* Item Summary Bar */}
          <Card
            type="inner"
            style={{ marginBottom: 16, background: '#f5f7fa' }}
            data-testid="card-item-summary"
          >
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Kode SKU</Text>
                <Text strong style={{ color: '#0052cc', fontSize: 14 }}>{selectedItem.sku}</Text>
              </Col>
              <Col xs={24} sm={10}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Nama Barang</Text>
                <Text strong>{selectedItem.name}</Text>
              </Col>
              <Col xs={24} sm={6}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Satuan Dasar</Text>
                <Tag color="blue">{selectedItem.baseUom}</Tag>
              </Col>
            </Row>
          </Card>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={movements}
            pagination={{ pageSize: 15 }}
            data-testid="table-stock-ledger"
          />
        </Card>
      </Space>
    </div>
  );
};
