import React from 'react';
import { Modal, Input, Select, Space, Typography, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const { Text } = Typography;

export const rejectRequestSchema = z
  .object({
    reasonCode: z.enum(
      [
        'insufficient_stock',
        'invalid_department',
        'duplicate_request',
        'unauthorized_item',
        'other',
      ],
      { required_error: 'Pilih alasan penolakan permintaan' }
    ),
    notes: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.reasonCode === 'other') {
      if (!data.notes || data.notes.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['notes'],
          message: 'Catatan wajib diisi minimal 5 karakter jika memilih alasan Lainnya',
        });
      }
    }
  });

export type RejectRequestFormValues = z.infer<typeof rejectRequestSchema>;

export interface RejectRequestModalProps {
  open: boolean;
  requestNo: string;
  onClose: () => void;
  onSubmit: (reasonCode: string, notes?: string) => void;
}

export const RejectRequestModal: React.FC<RejectRequestModalProps> = ({
  open,
  requestNo,
  onClose,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RejectRequestFormValues>({
    resolver: zodResolver(rejectRequestSchema),
    defaultValues: {
      reasonCode: 'insufficient_stock',
      notes: '',
    },
  });

  const selectedReasonCode = watch('reasonCode');

  const handleFormSubmit = (values: RejectRequestFormValues) => {
    onSubmit(values.reasonCode, values.notes || undefined);
    reset();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>Penolakan Permintaan Barang: {requestNo}</span>
        </Space>
      }
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      destroyOnHidden
      width={500}
      data-testid="modal-reject-request"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="form-reject-request">
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Kategori Alasan Penolakan <Text type="danger">*</Text>
            </label>
            <Controller
              name="reasonCode"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'insufficient_stock', label: 'Stok Fisik di Gudang Tidak Mencukupi' },
                    { value: 'invalid_department', label: 'Unit / Divisi Peminta Tidak Valid' },
                    { value: 'duplicate_request', label: 'Permintaan Ganda / Sudah Diajukan Sebelumnya' },
                    { value: 'unauthorized_item', label: 'SKU Barang Tidak Diizinkan untuk Divisi Ini' },
                    { value: 'other', label: 'Alasan Lainnya (Wajib Catatan)' },
                  ]}
                  data-testid="select-reject-reason-code"
                />
              )}
            />
            {errors.reasonCode && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.reasonCode.message}
              </Text>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Catatan Penolakan Tambahan {selectedReasonCode === 'other' && <Text type="danger">*</Text>}
            </label>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <Input.TextArea
                  {...field}
                  value={field.value || ''}
                  rows={3}
                  placeholder="Jelaskan instruksi penyesuaian atau alasan detail penolakan..."
                  data-testid="input-reject-request-notes"
                />
              )}
            />
            {errors.notes && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.notes.message}
              </Text>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space>
              <Button onClick={onClose}>Batal</Button>
              <Button
                type="primary"
                danger
                htmlType="submit"
                loading={isSubmitting}
                data-testid="btn-submit-request-rejection"
              >
                Tolak Permintaan
              </Button>
            </Space>
          </div>
        </Space>
      </form>
    </Modal>
  );
};
