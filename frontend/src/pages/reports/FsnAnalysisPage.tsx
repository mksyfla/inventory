import React, { useState } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  SearchOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  StopOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import { FsnItem, FsnCategory, getFsnCategoryTagColor } from '../../types/report';
import { MOCK_CATEGORIES } from '../../types/item';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '../../api/services/reports';
import { mapFsnReportDTO } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const FsnAnalysisPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFsnCategory, setSelectedFsnCategory] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Real FSN report from the backend.
  const { data: fsnReports = [], isLoading } = useQuery({
    queryKey: ['fsn-reports'],
    queryFn: async () => {
      const dtos = await reportService.fsn();
      return dtos.map(mapFsnReportDTO);
    },
  });

  const filteredFsn = fsnReports.filter((item) => {
    const matchesSearch =
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFsn = selectedFsnCategory === 'all' || item.fsnCategory === selectedFsnCategory;
    const matchesCategory = selectedCategory === 'all' || item.categoryName === selectedCategory;

    return matchesSearch && matchesFsn && matchesCategory;
  });

  const fastCount = fsnReports.filter((r) => r.fsnCategory === 'fast_moving').length;
  const slowCount = fsnReports.filter((r) => r.fsnCategory === 'slow_moving').length;
  const deadCount = fsnReports.filter((r) => r.fsnCategory === 'dead_stock').length;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
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
      title: 'Kategori FSN',
      dataIndex: 'fsnCategory',
      key: 'fsnCategory',
      width: 200,
      render: (category: FsnCategory) => {
        const { color, label } = getFsnCategoryTagColor(category);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Turnover Ratio (TOR)',
      dataIndex: 'turnoverRatio',
      key: 'turnoverRatio',
      width: 160,
      render: (tor: number) => <Text strong>{tor}x / tahun</Text>,
    },
    {
      title: 'Days of Inventory (DOI)',
      dataIndex: 'daysOfInventory',
      key: 'daysOfInventory',
      width: 160,
      render: (doi: number) => (
        <Text type={doi > 90 ? 'danger' : 'secondary'}>
          {doi} hari
        </Text>
      ),
    },
    {
      title: 'Tanggal Mutasi Terakhir',
      dataIndex: 'lastMovementDate',
      key: 'lastMovementDate',
      width: 160,
    },
    {
      title: 'Stok Terkini',
      dataIndex: 'currentQty',
      key: 'currentQty',
      width: 120,
      render: (qty: number, record: FsnItem) => (
        <Text strong>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Valuasi Stok Dead-Stock',
      dataIndex: 'totalValuation',
      key: 'totalValuation',
      width: 180,
      render: (val: number, record: FsnItem) => (
        <Text type={record.fsnCategory === 'dead_stock' ? 'danger' : 'secondary'}>
          {formatRupiah(val)}
        </Text>
      ),
    },
  ];

  return (
    <div data-testid="fsn-analysis-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <FieldTimeOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Laporan Analisis Fast-Moving / Slow-Moving / Dead-Stock (FE-702)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Klasifikasi perputaran persediaan barang berbasis Turnover Ratio (TOR) & Days of Inventory (DOI).
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        {/* FSN Statistic Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: '#f6ffed' }}>
              <Statistic
                title="Fast-Moving (F)"
                value={fastCount}
                suffix="SKU"
                valueStyle={{ color: '#52c41a' }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: '#fffbe6' }}>
              <Statistic
                title="Slow-Moving (S)"
                value={slowCount}
                suffix="SKU"
                valueStyle={{ color: '#faad14' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: '#fff2f0' }}>
              <Statistic
                title="Dead-Stock / Non-Moving (N)"
                value={deadCount}
                suffix="SKU"
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<StopOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* FSN Table */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari SKU atau Nama Barang..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-fsn"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedFsnCategory}
                onChange={(val) => setSelectedFsnCategory(val)}
                style={{ width: '100%' }}
                data-testid="select-fsn-category"
                options={[
                  { value: 'all', label: 'Semua Klasifikasi FSN' },
                  { value: 'fast_moving', label: 'Fast-Moving (F)' },
                  { value: 'slow_moving', label: 'Slow-Moving (S)' },
                  { value: 'dead_stock', label: 'Dead-Stock / Non-Moving (N)' },
                ]}
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val)}
                style={{ width: '100%' }}
                data-testid="select-item-category"
                options={[
                  { value: 'all', label: 'Semua Kategori Barang' },
                  ...MOCK_CATEGORIES.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredFsn}
            loading={isLoading}
            pagination={{ pageSize: 10 }}
            data-testid="table-fsn-analysis"
          />
        </Card>
      </Space>
    </div>
  );
};
