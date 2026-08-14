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
  Badge,
  Popconfirm,
  Tooltip,
  notification,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  PhoneOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { Partner, PartnerType, MOCK_PARTNERS } from '../../types/partner';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { PartnerFormModal } from '../../components/master/PartnerFormModal';

const { Title, Paragraph, Text } = Typography;

export const PartnersPage: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>(MOCK_PARTNERS);
  const { searchTerm, setSearchTerm, debouncedTerm } = useDebouncedSearch('', 300);
  const [selectedType, setSelectedType] = useState<PartnerType | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<boolean | null>(null);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      if (debouncedTerm) {
        const term = debouncedTerm.toLowerCase();
        const matchCode = p.code.toLowerCase().includes(term);
        const matchName = p.name.toLowerCase().includes(term);
        const matchCp = p.contactPerson?.toLowerCase().includes(term);
        if (!matchCode && !matchName && !matchCp) return false;
      }

      if (selectedType !== null && p.type !== selectedType) {
        return false;
      }

      if (selectedStatus !== null && p.isActive !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [partners, debouncedTerm, selectedType, selectedStatus]);

  const handleOpenAdd = () => {
    setEditingPartner(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setModalOpen(true);
  };

  const handleToggleStatus = (partner: Partner) => {
    const nextStatus = !partner.isActive;
    setPartners((prev) =>
      prev.map((item) => (item.id === partner.id ? { ...item, isActive: nextStatus } : item))
    );
    notification.success({
      message: `Status Mitra Berhasil Diubah`,
      description: `Mitra ${partner.code} kini berstatus ${nextStatus ? 'Aktif' : 'Nonaktif'}.`,
    });
  };

  const handleSavePartner = (values: any) => {
    if (editingPartner) {
      setPartners((prev) =>
        prev.map((p) => (p.id === editingPartner.id ? { ...p, ...values } : p))
      );
      notification.success({ message: 'Data Mitra Berhasil Diperbarui' });
    } else {
      const newPartner: Partner = {
        id: Date.now(),
        ...values,
      };
      setPartners((prev) => [...prev, newPartner]);
      notification.success({ message: 'Mitra Bisnis Baru Berhasil Ditambahkan' });
    }
    setModalOpen(false);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedType(null);
    setSelectedStatus(null);
  };

  const getPartnerTypeTag = (type: PartnerType) => {
    const map: Record<PartnerType, { color: string; label: string }> = {
      supplier: { color: 'blue', label: 'Pemasok (Supplier)' },
      customer: { color: 'green', label: 'Pelanggan (Customer)' },
      internal_unit: { color: 'purple', label: 'Unit Internal' },
    };
    const item = map[type] || { color: 'default', label: type };
    return <Tag color={item.color}>{item.label}</Tag>;
  };

  const columns = [
    {
      title: 'Kode Mitra',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>,
    },
    {
      title: 'Nama Mitra / Perusahaan',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Tipe Mitra',
      dataIndex: 'type',
      key: 'type',
      width: 170,
      render: (type: PartnerType) => getPartnerTypeTag(type),
    },
    {
      title: 'Kontak (PIC)',
      dataIndex: 'contactPerson',
      key: 'contactPerson',
      render: (cp?: string) => cp || '-',
    },
    {
      title: 'Kontak Telepon & Email',
      key: 'contactInfo',
      render: (_: any, record: Partner) => (
        <Space direction="vertical" size={2}>
          {record.phone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <PhoneOutlined /> {record.phone}
            </Text>
          )}
          {record.email && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <MailOutlined /> {record.email}
            </Text>
          )}
          {!record.phone && !record.email && '-'}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Aktif' : 'Nonaktif'} />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 110,
      render: (_: any, record: Partner) => (
        <Space size={8}>
          <Tooltip title="Edit Data Mitra">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: '#0052cc' }} />}
              onClick={() => handleOpenEdit(record)}
              data-testid={`btn-edit-partner-${record.id}`}
            />
          </Tooltip>
          <Popconfirm
            title={record.isActive ? 'Nonaktifkan Mitra?' : 'Aktifkan Mitra?'}
            onConfirm={() => handleToggleStatus(record)}
            okText="Ya"
            cancelText="Batal"
            data-testid={`popconfirm-toggle-partner-${record.id}`}
          >
            <Tooltip title={record.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
              <Button
                type="text"
                danger={record.isActive}
                icon={record.isActive ? <StopOutlined /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                data-testid={`btn-toggle-partner-${record.id}`}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="partners-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Data Mitra Bisnis (Partners)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Pengelolaan data Pemasok (Suppliers), Pelanggan (Customers), dan Unit Penerima Internal (Internal Dept).
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAdd}
              data-testid="btn-add-partner"
            >
              Tambah Mitra Bisnis Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} md={10}>
              <Input
                placeholder="Cari Kode, Nama Mitra, atau Contact Person..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                data-testid="input-search-partner"
              />
            </Col>

            <Col xs={12} md={6}>
              <Select
                placeholder="Filter Tipe Mitra"
                value={selectedType}
                onChange={(val) => setSelectedType(val)}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: 'supplier', label: 'Pemasok (Supplier)' },
                  { value: 'customer', label: 'Pelanggan (Customer)' },
                  { value: 'internal_unit', label: 'Unit Internal' },
                ]}
                data-testid="select-filter-type"
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

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredPartners}
            pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} Mitra` }}
            data-testid="table-partners"
          />
        </Card>
      </Space>

      <PartnerFormModal
        open={modalOpen}
        editingPartner={editingPartner}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSavePartner}
      />
    </div>
  );
};
