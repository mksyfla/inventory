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
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { AttachmentType, ReceiptAttachment, MOCK_ATTACHMENTS } from '../../types/inbound';

const { Text } = Typography;

export interface ReceiptAttachmentTabProps {
  receiptId: number;
  isLocked?: boolean;
}

export const ReceiptAttachmentTab: React.FC<ReceiptAttachmentTabProps> = ({
  receiptId,
  isLocked = false,
}) => {
  const [attachments, setAttachments] = useState<ReceiptAttachment[]>(() =>
    MOCK_ATTACHMENTS.filter((a) => a.receiptId === receiptId)
  );

  const [selectedCategory, setSelectedCategory] = useState<AttachmentType>('delivery_note');

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

    // Simulate upload success
    const newAttachment: ReceiptAttachment = {
      id: Date.now(),
      receiptId,
      fileName: file.name,
      fileType: selectedCategory,
      fileSizeKb: Math.round(file.size / 1024),
      fileUrl: '#',
      uploadedByName: 'Budi Santoso (Admin Gudang)',
      uploadedAt: new Date().toISOString(),
    };

    setAttachments((prev) => [newAttachment, ...prev]);
    notification.success({
      message: 'Lampiran Berhasil Diunggah',
      description: `Berkas ${file.name} telah dilampirkan pada dokumen GRN.`,
    });

    return false; // Prevent auto upload behavior
  };

  const handleDeleteAttachment = (id: number) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
    notification.success({ message: 'Lampiran Berhasil Dihapus' });
  };

  const getAttachmentTypeTag = (type: AttachmentType) => {
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

  const columns = [
    {
      title: 'Tipe Dokumen Lampiran',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 220,
      render: (type: AttachmentType) => getAttachmentTypeTag(type),
    },
    {
      title: 'Nama Berkas Fizik',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (name: string) => (
        <Space>
          {getFileIcon(name)}
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Ukuran',
      dataIndex: 'fileSizeKb',
      key: 'fileSizeKb',
      width: 110,
      render: (kb: number) =>
        kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb} KB`,
    },
    {
      title: 'Pengunggah & Waktu',
      key: 'uploaded',
      width: 220,
      render: (_: any, record: ReceiptAttachment) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>{record.uploadedByName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(record.uploadedAt).toLocaleString('id-ID')}
          </Text>
        </div>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 100,
      render: (_: any, record: ReceiptAttachment) => (
        <Space size={4}>
          <Button
            type="text"
            icon={<DownloadOutlined style={{ color: '#0052cc' }} />}
            onClick={() => {
              notification.info({ message: `Mengunduh berkas: ${record.fileName}` });
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
                  options={[
                    { value: 'delivery_note', label: 'Surat Jalan (Delivery Note / DO Supplier)' },
                    { value: 'qc_inspection', label: 'BAP Hasil Inspeksi QC Lab' },
                    { value: 'truck_photo', label: 'Foto Fisik Pembongkaran / Kondisi Truk' },
                    { value: 'other', label: 'Dokumen Pendukung Lainnya' },
                  ]}
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
            pagination={false}
            data-testid="table-attachments"
          />
        </Card>
      </Space>
    </div>
  );
};
