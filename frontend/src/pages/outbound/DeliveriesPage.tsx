import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Card,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  DeliveryOrder,
  DeliveryStatus,
  getDeliveryStatusTagColor,
  MOCK_DO_LIST,
} from '../../types/outbound';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

const { Title, Paragraph, Text } = Typography;

export const DeliveriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [deliveries] = useState<DeliveryOrder[]>(MOCK_DO_LIST);

  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus | null>(null);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchDo = d.doNo.toLowerCase().includes(term);
        const matchCustomer = d.customerName.toLowerCase().includes(term);
        const matchReq = d.requestNo?.toLowerCase().includes(term);
        if (!matchDo && !matchCustomer && !matchReq) return false;
      }

      if (selectedStatus !== null && d.status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [deliveries, debouncedTerm, selectedStatus]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedStatus(null);
  };

  const columns = [
    {
      title: 'No. Surat Jalan (DO)',
      dataIndex: 'doNo',
      key: 'doNo',
      width: 170,
      render: (doNo: string) => <Text strong style={{ color: '#0052cc' }}>{doNo}</Text>,
    },
    {
      title: 'Ref. Permintaan',
      dataIndex: 'requestNo',
      key: 'requestNo',
      width: 160,
      render: (reqNo?: string) => reqNo ? <Text code>{reqNo}</Text> : '-',
    },
    {
      title: 'Pelanggan / Penerima',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (cust: string) => <Text strong>{cust}</Text>,
    },
    {
      title: 'Gudang Pengirim',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 180,
    },
    {
      title: 'Tgl Pengiriman',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: 130,
    },
    {
      title: 'Status DO',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: DeliveryStatus) => {
        const tag = getDeliveryStatusTagColor(status);
        return <Tag color={tag.color}>{tag.label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 80,
      render: (_: any, record: DeliveryOrder) => (
        <Tooltip title="Lihat Detail Delivery Order">
          <Button
            type="text"
            icon={<EyeOutlined style={{ color: '#0052cc' }} />}
            onClick={() => navigate(`/outbound/deliveries/${record.id}`)}
            data-testid={`btn-view-do-${record.id}`}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div data-testid="deliveries-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Daftar Delivery Order (DO) & Pengeluaran Barang
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Pengelolaan Surat Jalan, Alokasi FEFO/FIFO stok, picking, packing, dan pengiriman barang.
            </Paragraph>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Input
                placeholder="Cari No. DO, Ref. Permintaan, atau Nama Pelanggan..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-do"
              />
            </Col>

            <Col xs={12} md={8}>
              <Select
                placeholder="Filter Status Delivery Order"
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'draft', label: 'Draft DO' },
                  { value: 'allocated', label: 'Teralokasi FEFO' },
                  { value: 'picking_in_progress', label: 'Sedang Picking' },
                  { value: 'picked', label: 'Selesai Picking' },
                  { value: 'packed', label: 'Terkemas (Packed)' },
                  { value: 'shipped', label: 'Dalam Pengiriman (Shipped)' },
                  { value: 'delivered', label: 'Diterima (Delivered)' },
                  { value: 'cancelled', label: 'Dibatalkan' },
                ]}
                data-testid="select-filter-do-status"
              />
            </Col>

            <Col xs={12} md={4}>
              <Button icon={<ReloadOutlined />} onClick={handleResetFilters} style={{ width: '100%' }}>
                Reset Filter
              </Button>
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredDeliveries}
            pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} Delivery Order` }}
            data-testid="table-deliveries"
          />
        </Card>
      </Space>
    </div>
  );
};
