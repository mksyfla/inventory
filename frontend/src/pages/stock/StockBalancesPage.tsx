import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  SearchOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  LockOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  StockBalance,
  StockStatus,
  getStockStatusTagColor,
  MOCK_STOCK_BALANCES,
} from '../../types/stock';
import { MOCK_WAREHOUSES } from '../../types/location';
import { MOCK_CATEGORIES } from '../../types/item';

const { Title, Paragraph, Text } = Typography;

export const StockBalancesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredBalances = useMemo(() => {
    return MOCK_STOCK_BALANCES.filter((item) => {
      const matchesSearch =
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.locationCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batchNo.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesWarehouse =
        selectedWarehouse === 'all' || item.warehouseId === Number(selectedWarehouse);

      const matchesCategory =
        selectedCategory === 'all' || item.categoryName === selectedCategory;

      const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;

      return matchesSearch && matchesWarehouse && matchesCategory && matchesStatus;
    });
  }, [searchQuery, selectedWarehouse, selectedCategory, selectedStatus]);

  const totalOnHand = MOCK_STOCK_BALANCES.reduce((acc, b) => acc + b.qtyOnHand, 0);
  const totalAvailable = MOCK_STOCK_BALANCES.reduce((acc, b) => acc + b.qtyAvailable, 0);
  const totalReserved = MOCK_STOCK_BALANCES.reduce((acc, b) => acc + b.qtyReserved, 0);

  const columns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 140,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Gudang & Lokasi Bin',
      key: 'location',
      width: 220,
      render: (_: any, record: StockBalance) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>{record.warehouseName}</Text>
          <Tag color="blue">{record.locationCode}</Tag>
        </div>
      ),
    },
    {
      title: 'Batch No & Expiry',
      key: 'batch',
      width: 170,
      render: (_: any, record: StockBalance) => (
        <div>
          <Text code>{record.batchNo}</Text>
          {record.expiryDate && (
            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
              Exp: {record.expiryDate}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status Stok',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: StockStatus) => {
        const { color, label } = getStockStatusTagColor(status);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Qty On-Hand',
      dataIndex: 'qtyOnHand',
      key: 'qtyOnHand',
      width: 120,
      render: (qty: number, record: StockBalance) => (
        <Text strong>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Qty Reserved',
      dataIndex: 'qtyReserved',
      key: 'qtyReserved',
      width: 120,
      render: (qty: number, record: StockBalance) =>
        qty > 0 ? (
          <Text type="warning" strong>
            {qty} {record.uom}
          </Text>
        ) : (
          <Text type="secondary">0</Text>
        ),
    },
    {
      title: 'Qty Available',
      dataIndex: 'qtyAvailable',
      key: 'qtyAvailable',
      width: 130,
      render: (qty: number, record: StockBalance) => (
        <Text type="success" strong style={{ fontSize: 14 }}>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 110,
      render: (_: any, record: StockBalance) => (
        <Button
          icon={<HistoryOutlined />}
          size="small"
          onClick={() => navigate(`/stock/card?sku=${record.sku}`)}
          data-testid={`btn-view-card-${record.id}`}
        >
          Kartu Stok
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="stock-balances-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Saldo Stok Physical Real-Time (FE-501)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Posisi inventori fisik per Gudang, Lokasi Bin, Batch No, dan Status Saldo Bebas.
            </Paragraph>
          </Col>

          <Col>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => navigate('/stock/trace')}
              data-testid="btn-nav-batch-trace"
            >
              Penelusuran Batch (Batch Trace)
            </Button>
          </Col>
        </Row>

        {/* Statistic Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card variant="borderless">
              <Statistic
                title="Total Qty On-Hand Fisik"
                value={totalOnHand}
                suffix="unit"
                prefix={<InboxOutlined style={{ color: '#0052cc' }} />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card variant="borderless">
              <Statistic
                title="Total Stok Bebas (Available)"
                value={totalAvailable}
                suffix="unit"
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card variant="borderless">
              <Statistic
                title="Total Stok Ter-Reserve (Reserved)"
                value={totalReserved}
                suffix="unit"
                valueStyle={{ color: '#fa8c16' }}
                prefix={<LockOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Filters */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari SKU, Nama Barang, Bin, atau Batch..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-stock"
              />
            </Col>

            <Col xs={24} sm={12} md={5}>
              <Select
                value={selectedWarehouse}
                onChange={(val) => setSelectedWarehouse(val)}
                style={{ width: '100%' }}
                data-testid="select-warehouse-filter"
                options={[
                  { value: 'all', label: 'Semua Gudang' },
                  ...MOCK_WAREHOUSES.map((w) => ({ value: String(w.id), label: w.name })),
                ]}
              />
            </Col>

            <Col xs={24} sm={12} md={5}>
              <Select
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val)}
                style={{ width: '100%' }}
                data-testid="select-category-filter"
                options={[
                  { value: 'all', label: 'Semua Kategori' },
                  ...MOCK_CATEGORIES.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                style={{ width: '100%' }}
                data-testid="select-status-filter"
                options={[
                  { value: 'all', label: 'Semua Status Stok' },
                  { value: 'available', label: 'Tersedia (Available)' },
                  { value: 'quarantine', label: 'Karantina / QC' },
                  { value: 'damaged', label: 'Rusak (Damaged)' },
                  { value: 'expired', label: 'Kedaluwarsa (Expired)' },
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredBalances}
            pagination={{ pageSize: 10 }}
            data-testid="table-stock-balances"
          />
        </Card>
      </Space>
    </div>
  );
};
