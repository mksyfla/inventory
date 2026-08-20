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
import { PlusOutlined, SearchOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DocStatus, GoodsReceiptNote, getDocStatusTagColor } from '../../types/inbound';
import { documentService } from '../../api/services/documents';
import { mapDocumentToGoodsReceiptNote } from '../../api/mappers';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

const { Title, Paragraph, Text } = Typography;

export const ReceiptsPage: React.FC = () => {
  const navigate = useNavigate();

  // Live GRN list from the shared document store (doc_type = GRN).
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const dtos = await documentService.list({ doc_type: 'GRN' });
      return dtos.map((dto) => mapDocumentToGoodsReceiptNote(dto));
    },
  });

  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedStatus, setSelectedStatus] = useState<DocStatus | null>(null);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchNo = r.documentNo.toLowerCase().includes(term);
        const matchPo = r.poReference.toLowerCase().includes(term);
        const matchSupplier = r.supplierName.toLowerCase().includes(term);
        const matchItem = r.items.some((i) =>
          i.sku.toLowerCase().includes(term) || i.itemName.toLowerCase().includes(term)
        );
        if (!matchNo && !matchPo && !matchSupplier && !matchItem) return false;
      }

      if (selectedStatus !== null && r.status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [receipts, debouncedTerm, selectedStatus]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedStatus(null);
  };

  const columns = [
    {
      title: 'No. Dokumen',
      dataIndex: 'documentNo',
      key: 'documentNo',
      width: 190,
      render: (no: string) => <Text strong style={{ color: '#0052cc' }}>{no}</Text>,
    },
    {
      title: 'Referensi PO',
      dataIndex: 'poReference',
      key: 'poReference',
      width: 140,
      render: (ref: string) => (ref ? <Text>{ref}</Text> : <Text type="secondary">-</Text>),
    },
    {
      title: 'Pemasok (Supplier)',
      dataIndex: 'supplierName',
      key: 'supplierName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Gudang Tujuan',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 180,
    },
    {
      title: 'Tgl Penerimaan',
      dataIndex: 'receiptDate',
      key: 'receiptDate',
      width: 130,
    },
    {
      title: 'Total SKU Line',
      key: 'itemsCount',
      width: 120,
      render: (_: any, record: GoodsReceiptNote) => {
        const count = record.items.length > 0 ? record.items.length : (record.lineCount ?? 0);
        return <Tag color="blue">{count} Barang</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: DocStatus) => {
        const tag = getDocStatusTagColor(status);
        return <Tag color={tag.color}>{tag.label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 90,
      render: (_: any, record: GoodsReceiptNote) => (
        <Space size={4}>
          <Tooltip title="Lihat Detail Penerimaan">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#0052cc' }} />}
              onClick={() => navigate(`/inbound/receipts/${record.id}`)}
              data-testid={`btn-view-grn-${record.id}`}
            />
          </Tooltip>
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
              Daftar seluruh transaksi penerimaan fisik barang (Inbound GRN).
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
            <Col xs={24} md={14}>
              <Input
                placeholder="Cari No. Dokumen, Referensi PO, Pemasok, atau Kode/Nama SKU..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-grn"
              />
            </Col>

            <Col xs={12} md={6}>
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
                  { value: 'in_progress', label: 'Sedang Putaway' },
                  { value: 'completed', label: 'Selesai' },
                  { value: 'cancelled', label: 'Dibatalkan' },
                ]}
                data-testid="select-filter-status"
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
            dataSource={filteredReceipts}
            loading={isLoading}
            pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} Dokumen` }}
            data-testid="table-receipts"
          />
        </Card>
      </Space>
    </div>
  );
};
