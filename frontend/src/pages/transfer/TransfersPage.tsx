import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  StockTransfer,
  TransferStatus,
  getTransferStatusTagColor,
} from '../../types/transfer';
import { documentService } from '../../api/services';
import { mapDocumentToTransfer } from '../../api/mappers';

const { Title, Paragraph } = Typography;

export const TransfersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const docs = await documentService.list({ doc_type: 'TRF', limit: 100 });
      // Pass the doc explicitly — map() would otherwise feed the array index
      // into mapDocumentToTransfer's second (lines) parameter.
      return docs.map((d) => mapDocumentToTransfer(d));
    },
  });

  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) => {
      const matchesSearch =
        transfer.transferNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transfer.originWarehouseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transfer.destinationWarehouseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (transfer.driverName && transfer.driverName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = selectedStatus === 'all' || transfer.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [transfers, searchQuery, selectedStatus]);

  const columns = [
    {
      title: 'No. Transfer (TRF)',
      dataIndex: 'transferNo',
      key: 'transferNo',
      render: (text: string, record: StockTransfer) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 'bold' }}
          onClick={() => navigate(`/transfer/${record.id}`)}
          data-testid={`btn-view-transfer-${record.id}`}
        >
          {text}
        </Button>
      ),
    },
    {
      title: 'Gudang Asal (Origin)',
      dataIndex: 'originWarehouseName',
      key: 'originWarehouseName',
      render: (wh: string) => <Tag color="blue">{wh}</Tag>,
    },
    {
      title: 'Gudang Tujuan (Destination)',
      dataIndex: 'destinationWarehouseName',
      key: 'destinationWarehouseName',
      render: (wh: string) => <Tag color="purple">{wh}</Tag>,
    },
    {
      title: 'Tanggal Kirim',
      dataIndex: 'transferDate',
      key: 'transferDate',
    },
    {
      title: 'Pengemudi / Driver',
      dataIndex: 'driverName',
      key: 'driverName',
      render: (driver?: string) => driver || '-',
    },
    {
      title: 'Status Mutasi',
      dataIndex: 'status',
      key: 'status',
      render: (status: TransferStatus) => {
        const { color, label } = getTransferStatusTagColor(status);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_: any, record: StockTransfer) => (
        <Button
          icon={<EyeOutlined />}
          size="small"
          onClick={() => navigate(`/transfer/${record.id}`)}
        >
          Detail
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="transfers-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <SwapOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Mutasi & Transfer Antar Gudang (FE-401)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Kelola pengiriman barang antar lokasi gudang dan pelacakan status In-Transit.
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/transfer/new')}
              data-testid="btn-create-transfer"
            >
              Buat Pengiriman Mutasi Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari No TRF, Gudang, atau Driver..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-transfer"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                style={{ width: '100%' }}
                data-testid="select-status-filter"
                options={[
                  { value: 'all', label: 'Semua Status Mutasi' },
                  { value: 'in_transit', label: 'In-Transit (Dalam Pengiriman)' },
                  { value: 'received', label: 'Selesai (Received)' },
                  { value: 'partial_received', label: 'Terapresiasi Sebagian (Selisih)' },
                  { value: 'draft', label: 'Draft' },
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredTransfers}
            loading={isLoading}
            pagination={{ pageSize: 10 }}
            data-testid="table-transfers"
          />
        </Card>
      </Space>
    </div>
  );
};
