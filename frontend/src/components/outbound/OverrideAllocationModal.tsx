import React from 'react';
import { Modal, Input, Select, Space, Typography, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const { Text } = Typography;

export const overrideAllocationSchema = z
  .object({
    alternativeBatchNo: z.string().min(1, 'Pilih atau ketik Nomor Batch alternatif'),
    alternativeLocationCode: z.string().min(1, 'Ketik Kode Bin Lokasi alternatif'),
    reasonCode: z.enum(
      [
        'physical_damage',
        'near_expiry_customer_reject',
        'quality_hold',
        'other',
      ],
      { required_error: 'Pilih alasan override alokasi FEFO' }
    ),
    notes: z.string().min(5, 'Catatan justifikasi wajib diisi minimal 5 karakter'),
  });

export type OverrideAllocationFormValues = z.infer<typeof overrideAllocationSchema>;

export interface OverrideAllocationModalProps {
  open: boolean;
  itemSku: string;
  itemName: string;
  currentBatchNo: string;
  onClose: () => void;
  onSubmit: (values: OverrideAllocationFormValues) => void;
}

export const OverrideAllocationModal: React.FC<OverrideAllocationModalProps> = ({
  open,
  itemSku,
  itemName,
  currentBatchNo,
  onClose,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OverrideAllocationFormValues>({
    resolver: zodResolver(overrideAllocationSchema),
    defaultValues: {
      alternativeBatchNo: 'LOT-ALT-2026-888',
      alternativeLocationCode: 'JKT01-Z1-R02-B05',
      reasonCode: 'physical_damage',
      notes: '',
    },
  });

  const handleFormSubmit = (values: OverrideAllocationFormValues) => {
    onSubmit(values);
    reset();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <WarningOutlined style={{ color: '#fa8c16' }} />
          <span>Manual Override Alokasi Stok FEFO/FIFO</span>
        </Space>
      }
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      destroyOnHidden
      width={520}
      data-testid="modal-override-allocation"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="form-override-allocation">
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
          <div style={{ background: '#fffbe6', padding: 12, borderRadius: 6, border: '1px solid #ffe58f' }}>
            <Text style={{ fontSize: 13, display: 'block' }}>
              <strong>SKU Targeted:</strong> {itemSku} - {itemName}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Alokasi Rekomendasi FEFO Sistem: Batch <Text code>{currentBatchNo}</Text>
            </Text>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Nomor Batch Alternatif <Text type="danger">*</Text>
            </label>
            <Controller
              name="alternativeBatchNo"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder="Contoh: LOT-ALT-2026-888"
                  data-testid="input-alt-batch"
                />
              )}
            />
            {errors.alternativeBatchNo && (
              <Text type="danger" style={{ fontSize: 12 }}>{errors.alternativeBatchNo.message}</Text>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Kode Bin Lokasi Alternatif <Text type="danger">*</Text>
            </label>
            <Controller
              name="alternativeLocationCode"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder="Contoh: JKT01-Z1-R02-B05"
                  data-testid="input-alt-location"
                />
              )}
            />
            {errors.alternativeLocationCode && (
              <Text type="danger" style={{ fontSize: 12 }}>{errors.alternativeLocationCode.message}</Text>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Alasan Override Rekomendasi FEFO <Text type="danger">*</Text>
            </label>
            <Controller
              name="reasonCode"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'physical_damage', label: 'Barang Rusak Fisik di Kemasan Rak' },
                    { value: 'near_expiry_customer_reject', label: 'Ditolak Pelanggan Karena Umur Simpan Sisa Kritis' },
                    { value: 'quality_hold', label: 'Batch Terkunci Dalam QC Quarantine' },
                    { value: 'other', label: 'Alasan Operasional Lainnya' },
                  ]}
                  data-testid="select-override-reason"
                />
              )}
            />
            {errors.reasonCode && (
              <Text type="danger" style={{ fontSize: 12 }}>{errors.reasonCode.message}</Text>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Catatan Justifikasi Override <Text type="danger">*</Text>
            </label>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <Input.TextArea
                  {...field}
                  value={field.value || ''}
                  rows={3}
                  placeholder="Jelaskan alasan detail pengabaian rekomendasi FEFO sistem (minimal 5 karakter)..."
                  data-testid="input-override-notes"
                />
              )}
            />
            {errors.notes && (
              <Text type="danger" style={{ fontSize: 12 }}>{errors.notes.message}</Text>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space>
              <Button onClick={onClose}>Batal</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting}
                data-testid="btn-submit-override-allocation"
              >
                Simpan Override Alokasi
              </Button>
            </Space>
          </div>
        </Space>
      </form>
    </Modal>
  );
};
