import React, { useState } from 'react';
import {
  Card,
  Upload,
  Button,
  Select,
  Space,
  Tag,
  Typography,
  Table,
  Row,
  Col,
  Popconfirm,
  notification,
  Empty,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { receiptService } from '../../api/services/receipts';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { AddAttachmentRequestDTO, AttachmentCategory, AttachmentDTO } from '../../api/dto';

const { Text } = Typography;

export interface ReceiptAttachmentTabProps {
  receiptId: number;
  isLocked?: boolean;
}

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  delivery_note: 'Surat Jalan (Delivery Note / DO Supplier)',
  qc_inspection: 'BAP Hasil Inspeksi QC Lab',
  truck_photo: 'Foto Fisik Pembongkaran / Kondisi Truk',
  other: 'Dokumen Pendukung Lainnya',
};

// The backend stores a metadata row per lampiran and expects the binary to be
// uploaded separately; we keep a deterministic file_url so the row is usable
// even before a file store/CDN is wired up.
const attachmentFileUrl = (receiptId: number, fileName: string) =>
  `/uploads/grn/${receiptId}/${encodeURIComponent(fileName)}`;

const getAttachmentTypeTag = (type: AttachmentCategory) => {
  switch (type) {
    case 'delivery_note':
      return <Tag color="blue">Surat Jalan (Delivery Note)</Tag>;
    case 'qc_inspection':
      return <Tag color="green">BAP Inspeksi QC Lab</Tag>;
    case 'truck_photo':
      return <Tag color="purple">Foto Fisik Pembongkaran Truk</Tag>;
    case 'other':
    default:
      return <Tag color="default">Dokumen Lainnya</Tag>;
  }
};

const getFileIcon = (fileName: string) => {
  if (fileName.toLowerCase().endsWith('.pdf')) {
    return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
  }
  return <FileImageOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
};

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

export const ReceiptAttachmentTab: React.FC<ReceiptAttachmentTabProps> = ({
  receiptId,
  isLocked = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>('delivery_note');

  const attachmentKey = ['receipt-attachments', receiptId] as const;

  const { data: attachments = [], isLoading } = useQuery<AttachmentDTO[]>({
    queryKey: attachmentKey,
    queryFn: () => receiptService.listAttachments(receiptId),
    enabled: receiptId > 0,
  });

  const addMutation = useMutationWithToast({
    mutationFn: (payload: AddAttachmentRequestDTO) =>
      receiptService.createAttachment(receiptId, payload),
    successTitle: 'Lampiran Berhasil Diunggah',
    successMessage: 'Lampiran telah dicatat pada dokumen GRN.',
    invalidateKeys: [attachmentKey],
  });

  const deleteMutation = useMutationWithToast({
    mutationFn: (attachmentId: number) => receiptService.deleteAttachment(receiptId, attachmentId),
    successTitle: 'Lampiran Berhasil Dihapus',
    successMessage: 'Lampiran telah dihapus dari dokumen GRN.',
    invalidateKeys: [attachmentKey],
  });

  const handleBeforeUpload = (file: File) => {
    // Validate file type
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileNameLower = file.name.toLowerCase();
    const isExtensionValid = validExtensions.some((ext) => fileNameLower.endsWith(ext));

    if (!isExtensionValid) {
      notification.error({
        message: 'Format Berkas Tidak Sesuai',
        description: 'Hanya berkas format .PDF, .JPG, .JPEG, dan .PNG yang diperbolehkan.',
      });
      return false;
    }

    // Validate file size (Max 10 MB = 10 * 1024 * 1024 bytes)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      notification.error({
        message: 'Ukuran Berkas Melebihi Batas (Maks. 10 MB)',
        description: `Ukuran berkas ${file.name} adalah ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
      });
      return false;
    }

    // Persist a metadata row to the backend (file_url is a deterministic path).
    addMutation.mutate({
      category: selectedCategory,
      file_name: file.name,
      file_size_bytes: file.size,
      file_url: attachmentFileUrl(receiptId, file.name),
    });

    return false; // Prevent auto upload behavior
  };

  const handleDeleteAttachment = (id: number) => {
    deleteMutation.mutate(id);
  };

  const columns = [
    {
      title: 'Tipe Dokumen Lampiran',
      dataIndex: 'category',
      key: 'category',
      width: 220,
      render: (type: AttachmentCategory) => getAttachmentTypeTag(type),
    },
    {
      title: 'Nama Berkas Fizik',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (name: string) => (
        <Space>
          {getFileIcon(name)}
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Ukuran',
      dataIndex: 'file_size_bytes',
      key: 'file_size_bytes',
      width: 110,
      render: (bytes: number) => formatSize(bytes),
    },
    {
      title: 'Pengunggah & Waktu',
      key: 'uploaded',
      width: 220,
      render: (_: unknown, record: AttachmentDTO) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>Pengguna #{record.uploaded_by}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(record.created_at).toLocaleString('id-ID')}
          </Text>
        </div>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 100,
      render: (_: unknown, record: AttachmentDTO) => (
        <Space size={4}>
          <Button
            type="text"
            icon={<DownloadOutlined style={{ color: '#0052cc' }} />}
            onClick={() => {
              notification.info({ message: `Mengunduh berkas: ${record.file_name}` });
            }}
            data-testid={`btn-download-att-${record.id}`}
          />
          {!isLocked && (
            <Popconfirm
              title="Hapus Lampiran Dokumen Ini?"
              onConfirm={() => handleDeleteAttachment(record.id)}
              okText="Hapus"
              cancelText="Batal"
              data-testid={`popconfirm-del-att-${record.id}`}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                loading={deleteMutation.isPending && deleteMutation.variables === record.id}
                data-testid={`btn-delete-att-${record.id}`}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="receipt-attachment-tab">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Upload Section (Disabled if Locked) */}
        {!isLocked && (
          <Card variant="borderless" style={{ background: '#fafafa' }}>
            <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 12 }}>
              <Col xs={24} md={12}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Pilih Kategori Dokumen Lampiran <Text type="danger">*</Text>
                </label>
                <Select
                  value={selectedCategory}
                  onChange={(val) => setSelectedCategory(val)}
                  style={{ width: '100%' }}
                  options={(Object.keys(CATEGORY_LABELS) as AttachmentCategory[]).map((value) => ({
                    value,
                    label: CATEGORY_LABELS[value],
                  }))}
                  data-testid="select-attachment-category"
                />
              </Col>
            </Row>

            <Upload.Dragger
              name="file"
              multiple={false}
              beforeUpload={handleBeforeUpload}
              showUploadList={false}
              accept=".pdf,.jpg,.jpeg,.png"
              data-testid="upload-attachment-dragger"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#0052cc', fontSize: 36 }} />
              </p>
              <p className="ant-upload-text">Klik atau seret berkas Surat Jalan / BAP QC ke area ini</p>
              <p className="ant-upload-hint">Format yang didukung: .PDF, .JPG, .PNG (Maksimal 10 MB per berkas)</p>
            </Upload.Dragger>
          </Card>
        )}

        {/* Table List of Attachments */}
        <Card
          variant="borderless"
          title={
            <Space>
              <PaperClipOutlined style={{ color: '#0052cc' }} />
              <span>Daftar Dokumen Lampiran Terunggah ({attachments.length} Berkas)</span>
            </Space>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={attachments}
            loading={isLoading}
            pagination={false}
            locale={{ emptyText: <Empty description="Belum ada lampiran terunggah." /> }}
            data-testid="table-attachments"
          />
        </Card>
      </Space>
    </div>
  );
};
