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
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  ReloadOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ItemRequest,
  RequestStatus,
  RequestPriority,
  getRequestStatusTagColor,
} from '../../types/outbound';
import { documentService } from '../../api/services/documents';
import { mapDocumentToItemRequest } from '../../api/mappers';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

const { Title, Paragraph, Text } = Typography;

export const RequestsPage: React.FC = () => {
  const navigate = useNavigate();

  // Live item requests from the backend document store (doc_type = REQ).
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['requests'],
    queryFn: async () => {
      const dtos = await documentService.list({ doc_type: 'REQ' });
      return dtos.map((dto) => mapDocumentToItemRequest(dto));
    },
  });

  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedStatus, setSelectedStatus] = useState<RequestStatus | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<RequestPriority | null>(null);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchNo = r.requestNo.toLowerCase().includes(term);
        const matchUnit = r.requestingUnit.toLowerCase().includes(term);
        const matchItem = r.items.some((i) =>
          i.sku.toLowerCase().includes(term) || i.itemName.toLowerCase().includes(term)
        );
        if (!matchNo && !matchUnit && !matchItem) return false;
      }

      if (selectedStatus !== null && r.status !== selectedStatus) {
        return false;
      }

      if (selectedPriority !== null && r.priority !== selectedPriority) {
        return false;
      }

      return true;
    });
  }, [requests, debouncedTerm, selectedStatus, selectedPriority]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedStatus(null);
    setSelectedPriority(null);
  };

  const columns = [
    {
      title: 'No. Permintaan',
      dataIndex: 'requestNo',
      key: 'requestNo',
      width: 170,
      render: (no: string, record: ItemRequest) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0052cc' }}>{no}</Text>
          {record.priority === 'urgent' && (
            <Tag color="red" icon={<AlertOutlined />} style={{ fontSize: 10 }}>URGENT</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Unit / Divisi Peminta',
      dataIndex: 'requestingUnit',
      key: 'requestingUnit',
      render: (unit: string) => <Text strong>{unit}</Text>,
    },
    {
      title: 'Gudang Asal Barang',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 180,
    },
    {
      title: 'Tgl Dibutuhkan',
      dataIndex: 'requiredDate',
      key: 'requiredDate',
      width: 130,
    },
    {
      title: 'Total SKU Line',
      key: 'itemsCount',
      width: 120,
      render: (_: any, record: ItemRequest) => {
        const count = record.items.length > 0 ? record.items.length : (record.lineCount ?? 0);
        return <Tag color="blue">{count} Barang</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: RequestStatus) => {
        const tag = getRequestStatusTagColor(status);
        return <Tag color={tag.color}>{tag.label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 110,
      render: (_: any, record: ItemRequest) => (
        <Space size={4}>
          <Tooltip title="Lihat Detail Permintaan">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#0052cc' }} />}
              onClick={() => navigate(`/outbound/requests/${record.id}`)}
              data-testid={`btn-view-request-${record.id}`}
            />
          </Tooltip>
          {record.status === 'draft' && (
            <Tooltip title="Edit Draft Permintaan">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#fa8c16' }} />}
                onClick={() => navigate(`/outbound/requests/${record.id}/edit`)}
                data-testid={`btn-edit-request-${record.id}`}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="requests-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Daftar Permintaan Barang (Item Requests)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Pengajuan pengeluaran barang oleh unit kerja / cabang dan alur persetujuan (approval).
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/outbound/requests/new')}
              data-testid="btn-create-request"
            >
              Buat Permintaan Barang Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} md={10}>
              <Input
                placeholder="Cari No. Permintaan, Unit Peminta, atau Kode/Nama SKU..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-request"
              />
            </Col>

            <Col xs={12} md={5}>
              <Select
                placeholder="Filter Status"
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'submitted', label: 'Diajukan' },
                  { value: 'approved', label: 'Disetujui' },
                  { value: 'rejected', label: 'Ditolak' },
                  { value: 'fulfilled', label: 'Terpenuhi' },
                  { value: 'cancelled', label: 'Dibatalkan' },
                ]}
                data-testid="select-filter-status"
              />
            </Col>

            <Col xs={12} md={5}>
              <Select
                placeholder="Filter Prioritas"
                value={selectedPriority}
                onChange={(val) => setSelectedPriority(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
                data-testid="select-filter-priority"
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
            dataSource={filteredRequests}
            loading={isLoading}
            pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} Permintaan` }}
            data-testid="table-requests"
          />
        </Card>
      </Space>
    </div>
  );
};
