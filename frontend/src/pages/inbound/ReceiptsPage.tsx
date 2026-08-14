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
  FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DocStatus, GoodsReceiptNote, getDocStatusTagColor, MOCK_GRN_LIST } from '../../types/inbound';
import { MOCK_PARTNERS } from '../../types/partner';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

const { Title, Paragraph, Text } = Typography;

export const ReceiptsPage: React.FC = () => {
  const navigate = useNavigate();
  const [grnList] = useState<GoodsReceiptNote[]>(MOCK_GRN_LIST);
  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedStatus, setSelectedStatus] = useState<DocStatus | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  const filteredGrnList = useMemo(() => {
    return grnList.filter((item) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchDoc = item.documentNo.toLowerCase().includes(term);
        const matchPo = item.poReference.toLowerCase().includes(term);
        const matchSupplier = item.supplierName.toLowerCase().includes(term);
        if (!matchDoc && !matchPo && !matchSupplier) return false;
      }

      if (selectedStatus !== null && item.status !== selectedStatus) {
        return false;
      }

      if (selectedSupplierId !== null && item.supplierId !== selectedSupplierId) {
        return false;
      }

      return true;
    });
  }, [grnList, debouncedTerm, selectedStatus, selectedSupplierId]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedStatus(null);
    setSelectedSupplierId(null);
  };

  const columns = [
    {
      title: 'No. Dokumen GRN',
      dataIndex: 'documentNo',
      key: 'documentNo',
      render: (docNo: string, record: GoodsReceiptNote) => (
        <Space>
          <FileTextOutlined style={{ color: '#0052cc' }} />
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 600 }}
            onClick={() => navigate(`/inbound/receipts/${record.id}`)}
            data-testid={`link-grn-${record.id}`}
          >
            {docNo}
          </Button>
        </Space>
      ),
    },
    {
      title: 'Ref. PO',
      dataIndex: 'poReference',
      key: 'poReference',
      render: (po: string) => <Text code>{po}</Text>,
    },
    {
      title: 'Pemasok (Supplier)',
      dataIndex: 'supplierName',
      key: 'supplierName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Tgl Penerimaan',
      dataIndex: 'receiptDate',
      key: 'receiptDate',
      width: 140,
    },
    {
      title: 'Jumlah Item',
      key: 'totalItems',
      width: 110,
      render: (_: any, record: GoodsReceiptNote) => `${record.items.length} Line SKU`,
    },
    {
      title: 'Status Dokumen',
      dataIndex: 'status',
      key: 'status',
      width: 210,
      render: (status: DocStatus) => {
        const { color, label } = getDocStatusTagColor(status);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 120,
      render: (_: any, record: GoodsReceiptNote) => (
        <Space size={4}>
          <Tooltip title="Lihat Rincian Detail Dokumen GRN">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#0052cc' }} />}
              onClick={() => navigate(`/inbound/receipts/${record.id}`)}
              data-testid={`btn-view-grn-${record.id}`}
            />
          </Tooltip>

          {record.status === 'draft' && (
            <Tooltip title="Edit Draft Dokumen">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#fa8c16' }} />}
                onClick={() => navigate(`/inbound/receipts/${record.id}/edit`)}
                data-testid={`btn-edit-grn-${record.id}`}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="receipts-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Dokumen Penerimaan Barang (Goods Receipt Notes)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Daftar seluruh transaksi penerimaan fisik barang (Inbound GRN), inspeksi QC, dan penempatan lokasi storage.
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/inbound/receipts/new')}
              data-testid="btn-create-grn"
            >
              Buat Penerimaan (GRN) Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} md={9}>
              <Input
                placeholder="Cari No. GRN, Ref PO, atau nama Pemasok..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-grn"
              />
            </Col>

            <Col xs={12} md={6}>
              <Select
                placeholder="Filter Status Dokumen"
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'submitted', label: 'Diajukan (Submitted)' },
                  { value: 'approved', label: 'Disetujui (Approved)' },
                  { value: 'in_progress', label: 'Sedang Putaway (In Progress)' },
                  { value: 'completed', label: 'Selesai (Completed)' },
                  { value: 'cancelled', label: 'Dibatalkan (Cancelled)' },
                ]}
                data-testid="select-filter-status"
              />
            </Col>

            <Col xs={12} md={6}>
              <Select
                placeholder="Filter Pemasok (Supplier)"
                value={selectedSupplierId}
                onChange={(val) => setSelectedSupplierId(val)}
                allowClear
                style={{ width: '100%' }}
                options={MOCK_PARTNERS.filter((p) => p.type === 'supplier').map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                data-testid="select-filter-supplier"
              />
            </Col>

            <Col xs={12} md={3}>
              <Button icon={<ReloadOutlined />} onClick={handleResetFilters} style={{ width: '100%' }}>
                Reset
              </Button>
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredGrnList}
            pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} Dokumen GRN` }}
            data-testid="table-receipts"
          />
        </Card>
      </Space>
    </div>
  );
};
