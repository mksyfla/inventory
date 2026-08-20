import React, { useState } from 'react';
import {
  Table,
  Button,
  Select,
  Space,
  Tag,
  Typography,
  Card,
  Row,
  Col,
  Badge,
  Tooltip,
  Modal,
  Input,
  InputNumber,
  Form,
} from 'antd';
import { PlusOutlined, QrcodeOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { LocationNode } from '../../types/location';
import { useWarehouseStore } from '../../store/useWarehouseStore';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { locationService } from '../../api/services/locations';
import { LocationDTO, LocationType as BackendLocationType } from '../../api/dto';
import { mapLocationDTO } from '../../api/mappers';
import { LocationBarcodeModal } from '../../components/master/LocationBarcodeModal';

const { Title, Paragraph, Text } = Typography;

const BACKEND_LOC_TYPES: BackendLocationType[] = [
  'staging',
  'pick',
  'bulk',
  'quarantine',
  'damaged',
  'transit',
];

const getLocationTypeTag = (type: string) => {
  const map: Record<string, { color: string; label: string }> = {
    staging: { color: 'green', label: 'Staging' },
    pick: { color: 'cyan', label: 'Pick Face' },
    bulk: { color: 'geekblue', label: 'Bulk' },
    quarantine: { color: 'orange', label: 'Karantina / QC' },
    damaged: { color: 'volcano', label: 'Barang Rusak' },
    transit: { color: 'magenta', label: 'Transit' },
  };
  const item = map[type] || { color: 'default', label: type };
  return <Tag color={item.color}>{item.label}</Tag>;
};

export const LocationsPage: React.FC = () => {
  const { warehouses, activeWarehouseId, setActiveWarehouseId } = useWarehouseStore();
  const [barcodeModalOpen, setBarcodeModalOpen] = useState<boolean>(false);
  const [selectedBarcodeLoc, setSelectedBarcodeLoc] = useState<LocationNode | null>(null);
  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [form] = Form.useForm();

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', activeWarehouseId],
    queryFn: () => locationService.listLocations(activeWarehouseId),
  });

  const createMutation = useMutationWithToast({
    mutationFn: (values: any) =>
      locationService.createLocation({
        warehouse_id: activeWarehouseId,
        code: values.code,
        zone: values.zone || null,
        rack: values.rack || null,
        level: values.level || null,
        loc_type: values.loc_type,
        pick_seq: values.pick_seq ?? null,
        capacity: values.capacity ?? null,
      }),
    successTitle: 'Lokasi Berhasil Ditambahkan',
    successMessage: 'Lokasi bin baru telah disimpan ke database master.',
    invalidateKeys: [['locations']],
  });

  const handleOpenBarcode = (loc: LocationDTO) => {
    setSelectedBarcodeLoc(mapLocationDTO(loc));
    setBarcodeModalOpen(true);
  };

  const handleSubmitCreate = () => {
    form.validateFields().then((values) => {
      createMutation.mutate(values, {
        onSuccess: () => {
          setFormModalOpen(false);
          form.resetFields();
        },
      });
    });
  };

  const columns = [
    {
      title: 'Kode Lokasi Bin',
      dataIndex: 'code',
      key: 'code',
      width: 200,
      render: (code: string) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#0052cc' }} />
          <Text strong style={{ letterSpacing: 0.5 }}>{code}</Text>
        </Space>
      ),
    },
    {
      title: 'Tipe Lokasi',
      dataIndex: 'loc_type',
      key: 'loc_type',
      width: 170,
      render: (type: string) => getLocationTypeTag(type),
    },
    {
      title: 'Zona / Rak / Level',
      key: 'zone',
      width: 200,
      render: (_: any, record: LocationDTO) => (
        <Text type="secondary">{record.zone || '-'} / {record.rack || '-'} / {record.level || '-'}</Text>
      ),
    },
    {
      title: 'Kapasitas',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 120,
      render: (cap: number | null) => (cap ? <Text>{cap}</Text> : <Text type="secondary">-</Text>),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 110,
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Aktif' : 'Nonaktif'} />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 90,
      render: (_: any, record: LocationDTO) => (
        <Tooltip title="Cetak QR Code / Barcode Rak (FR-1.6)">
          <Button
            type="text"
            icon={<QrcodeOutlined style={{ color: '#fa8c16' }} />}
            onClick={() => handleOpenBarcode(record)}
            data-testid={`btn-barcode-loc-${record.id}`}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div data-testid="locations-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Lokasi Bin (Warehouse Locations)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Daftar lokasi storage (staging, pick, bulk, quarantine, damaged, transit) per gudang.
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormModalOpen(true)}
              data-testid="btn-add-root-location"
            >
              Tambah Lokasi Bin
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Text strong>Pilih Gudang Aktif:</Text>
                <Select
                  value={activeWarehouseId}
                  onChange={(val) => setActiveWarehouseId(val)}
                  style={{ width: 280 }}
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                  data-testid="select-warehouse-filter"
                />
              </Space>
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={locations}
            loading={isLoading}
            pagination={false}
            data-testid="table-locations-tree"
          />
        </Card>
      </Space>

      {/* Add Location Modal (maps to POST /locations) */}
      <Modal
        open={formModalOpen}
        title="Tambah Lokasi Bin Baru"
        onCancel={() => setFormModalOpen(false)}
        onOk={handleSubmitCreate}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
        data-testid="modal-location-form"
      >
        <Form form={form} layout="vertical" initialValues={{ loc_type: 'pick' }}>
          <Form.Item name="code" label="Kode Lokasi" rules={[{ required: true, message: 'Kode lokasi wajib diisi' }]}>
            <Input placeholder="Contoh: PK-01-03" style={{ textTransform: 'uppercase' }} data-testid="input-location-code" />
          </Form.Item>
          <Form.Item name="loc_type" label="Tipe Lokasi" rules={[{ required: true, message: 'Tipe lokasi wajib dipilih' }]}>
            <Select
              options={BACKEND_LOC_TYPES.map((t) => ({ value: t, label: t }))}
              data-testid="select-location-type"
            />
          </Form.Item>
          <Form.Item name="zone" label="Zona (Opsional)">
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="rack" label="Rak (Opsional)">
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="level" label="Level (Opsional)">
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="pick_seq" label="Urutan Picking (Opsional)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="capacity" label="Kapasitas (Opsional)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <LocationBarcodeModal
        open={barcodeModalOpen}
        location={selectedBarcodeLoc}
        onClose={() => setBarcodeModalOpen(false)}
      />
    </div>
  );
};
