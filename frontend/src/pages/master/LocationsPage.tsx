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
  notification,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  QrcodeOutlined,
  LockOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { LocationNode, LocationType, MOCK_LOCATIONS_TREE, MOCK_WAREHOUSES } from '../../types/location';
import { LocationFormModal } from '../../components/master/LocationFormModal';
import { LocationBarcodeModal } from '../../components/master/LocationBarcodeModal';

const { Title, Paragraph, Text } = Typography;

export const LocationsPage: React.FC = () => {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number>(1);
  const [locationsTree, setLocationsTree] = useState<LocationNode[]>(MOCK_LOCATIONS_TREE);

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [editingLocation, setEditingLocation] = useState<LocationNode | null>(null);
  const [parentLocation, setParentLocation] = useState<LocationNode | null>(null);

  const [barcodeModalOpen, setBarcodeModalOpen] = useState<boolean>(false);
  const [selectedBarcodeLoc, setSelectedBarcodeLoc] = useState<LocationNode | null>(null);

  const handleOpenAddSub = (parent: LocationNode) => {
    setEditingLocation(null);
    setParentLocation(parent);
    setFormModalOpen(true);
  };

  const handleOpenAddRoot = () => {
    setEditingLocation(null);
    setParentLocation(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (loc: LocationNode) => {
    setEditingLocation(loc);
    setParentLocation(null);
    setFormModalOpen(true);
  };

  const handleOpenBarcode = (loc: LocationNode) => {
    setSelectedBarcodeLoc(loc);
    setBarcodeModalOpen(true);
  };

  const handleSaveLocation = (values: any) => {
    if (editingLocation) {
      // Recursive update
      const updateNode = (list: LocationNode[]): LocationNode[] =>
        list.map((item) => {
          if (item.id === editingLocation.id) {
            return { ...item, ...values };
          }
          if (item.children) {
            return { ...item, children: updateNode(item.children) };
          }
          return item;
        });

      setLocationsTree(updateNode(locationsTree));
      notification.success({ message: 'Lokasi Berhasil Diperbarui' });
    } else {
      // Add new node
      const newNode: LocationNode = {
        id: Date.now(),
        warehouseId: selectedWarehouseId,
        ...values,
      };

      if (parentLocation) {
        const addChildNode = (list: LocationNode[]): LocationNode[] =>
          list.map((item) => {
            if (item.id === parentLocation.id) {
              return {
                ...item,
                children: [...(item.children || []), newNode],
              };
            }
            if (item.children) {
              return { ...item, children: addChildNode(item.children) };
            }
            return item;
          });
        setLocationsTree(addChildNode(locationsTree));
      } else {
        setLocationsTree((prev) => [...prev, newNode]);
      }
      notification.success({ message: 'Lokasi Baru Berhasil Ditambahkan' });
    }
    setFormModalOpen(false);
  };

  const getLocationTypeTag = (type: LocationType) => {
    const map: Record<LocationType, { color: string; label: string }> = {
      warehouse: { color: 'blue', label: 'Gudang' },
      zone: { color: 'geekblue', label: 'Zona' },
      rack: { color: 'cyan', label: 'Rak' },
      bin: { color: 'purple', label: 'Bin Slot' },
      staging_inbound: { color: 'green', label: 'Staging Inbound' },
      staging_outbound: { color: 'magenta', label: 'Staging Outbound' },
      quarantine: { color: 'orange', label: 'Karantina / QC' },
      damaged: { color: 'volcano', label: 'Barang Rusak' },
    };

    const item = map[type] || { color: 'default', label: type };
    return <Tag color={item.color}>{item.label}</Tag>;
  };

  const columns = [
    {
      title: 'Kode Lokasi Bin',
      dataIndex: 'code',
      key: 'code',
      width: 220,
      render: (code: string, record: LocationNode) => (
        <Space>
          <FolderOpenOutlined style={{ color: '#0052cc' }} />
          <Text strong style={{ letterSpacing: 0.5 }}>{code}</Text>
          {record.isLocked && (
            <Tooltip title="Lokasi Terkunci (Locked)">
              <LockOutlined style={{ color: '#ff4d4f' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Nama Lokasi',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text>{name}</Text>,
    },
    {
      title: 'Tipe Hierarki',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: LocationType) => getLocationTypeTag(type),
    },
    {
      title: 'Kapasitas (Vol / Berat)',
      key: 'capacity',
      width: 180,
      render: (_: any, record: LocationNode) =>
        record.capacityVolumeM3 || record.capacityWeightKg ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {record.capacityVolumeM3 ? `${record.capacityVolumeM3} m³` : '-'} /{' '}
            {record.capacityWeightKg ? `${record.capacityWeightKg} kg` : '-'}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Aktif' : 'Nonaktif'} />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 150,
      render: (_: any, record: LocationNode) => (
        <Space size={4}>
          <Tooltip title="Tambah Sub-Lokasi">
            <Button
              type="text"
              icon={<PlusOutlined style={{ color: '#36b37e' }} />}
              onClick={() => handleOpenAddSub(record)}
              data-testid={`btn-add-subloc-${record.id}`}
            />
          </Tooltip>

          <Tooltip title="Edit Lokasi">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: '#0052cc' }} />}
              onClick={() => handleOpenEdit(record)}
              data-testid={`btn-edit-loc-${record.id}`}
            />
          </Tooltip>

          <Tooltip title="Cetak QR Code / Barcode Rak (FR-1.6)">
            <Button
              type="text"
              icon={<QrcodeOutlined style={{ color: '#fa8c16' }} />}
              onClick={() => handleOpenBarcode(record)}
              data-testid={`btn-barcode-loc-${record.id}`}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="locations-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Hirarki Lokasi Bin (Warehouse Locations)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Struktur bertingkat Gudang → Zona → Rak → Bin Slot untuk penempatan stok presisi dan scanning barcode.
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddRoot}
              data-testid="btn-add-root-location"
            >
              Tambah Zona / Area Utama
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Text strong>Pilih Gudang Aktif:</Text>
                <Select
                  value={selectedWarehouseId}
                  onChange={(val) => setSelectedWarehouseId(val)}
                  style={{ width: 280 }}
                  options={MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                  data-testid="select-warehouse-filter"
                />
              </Space>
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={locationsTree}
            expandable={{ defaultExpandAllRows: true }}
            pagination={false}
            data-testid="table-locations-tree"
          />
        </Card>
      </Space>

      {/* Add / Edit Location Modal */}
      <LocationFormModal
        open={formModalOpen}
        editingLocation={editingLocation}
        parentLocation={parentLocation}
        warehouseId={selectedWarehouseId}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleSaveLocation}
      />

      {/* Print Barcode Modal */}
      <LocationBarcodeModal
        open={barcodeModalOpen}
        location={selectedBarcodeLoc}
        onClose={() => setBarcodeModalOpen(false)}
      />
    </div>
  );
};
