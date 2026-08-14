import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Input,
  Space,
  Badge,
  Typography,
  Card,
  Row,
  Col,
  Popconfirm,
  notification,
} from 'antd';
import { PlusOutlined, EditOutlined, HomeOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Warehouse, MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

const warehouseSchema = z.object({
  code: z
    .string()
    .min(2, 'Kode gudang minimal 2 karakter')
    .max(20, 'Kode gudang maksimal 20 karakter')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode gudang hanya boleh huruf, angka, strip, underscore')
    .toUpperCase(),
  name: z.string().min(3, 'Nama gudang minimal 3 karakter').max(100, 'Nama gudang maksimal 100 karakter'),
  address: z.string().optional(),
  isActive: z.boolean(),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export const WarehousesPage: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>(MOCK_WAREHOUSES);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      code: '',
      name: '',
      address: '',
      isActive: true,
    },
  });

  const handleOpenAdd = () => {
    setEditingWh(null);
    reset({
      code: '',
      name: '',
      address: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (wh: Warehouse) => {
    setEditingWh(wh);
    reset({
      code: wh.code,
      name: wh.name,
      address: wh.address || '',
      isActive: wh.isActive,
    });
    setModalOpen(true);
  };

  const handleToggleStatus = (wh: Warehouse) => {
    const nextStatus = !wh.isActive;
    setWarehouses((prev) =>
      prev.map((item) => (item.id === wh.id ? { ...item, isActive: nextStatus } : item))
    );
    notification.success({
      message: `Status Gudang Berhasil Diubah`,
      description: `Gudang ${wh.code} kini berstatus ${nextStatus ? 'Aktif' : 'Nonaktif'}.`,
    });
  };

  const onSubmit = (values: WarehouseFormValues) => {
    if (editingWh) {
      setWarehouses((prev) =>
        prev.map((w) => (w.id === editingWh.id ? { ...w, ...values } : w))
      );
      notification.success({ message: 'Data Gudang Berhasil Diperbarui' });
    } else {
      const newWh: Warehouse = {
        id: Date.now(),
        ...values,
      };
      setWarehouses((prev) => [...prev, newWh]);
      notification.success({ message: 'Gudang Baru Berhasil Ditambahkan' });
    }
    setModalOpen(false);
  };

  const columns = [
    {
      title: 'Kode Gudang',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text strong style={{ color: '#0052cc' }}>{code}</Text>,
    },
    {
      title: 'Nama Gudang',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Alamat / Lokasi Fasilitas',
      dataIndex: 'address',
      key: 'address',
      render: (addr?: string) => addr || '-',
    },
    {
      title: 'Status Operasional',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 150,
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Aktif' : 'Nonaktif'} />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 120,
      render: (_: any, record: Warehouse) => (
        <Space size={8}>
          <Button
            type="text"
            icon={<EditOutlined style={{ color: '#0052cc' }} />}
            onClick={() => handleOpenEdit(record)}
            data-testid={`btn-edit-wh-${record.id}`}
          />
          <Popconfirm
            title={record.isActive ? 'Nonaktifkan Gudang?' : 'Aktifkan Gudang?'}
            onConfirm={() => handleToggleStatus(record)}
            okText="Ya"
            cancelText="Batal"
            data-testid={`popconfirm-toggle-wh-${record.id}`}
          >
            <Button
              type="text"
              danger={record.isActive}
              icon={record.isActive ? <StopOutlined /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              data-testid={`btn-toggle-wh-${record.id}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="warehouses-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Data Gudang (Warehouse Facilities)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Kelola entitas gudang fisik dan fasilitas penyimpanan utama di seluruh lokasi operasional.
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAdd}
              data-testid="btn-add-warehouse"
            >
              Tambah Gudang Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={warehouses}
            pagination={false}
            data-testid="table-warehouses"
          />
        </Card>
      </Space>

      {/* Add / Edit Warehouse Modal */}
      <Modal
        open={modalOpen}
        title={
          <Space>
            <HomeOutlined style={{ color: '#0052cc' }} />
            <span>{editingWh ? `Edit Gudang: ${editingWh.code}` : 'Tambah Gudang Baru'}</span>
          </Space>
        }
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        data-testid="modal-warehouse-form"
      >
        <form onSubmit={handleSubmit(onSubmit)} data-testid="form-warehouse">
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Kode Gudang <Text type="danger">*</Text>
              </label>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: WH-JKT01"
                    style={{ textTransform: 'uppercase' }}
                    disabled={Boolean(editingWh)}
                    data-testid="input-wh-code"
                  />
                )}
              />
              {errors.code && <Text type="danger" style={{ fontSize: 12 }}>{errors.code.message}</Text>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Gudang <Text type="danger">*</Text>
              </label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input {...field} placeholder="Contoh: Gudang Utama Jakarta" data-testid="input-wh-name" />
                )}
              />
              {errors.name && <Text type="danger" style={{ fontSize: 12 }}>{errors.name.message}</Text>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Alamat Lengkap</label>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <Input.TextArea {...field} rows={3} placeholder="Alamat jalan, kota, provinsi" data-testid="input-wh-address" />
                )}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" data-testid="btn-submit-wh">
                  {editingWh ? 'Simpan Perubahan' : 'Tambah Gudang'}
                </Button>
              </Space>
            </div>
          </Space>
        </form>
      </Modal>
    </div>
  );
};
