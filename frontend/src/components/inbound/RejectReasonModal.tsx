import React from 'react';
import { Modal, Input, Select, Space, Typography, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const { Text } = Typography;

export const rejectReasonSchema = z
  .object({
    reasonCode: z.enum(
      [
        'damaged_goods',
        'quantity_mismatch',
        'expired_date',
        'wrong_specification',
        'other',
      ],
      { required_error: 'Pilih alasan penolakan dokumen' }
    ),
    notes: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.reasonCode === 'other') {
      if (!data.notes || data.notes.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['notes'],
          message: 'Catatan wajib diisi minimal 5 karakter jika memilih alasan Lain-lain',
        });
      }
    }
  });

export type RejectReasonFormValues = z.infer<typeof rejectReasonSchema>;

export interface RejectReasonModalProps {
  open: boolean;
  documentNo: string;
  onClose: () => void;
  onSubmit: (reasonCode: string, notes?: string) => void;
}

export const RejectReasonModal: React.FC<RejectReasonModalProps> = ({
  open,
  documentNo,
  onClose,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RejectReasonFormValues>({
    resolver: zodResolver(rejectReasonSchema),
    defaultValues: {
      reasonCode: 'damaged_goods',
      notes: '',
    },
  });

  const selectedReasonCode = watch('reasonCode');

  const handleFormSubmit = (values: RejectReasonFormValues) => {
    onSubmit(values.reasonCode, values.notes || undefined);
    reset();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>Penolakan / Revisi Dokumen GRN: {documentNo}</span>
        </Space>
      }
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      destroyOnHidden
      width={500}
      data-testid="modal-reject-reason"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="form-reject-reason">
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
                    { value: 'damaged_goods', label: 'Barang Rusak Fisik / Cacat Kemasan' },
                    { value: 'quantity_mismatch', label: 'Selisih Jumlah Barang Signifikan' },
                    { value: 'expired_date', label: 'Tanggal Kedaluwarsa Terlalu Dekat' },
                    { value: 'wrong_specification', label: 'Spesifikasi Barang Tidak Sesuai PO' },
                    { value: 'other', label: 'Alasan Lainnya (Wajib Catatan)' },
                  ]}
                  data-testid="select-reason-code"
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
                  placeholder="Jelaskan detail temuan fisik atau instruksi revisi ke admin penerimaan..."
                  data-testid="input-reject-notes"
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
                data-testid="btn-submit-rejection"
              >
                Tolak Dokumen
              </Button>
            </Space>
          </div>
        </Space>
      </form>
    </Modal>
  );
};
