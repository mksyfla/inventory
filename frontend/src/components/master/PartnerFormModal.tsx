import React, { useEffect } from 'react';
import {
  Modal,
  Input,
  Select,
  Switch,
  Space,
  Typography,
  Row,
  Col,
  Button,
} from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Partner, partnerSchema, PartnerFormValues } from '../../types/partner';

const { Text } = Typography;

export interface PartnerFormModalProps {
  open: boolean;
  editingPartner: Partner | null;
  onClose: () => void;
  onSubmit: (values: PartnerFormValues) => void;
}

export const PartnerFormModal: React.FC<PartnerFormModalProps> = ({
  open,
  editingPartner,
  onClose,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'supplier',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (editingPartner) {
      reset({
        code: editingPartner.code,
        name: editingPartner.name,
        type: editingPartner.type,
        address: editingPartner.address || '',
        contactPerson: editingPartner.contactPerson || '',
        phone: editingPartner.phone || '',
        email: editingPartner.email || '',
        isActive: editingPartner.isActive,
      });
    } else {
      reset({
        code: '',
        name: '',
        type: 'supplier',
        address: '',
        contactPerson: '',
        phone: '',
        email: '',
        isActive: true,
      });
    }
  }, [editingPartner, reset]);

  return (
    <Modal
      open={open}
      title={
        <Space>
          <TeamOutlined style={{ color: '#0052cc' }} />
          <span>{editingPartner ? `Edit Mitra: ${editingPartner.code}` : 'Tambah Mitra Bisnis Baru'}</span>
        </Space>
      }
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={560}
      data-testid="modal-partner-form"
    >
      <form onSubmit={handleSubmit(onSubmit)} data-testid="form-partner">
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Kode Mitra <Text type="danger">*</Text>
              </label>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: SUP-INK-01"
                    style={{ textTransform: 'uppercase' }}
                    disabled={Boolean(editingPartner)}
                    data-testid="input-partner-code"
                  />
                )}
              />
              {errors.code && <Text type="danger" style={{ fontSize: 12 }}>{errors.code.message}</Text>}
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Mitra / Perusahaan <Text type="danger">*</Text>
              </label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input {...field} placeholder="Masukkan nama mitra" data-testid="input-partner-name" />
                )}
              />
              {errors.name && <Text type="danger" style={{ fontSize: 12 }}>{errors.name.message}</Text>}
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Tipe Mitra <Text type="danger">*</Text>
              </label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'supplier', label: 'Pemasok / Vendor (Supplier)' },
                      { value: 'customer', label: 'Pelanggan / Pemesan (Customer)' },
                      { value: 'internal_unit', label: 'Unit / Departemen Internal' },
                    ]}
                    data-testid="select-partner-type"
                  />
                )}
              />
              {errors.type && <Text type="danger" style={{ fontSize: 12 }}>{errors.type.message}</Text>}
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Nama Kontak (Pic)</label>
              <Controller
                name="contactPerson"
                control={control}
                render={({ field }) => (
                  <Input {...field} value={field.value || ''} placeholder="Contoh: Bpk. Hendra" data-testid="input-partner-cp" />
                )}
              />
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>No. Telepon</label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <Input {...field} value={field.value || ''} placeholder="Contoh: 021-4601234" data-testid="input-partner-phone" />
                )}
              />
            </Col>

            <Col xs={24} md={12}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Alamat Email</label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <Input {...field} value={field.value || ''} placeholder="sales@perusahaan.co.id" data-testid="input-partner-email" />
                )}
              />
              {errors.email && <Text type="danger" style={{ fontSize: 12 }}>{errors.email.message}</Text>}
            </Col>

            <Col xs={24}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Alamat Lengkap</label>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <Input.TextArea {...field} value={field.value || ''} rows={3} placeholder="Alamat pabrik / kantor pusat" data-testid="input-partner-address" />
                )}
              />
            </Col>

            <Col xs={24}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Status Aktif</label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch checked={field.value} onChange={(val) => field.onChange(val)} data-testid="switch-partner-active" />
                    <span>{field.value ? 'Aktif' : 'Nonaktif'}</span>
                  </Space>
                )}
              />
            </Col>
          </Row>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space>
              <Button onClick={onClose}>Batal</Button>
              <Button type="primary" htmlType="submit" data-testid="btn-submit-partner">
                {editingPartner ? 'Simpan Perubahan' : 'Tambah Mitra'}
              </Button>
            </Space>
          </div>
        </Space>
      </form>
    </Modal>
  );
};
