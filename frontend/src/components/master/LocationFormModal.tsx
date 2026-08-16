import React, { useEffect } from 'react';
import {
  Modal,
  Input,
  InputNumber,
  Select,
  Switch,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Button,
} from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LocationNode, locationSchema, LocationFormValues } from '../../types/location';

const { Text } = Typography;

export interface LocationFormModalProps {
  open: boolean;
  editingLocation: LocationNode | null;
  parentLocation?: LocationNode | null;
  warehouseId: number;
  onClose: () => void;
  onSubmit: (values: LocationFormValues) => void;
}

export const LocationFormModal: React.FC<LocationFormModalProps> = ({
  open,
  editingLocation,
  parentLocation,
  onClose,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'bin',
      parentId: parentLocation?.id || null,
      capacityVolumeM3: 2.5,
      capacityWeightKg: 500,
      isActive: true,
      isLocked: false,
    },
  });

  useEffect(() => {
    if (editingLocation) {
      reset({
        code: editingLocation.code,
        name: editingLocation.name,
        type: editingLocation.type,
        parentId: editingLocation.parentId || null,
        capacityVolumeM3: editingLocation.capacityVolumeM3 ?? undefined,
        capacityWeightKg: editingLocation.capacityWeightKg ?? undefined,
        isActive: editingLocation.isActive,
        isLocked: editingLocation.isLocked,
      });
    } else {
      reset({
        code: parentLocation ? `${parentLocation.code}-` : '',
        name: '',
        type: parentLocation ? (parentLocation.type === 'zone' ? 'rack' : 'bin') : 'zone',
        parentId: parentLocation?.id || null,
        capacityVolumeM3: 2.5,
        capacityWeightKg: 500,
        isActive: true,
        isLocked: false,
      });
    }
  }, [editingLocation, parentLocation, reset]);

  return (
    <Modal
      open={open}
      title={
        <Space>
          <EnvironmentOutlined style={{ color: '#0052cc' }} />
          <span>
            {editingLocation
              ? `Edit Lokasi: ${editingLocation.code}`
              : parentLocation
              ? `Tambah Lokasi Sub (Di bawah ${parentLocation.code})`
              : 'Tambah Lokasi Baru'}
          </span>
        </Space>
      }
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={560}
      data-testid="modal-location-form"
    >
      <form onSubmit={handleSubmit(onSubmit)} data-testid="form-location">
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
          {parentLocation && (
            <Alert
              message={`Lokasi Induk: ${parentLocation.name} [${parentLocation.code}]`}
              type="info"
              showIcon
            />
          )}

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Kode Lokasi (Standar) <Text type="danger">*</Text>
              </label>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: JKT01-Z1-R01-B01"
                    style={{ textTransform: 'uppercase' }}
                    disabled={Boolean(editingLocation)}
                    data-testid="input-location-code"
                  />
                )}
              />
              {errors.code && <Text type="danger" style={{ fontSize: 12 }}>{errors.code.message}</Text>}
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Lokasi <Text type="danger">*</Text>
              </label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input {...field} placeholder="Contoh: Bin A1-01 (Tinta Intaglio)" data-testid="input-location-name" />
                )}
              />
              {errors.name && <Text type="danger" style={{ fontSize: 12 }}>{errors.name.message}</Text>}
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Tipe Lokasi <Text type="danger">*</Text>
              </label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'zone', label: 'Zona Penyimpanan (Zone)' },
                      { value: 'rack', label: 'Rak Storage (Rack)' },
                      { value: 'bin', label: 'Bin / Slot Spesifik (Bin)' },
                      { value: 'staging_inbound', label: 'Staging Penerimaan (Inbound Area)' },
                      { value: 'staging_outbound', label: 'Staging Pengeluaran (Outbound Area)' },
                      { value: 'quarantine', label: 'Area Karantina / QC' },
                      { value: 'damaged', label: 'Area Barang Rusak (Damaged Area)' },
                    ]}
                    data-testid="select-location-type"
                  />
                )}
              />
            </Col>

            <Col xs={12} md={6}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Vol (m³)</label>
              <Controller
                name="capacityVolumeM3"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    value={field.value ?? undefined}
                    onChange={(val) => field.onChange(val)}
                    style={{ width: '100%' }}
                    min={0.01}
                    placeholder="2.5"
                    data-testid="input-capacity-volume"
                  />
                )}
              />
              {errors.capacityVolumeM3 && (
                <Text type="danger" style={{ fontSize: 12 }}>{errors.capacityVolumeM3.message}</Text>
              )}
            </Col>

            <Col xs={12} md={6}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Berat (kg)</label>
              <Controller
                name="capacityWeightKg"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    value={field.value ?? undefined}
                    onChange={(val) => field.onChange(val)}
                    style={{ width: '100%' }}
                    min={0.01}
                    placeholder="500"
                    data-testid="input-capacity-weight"
                  />
                )}
              />
              {errors.capacityWeightKg && (
                <Text type="danger" style={{ fontSize: 12 }}>{errors.capacityWeightKg.message}</Text>
              )}
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Status Aktif</label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch checked={field.value} onChange={(val) => field.onChange(val)} data-testid="switch-is-active" />
                    <span>{field.value ? 'Aktif' : 'Nonaktif'}</span>
                  </Space>
                )}
              />
            </Col>

            <Col xs={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Kunci Lokasi (Lock Bin)</label>
              <Controller
                name="isLocked"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch checked={field.value} onChange={(val) => field.onChange(val)} data-testid="switch-is-locked" />
                    <span>{field.value ? 'Terkunci (Lock)' : 'Terbuka'}</span>
                  </Space>
                )}
              />
            </Col>
          </Row>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space>
              <Button onClick={onClose}>Batal</Button>
              <Button type="primary" htmlType="submit" data-testid="btn-submit-location">
                {editingLocation ? 'Simpan Perubahan' : 'Tambah Lokasi'}
              </Button>
            </Space>
          </div>
        </Space>
      </form>
    </Modal>
  );
};
