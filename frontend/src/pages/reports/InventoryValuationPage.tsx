import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  DatePicker,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  notification,
} from 'antd';
import {
  FileExcelOutlined,
  FilePdfOutlined,
  SearchOutlined,
  DollarOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import { InventoryValuationItem, MOCK_VALUATION_REPORTS } from '../../types/report';
import { MOCK_CATEGORIES } from '../../types/item';
import { MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const InventoryValuationPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredReports = MOCK_VALUATION_REPORTS.filter((item) => {
    const matchesSearch =
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || item.categoryName === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalEndingValuation = filteredReports.reduce((acc, r) => acc + r.endingValue, 0);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleExportExcel = () => {
    notification.success({
      message: 'Ekspor Laporan Excel Berhasil (FE-701)',
      description: 'File Inventory_Valuation_Report_2026.xlsx telah berhasil diunduh.',
    });
  };

  const handleExportPdf = () => {
    notification.success({
      message: 'Ekspor Laporan PDF Berhasil (FE-701)',
      description: 'File Inventory_Valuation_Report_2026.pdf telah berhasil diunduh.',
    });
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
      title: 'Nama Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Kategori',
      dataIndex: 'categoryName',
      key: 'categoryName',
      render: (cat: string) => <Tag color="blue">{cat}</Tag>,
    },
    {
      title: 'Harga Satuan (FIFO)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 160,
      render: (price: number) => <Text>{formatRupiah(price)}</Text>,
    },
    {
      title: 'Saldo Awal (Qty)',
      dataIndex: 'beginningQty',
      key: 'beginningQty',
      width: 110,
      render: (qty: number, record: InventoryValuationItem) => `${qty} ${record.uom}`,
    },
    {
      title: 'Inbound (+)',
      dataIndex: 'inboundQty',
      key: 'inboundQty',
      width: 110,
      render: (qty: number, record: InventoryValuationItem) => (
        <Text type="success">+{qty} {record.uom}</Text>
      ),
    },
    {
      title: 'Outbound (-)',
      dataIndex: 'outboundQty',
      key: 'outboundQty',
      width: 110,
      render: (qty: number, record: InventoryValuationItem) => (
        <Text type="danger">-{qty} {record.uom}</Text>
      ),
    },
    {
      title: 'Saldo Akhir (Qty)',
      dataIndex: 'endingQty',
      key: 'endingQty',
      width: 120,
      render: (qty: number, record: InventoryValuationItem) => (
        <Text strong style={{ fontSize: 13 }}>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Total Nilai Persediaan Akhir',
      dataIndex: 'endingValue',
      key: 'endingValue',
      width: 200,
      render: (val: number) => (
        <Text strong style={{ color: '#52c41a', fontSize: 14 }}>
          {formatRupiah(val)}
        </Text>
      ),
    },
  ];

  return (
    <div data-testid="inventory-valuation-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <PieChartOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Laporan Mutasi & Nilai Persediaan (FE-701)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Valuasi stok persediaan barang berbasis metode FIFO & Jurnal Mutasi Periodik.
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Space wrap>
              <Button
                type="primary"
                style={{ background: '#389e0d', borderColor: '#389e0d' }}
                icon={<FileExcelOutlined />}
                onClick={handleExportExcel}
                data-testid="btn-export-excel"
              >
                Ekspor Excel
              </Button>

              <Button
                type="primary"
                danger
                icon={<FilePdfOutlined />}
                onClick={handleExportPdf}
                data-testid="btn-export-pdf"
              >
                Ekspor PDF
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Statistic Card */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card variant="borderless" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Statistic
                title="Total Valuasi Nilai Persediaan Akhir (Metode FIFO)"
                value={totalEndingValuation}
                formatter={(val) => formatRupiah(Number(val))}
                valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
                prefix={<DollarOutlined />}
              />
              <Tag color="green" style={{ marginTop: 8 }}>Metode FIFO Aktif</Tag>
            </Card>
          </Col>
        </Row>

        {/* Report Table */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari SKU atau Nama Barang..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-valuation"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedWarehouse}
                onChange={(val) => setSelectedWarehouse(val)}
                style={{ width: '100%' }}
                data-testid="select-warehouse-valuation"
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
                data-testid="select-category-valuation"
                options={[
                  { value: 'all', label: 'Semua Kategori' },
                  ...MOCK_CATEGORIES.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
            </Col>

            <Col xs={24} sm={12} md={5}>
              <DatePicker.RangePicker style={{ width: '100%' }} data-testid="datepicker-valuation-period" />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredReports}
            pagination={{ pageSize: 10 }}
            data-testid="table-inventory-valuation"
          />
        </Card>
      </Space>
    </div>
  );
};
