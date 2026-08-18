import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Popconfirm,
  Badge,
  Card,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  UploadOutlined,
  ReloadOutlined,
  BarcodeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Item, MOCK_CATEGORIES, ABCClass } from '../../types/item';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { itemService } from '../../api/services/items';
import { mapItemDTO } from '../../api/mappers';
import { ItemImportModal } from '../../components/master/ItemImportModal';
import { BarcodePrintModal } from '../../components/master/BarcodePrintModal';

const { Title, Text, Paragraph } = Typography;

export const ItemsPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: items = [], isLoading, isFetching } = useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const dtos = await itemService.listItems();
      return dtos.map(mapItemDTO);
    },
  });

  // State management
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [selectedPrintItem, setSelectedPrintItem] = useState<Item | null>(null);
  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedAbcClass, setSelectedAbcClass] = useState<ABCClass | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<boolean | null>(null);

  // Soft Delete / Reactivate (FR-1.5)
  const toggleMutation = useMutationWithToast({
    mutationFn: async (item: Item) => {
      if (item.isActive) {
        await itemService.softDeleteItem(item.id);
        return { ...item, isActive: false };
      }
      // Reactivation = PATCH with is_active=true (spec: PATCH /items/{id})
      const updated = await itemService.updateItem(item.id, {
        name: item.name,
        base_uom: item.baseUom,
        category_id: item.categoryId || null,
        is_batch: item.isBatch,
        is_expiry: item.isExpiry,
        is_serial: item.isSerial,
        min_qty: item.minQty,
        max_qty: item.maxQty ?? null,
        safety_stock: item.safetyStock,
        lead_time_days: item.leadTimeDays,
        abc_class: item.abcClass ?? null,
        is_active: true,
      });
      return mapItemDTO(updated);
    },
    successTitle: 'Status Berhasil Diubah',
    successMessage: 'Status SKU telah diperbarui di database.',
    invalidateKeys: [['items']],
  });

  const handleToggleSoftDelete = (item: Item) => {
    toggleMutation.mutate(item);
  };

  // Filtered dataset calculation
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchSku = item.sku.toLowerCase().includes(term);
        const matchName = item.name.toLowerCase().includes(term);
        if (!matchSku && !matchName) return false;
      }

      if (selectedCategory !== null && item.categoryId !== selectedCategory) {
        return false;
      }

      if (selectedAbcClass !== null && item.abcClass !== selectedAbcClass) {
        return false;
      }

      if (selectedStatus !== null && item.isActive !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [items, debouncedTerm, selectedCategory, selectedAbcClass, selectedStatus]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory(null);
    setSelectedAbcClass(null);
    setSelectedStatus(null);
  };

  const columns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      render: (sku: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{sku}</Tag>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Kategori',
      dataIndex: 'categoryName',
      key: 'categoryName',
      render: (cat: string) => cat || '-',
    },
    {
      title: 'Base UoM',
      dataIndex: 'baseUom',
      key: 'baseUom',
      width: 100,
      render: (uom: string) => <Tag>{uom}</Tag>,
    },
    {
      title: 'Kelas ABC',
      dataIndex: 'abcClass',
      key: 'abcClass',
      width: 100,
      render: (abc?: ABCClass) => {
        if (!abc) return '-';
        const colors: Record<ABCClass, string> = { A: 'green', B: 'geekblue', C: 'orange' };
        return <Tag color={colors[abc]}>Kelas {abc}</Tag>;
      },
    },
    {
      title: 'Batas Stok (Min / Max)',
      key: 'stockLimits',
      render: (_: any, record: Item) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          Min: <strong>{record.minQty}</strong> | Max: <strong>{record.maxQty ?? '∞'}</strong>
        </Text>
      ),
    },
    {
      title: 'Atribut Tracing',
      key: 'flags',
      render: (_: any, record: Item) => (
        <Space size={4} wrap>
          {record.isBatch && <Tag color="cyan">Batch</Tag>}
          {record.isExpiry && <Tag color="purple">Expiry</Tag>}
          {record.isSerial && <Tag color="gold">Serial</Tag>}
          {!record.isBatch && !record.isExpiry && !record.isSerial && (
            <Text type="secondary" style={{ fontSize: 12 }}>Standar</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (active: boolean) => (
        <Badge
          status={active ? 'success' : 'default'}
          text={active ? 'Aktif' : 'Nonaktif'}
        />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 160,
      render: (_: any, record: Item) => (
        <Space size={4}>
          <Tooltip title="Cetak Label Barcode Thermal (FR-1.6)">
            <Button
              type="text"
              icon={<BarcodeOutlined style={{ color: '#fa8c16' }} />}
              onClick={() => {
                setSelectedPrintItem(record);
                setPrintModalOpen(true);
              }}
              data-testid={`btn-print-item-${record.id}`}
            />
          </Tooltip>

          <Tooltip title="Edit SKU">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: '#0052cc' }} />}
              onClick={() => navigate(`/master/items/${record.id}/edit`)}
              data-testid={`btn-edit-item-${record.id}`}
            />
          </Tooltip>

          <Popconfirm
            title={record.isActive ? 'Nonaktifkan SKU?' : 'Aktifkan Kembali SKU?'}
            description={
              record.isActive
                ? 'Barang bertransaksi akan di-soft delete (nonaktif) dan tetap tersimpan di database.'
                : 'Mengubah status barang kembali menjadi aktif.'
            }
            onConfirm={() => handleToggleSoftDelete(record)}
            okText="Ya, Lanjutkan"
            cancelText="Batal"
            data-testid={`popconfirm-softdelete-${record.id}`}
          >
            <Tooltip title={record.isActive ? 'Soft Delete (Nonaktifkan)' : 'Aktifkan'}>
              <Button
                type="text"
                danger={record.isActive}
                icon={record.isActive ? <StopOutlined /> : <CheckCircleOutlined style={{ color: '#36b37e' }} />}
                data-testid={`btn-toggle-status-${record.id}`}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="items-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Title & Actions */}
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Data Barang (SKU)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Kelola daftar SKU, konversi satuan, batas stok minimum/maksimum, dan atribut pelacakan batch/kedaluwarsa.
            </Paragraph>
          </Col>
          <Col>
            <Space>
              <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)} data-testid="btn-open-import-modal">
                Impor CSV/Excel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/master/items/new')}
                data-testid="btn-add-new-sku"
              >
                Tambah SKU Baru
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Filter Card & Search Bar */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={8}>
              <Input
                placeholder="Cari Kode SKU atau Nama Barang..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-sku"
              />
            </Col>

            <Col xs={12} md={5}>
              <Select
                placeholder="Filter Kategori"
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val)}
                allowClear
                style={{ width: '100%' }}
                options={MOCK_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
                data-testid="select-filter-category"
              />
            </Col>

            <Col xs={12} md={4}>
              <Select
                placeholder="Kelas ABC"
                value={selectedAbcClass}
                onChange={(val) => setSelectedAbcClass(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'A', label: 'Kelas A (Fast)' },
                  { value: 'B', label: 'Kelas B (Medium)' },
                  { value: 'C', label: 'Kelas C (Slow)' },
                ]}
                data-testid="select-filter-abc"
              />
            </Col>

            <Col xs={12} md={4}>
              <Select
                placeholder="Status Status"
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: true, label: 'Aktif' },
                  { value: false, label: 'Nonaktif' },
                ]}
                data-testid="select-filter-status"
              />
            </Col>

            <Col xs={12} md={3}>
              <Button icon={<ReloadOutlined />} onClick={handleResetFilters} style={{ width: '100%' }}>
                Reset
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Table List */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredItems}
          loading={isLoading || isFetching}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `Total ${total} SKU` }}
          data-testid="table-items"
        />
      </Space>

      <ItemImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => navigate(0)}
      />

      <BarcodePrintModal
        open={printModalOpen}
        item={selectedPrintItem}
        onClose={() => {
          setPrintModalOpen(false);
          setSelectedPrintItem(null);
        }}
      />
    </div>
  );
};
