import React, { useState } from 'react';
import {
  Modal,
  Input,
  DatePicker,
  Button,
  Space,
  Typography,
  Upload,
  Alert,
  Tag,
  Row,
  Col,
  notification,
} from 'antd';
import {
  CheckCircleOutlined,
  CameraOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { PODData } from '../../types/outbound';

const { Text } = Typography;

export interface PODUploadModalProps {
  open: boolean;
  doNo: string;
  onClose: () => void;
  onSubmitPOD: (podData: PODData) => void;
}

export const PODUploadModal: React.FC<PODUploadModalProps> = ({
  open,
  doNo,
  onClose,
  onSubmitPOD,
}) => {
  const [receivedBy, setReceivedBy] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>(dayjs().format('YYYY-MM-DD HH:mm:ss'));
  const [signatureText] = useState<string>('digital-sig-signed-by-receiver');
  const [fileList, setFileList] = useState<any[]>([]);
  const [notes, setNotes] = useState<string>('');

  const handleFormSubmit = () => {
    if (!receivedBy.trim()) {
      notification.error({
        message: 'Nama Penerima Wajib Diisi',
        description: 'Masukkan nama lengkap pejabat / perwakilan penerima barang.',
      });
      return;
    }

    const podData: PODData = {
      receivedBy,
      receivedAt,
      signatureDataUrl: signatureText,
      photoUrl: fileList[0]?.name || 'bukti-serah-terima-pod.png',
      notes: notes || undefined,
    };

    onSubmitPOD(podData);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>Upload Bukti Serah Terima (POD - Proof of Delivery) Digital ({doNo})</span>
        </Space>
      }
      footer={null}
      destroyOnHidden
      width={560}
      data-testid="modal-pod-upload"
    >
      <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
        <Alert
          message="Konfirmasi Penerimaan Barang Digital (FE-306)"
          description="Kurir / Staf dapat mengambil bukti penerimaan barang berupa nama penerima, tanda tangan digital, dan foto fisik Surat Jalan ter-ttd."
          type="info"
          showIcon
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Nama Penerima Aktual <Text type="danger">*</Text>
            </label>
            <Input
              placeholder="Contoh: Ahmad Subagyo"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              data-testid="input-pod-received-by"
            />
          </Col>

          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Waktu Diterima <Text type="danger">*</Text>
            </label>
            <DatePicker
              showTime
              value={receivedAt ? dayjs(receivedAt) : null}
              onChange={(date) => setReceivedAt(date ? date.format('YYYY-MM-DD HH:mm:ss') : '')}
              style={{ width: '100%' }}
              data-testid="datepicker-pod-received-at"
            />
          </Col>
        </Row>

        {/* Digital Signature Canvas Simulation */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
            Tanda Tangan Digital Penerima (Touch Canvas / Pad)
          </label>
          <div
            style={{
              border: '2px dashed #0052cc',
              borderRadius: 8,
              height: 120,
              background: '#f0f5ff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
            data-testid="canvas-signature-pad"
          >
            <EditOutlined style={{ fontSize: 24, color: '#0052cc', marginBottom: 6 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Area Usap Tanda Tangan Layar Sentuh / Digital Signature Pad
            </Text>
            <Tag color="blue" style={{ marginTop: 4 }}>Tanda Tangan Terverifikasi</Tag>
          </div>
        </div>

        {/* Upload Photo Proof */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
            Upload Foto Bukti Serah Terima / Dokumen Ter-ttd
          </label>
          <Upload.Dragger
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList }) => setFileList(fileList)}
            accept=".pdf,.jpg,.jpeg,.png"
            maxCount={1}
            data-testid="dragger-pod-photo"
          >
            <p className="ant-upload-drag-icon">
              <CameraOutlined style={{ fontSize: 28, color: '#0052cc' }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 13 }}>
              Klik atau Seret foto Surat Jalan fisik yang disetujui / foto barang di lokasi
            </p>
          </Upload.Dragger>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Catatan Tambahan Penerima</label>
          <Input.TextArea
            rows={2}
            placeholder="Contoh: Barang diterima lengkap dalam kondisi bersegel"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-pod-notes"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Space>
            <Button onClick={onClose}>Batal</Button>
            <Button
              type="primary"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              icon={<CheckCircleOutlined />}
              onClick={handleFormSubmit}
              data-testid="btn-submit-pod"
            >
              Simpan Bukti POD & Selesaikan DO
            </Button>
          </Space>
        </div>
      </Space>
    </Modal>
  );
};
