import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Modal,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  notification,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CountSession,
  CountSessionStatus,
  countSessionSchema,
  CountSessionFormValues,
  getCountStatusTagColor,
  MOCK_COUNT_SESSIONS,
} from '../../types/counting';
import { MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const CountingSessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [sessions, setSessions] = useState<CountSession[]>(MOCK_COUNT_SESSIONS);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CountSessionFormValues>({
    resolver: zodResolver(countSessionSchema),
    defaultValues: {
      title: 'Stock Opname Bulanan - Agustus 2026',
      warehouseId: 1,
      scope: 'full',
      targetScopeDetail: 'Seluruh Gudang & Bin',
    },
  });

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.countNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.warehouseName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleCreateSubmit = (values: CountSessionFormValues) => {
    const newSession: CountSession = {
      id: Date.now(),
      countNo: `SO-2026-08-${String(sessions.length + 1).padStart(3, '0')}`,
      title: values.title,
      warehouseId: values.warehouseId,
      warehouseName:
        MOCK_WAREHOUSES.find((w) => w.id === values.warehouseId)?.name || 'Gudang Utama',
      scope: values.scope,
      targetScopeDetail: values.targetScopeDetail || 'Penuh (Full Warehouse)',
      status: 'open',
      iraScore: 100.0,
      createdBy: 'Dipo Supervisor',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      items: [],
    };

    setSessions([newSession, ...sessions]);
    setCreateModalOpen(false);
    reset();

    notification.success({
      message: 'Sesi Stock Opname Berhasil Dibuka (FE-601)',
      description: `Dokumen ${newSession.countNo} telah dibuat dengan snapshot stok awal.`,
    });
  };

  const columns = [
    {
      title: 'No. Sesi Opname (SO)',
      dataIndex: 'countNo',
      key: 'countNo',
      render: (text: string, record: CountSession) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 'bold' }}
          onClick={() => navigate(`/counting/${record.id}`)}
          data-testid={`btn-view-session-${record.id}`}
        >
          {text}
        </Button>
      ),
    },
    {
      title: 'Judul Sesi Opname',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <Text strong>{title}</Text>,
    },
    {
      title: 'Cakupan (Scope)',
      key: 'scope',
      render: (_: any, record: CountSession) => (
        <div>
          <Tag color="geekblue">{record.scope.toUpperCase()}</Tag>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
            {record.targetScopeDetail}
          </Text>
        </div>
      ),
    },
    {
      title: 'Gudang',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      render: (wh: string) => <Tag color="blue">{wh}</Tag>,
    },
    {
      title: 'Skor Akurasi IRA (%)',
      dataIndex: 'iraScore',
      key: 'iraScore',
      width: 170,
      render: (score?: number) => (
        <div>
          <Progress
            percent={score || 100}
            size="small"
            status={(score || 100) >= 98 ? 'success' : 'exception'}
          />
          <Text style={{ fontSize: 11, fontWeight: 'bold' }}>IRA Target ≥ 98%</Text>
        </div>
      ),
    },
    {
      title: 'Status Sesi',
      dataIndex: 'status',
      key: 'status',
      render: (status: CountSessionStatus) => {
        const { color, label } = getCountStatusTagColor(status);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_: any, record: CountSession) => (
        <Space>
          {record.status === 'in_progress' || record.status === 'open' ? (
            <Button
              type="primary"
              size="small"
              icon={<BarcodeOutlined />}
              onClick={() => navigate(`/counting/${record.id}/execute`)}
              data-testid={`btn-execute-count-${record.id}`}
            >
              Hitung Fisik
            </Button>
          ) : (
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => navigate(`/counting/${record.id}`)}
            >
              Detail
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="counting-sessions-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <FieldTimeOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Stock Opname & Penyesuaian Stok (FE-601 s.d. FE-605)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Sesi perhitungan fisik (Blind Count), rekonsiliasi selisih, dan skor Inventory Record Accuracy (IRA).
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Space wrap>
              <Button
                type="primary"
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
                icon={<EditOutlined />}
                onClick={() => navigate('/counting/adjustments/new')}
                data-testid="btn-nav-manual-adjustment"
              >
                Penyesuaian Stok Manual (FE-604)
              </Button>

              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
                data-testid="btn-create-session"
              >
                Buka Sesi Opname Baru (FE-601)
              </Button>
            </Space>
          </Col>
        </Row>

        {/* FE-605: IRA Accuracy Metric Card */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card variant="borderless" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Statistic
                title="Akurasi Stok Rata-Rata (IRA - Inventory Record Accuracy)"
                value={98.5}
                precision={1}
                suffix="%"
                valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
                prefix={<CheckCircleOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Target Key Performance Indicator ≥ 98.0%</Text>
            </Card>
          </Col>
        </Row>

        {/* Sessions Table */}
        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari No SO, Judul, atau Gudang..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-session"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                style={{ width: '100%' }}
                data-testid="select-status-filter"
                options={[
                  { value: 'all', label: 'Semua Status Sesi' },
                  { value: 'open', label: 'Sesi Baru (Open)' },
                  { value: 'in_progress', label: 'Proses Hitung Fisik' },
                  { value: 'review', label: 'Menunggu Rekonsiliasi' },
                  { value: 'posted', label: 'Selesai & Diposting' },
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredSessions}
            pagination={{ pageSize: 10 }}
            data-testid="table-count-sessions"
          />
        </Card>
      </Space>

      {/* Modal Buka Sesi Opname Baru */}
      <Modal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        title="Buka Sesi Stock Opname Baru (FE-601)"
        footer={null}
        destroyOnHidden
        data-testid="modal-create-session"
      >
        <form onSubmit={handleSubmit(handleCreateSubmit)} data-testid="form-create-session">
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Judul Sesi Opname <Text type="danger">*</Text>
              </label>
              <Controller
                name="title"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: Stock Opname Bulanan Zona A"
                    status={errors.title ? 'error' : ''}
                    data-testid="input-session-title"
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Pilih Gudang Opname <Text type="danger">*</Text>
              </label>
              <Controller
                name="warehouseId"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    style={{ width: '100%' }}
                    data-testid="select-session-warehouse"
                    options={MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))}
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Cakupan Opname (Scope) <Text type="danger">*</Text>
              </label>
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    style={{ width: '100%' }}
                    data-testid="select-session-scope"
                    options={[
                      { value: 'full', label: 'Full Warehouse (Seluruh Gudang)' },
                      { value: 'zone', label: 'Spesifik Zona / Rak' },
                      { value: 'abc_class', label: 'Cycle Count Kelas ABC' },
                    ]}
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Detail Detail Cakupan</label>
              <Controller
                name="targetScopeDetail"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: Zona A atau Kelas ABC Fast Moving"
                    data-testid="input-session-detail"
                  />
                )}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setCreateModalOpen(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" data-testid="btn-submit-session">
                  Buat Sesi Opname
                </Button>
              </Space>
            </div>
          </Space>
        </form>
      </Modal>
    </div>
  );
};
