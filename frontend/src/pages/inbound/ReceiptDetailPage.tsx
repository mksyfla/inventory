import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Table,
  Steps,
  Alert,
  Tooltip,
  Popconfirm,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  CheckOutlined,
  CloseOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  LockOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { GoodsReceiptNote, DocStatus, getDocStatusTagColor, MOCK_GRN_LIST } from '../../types/inbound';
import { useAuthStore } from '../../store/useAuthStore';
import { RejectReasonModal } from '../../components/inbound/RejectReasonModal';
import { ReceiptAttachmentTab } from '../../components/inbound/ReceiptAttachmentTab';

const { Title, Paragraph, Text } = Typography;

export const ReceiptDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);

  // Find GRN or fallback to mock
  const existingGrn = MOCK_GRN_LIST.find((g) => g.id === Number(id)) || MOCK_GRN_LIST[0];
  const [grn, setGrn] = useState<GoodsReceiptNote>(existingGrn);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);

  // Maker-Checker Safeguard rule (BR-05)
  const isMaker = Boolean(user && grn.createdByName.toLowerCase().includes(user.fullName.toLowerCase()));

  const handleStateTransition = (nextStatus: DocStatus, actionLabel: string) => {
    setGrn((prev) => ({ ...prev, status: nextStatus }));
    notification.success({
      message: `Status Dokumen Diperbarui`,
      description: `Dokumen ${grn.documentNo} telah berhasil diubah menjadi '${actionLabel}'.`,
    });
  };

  const handleRejectSubmit = (reasonCode: string, notes?: string) => {
    setGrn((prev) => ({
      ...prev,
      status: 'draft',
      notes: notes ? `[Alasan Penolakan ${reasonCode}]: ${notes}` : `[Alasan Penolakan]: ${reasonCode}`,
    }));
    setRejectModalOpen(false);
    notification.warning({
      message: 'Dokumen Dikembalikan ke Draft',
      description: `Dokumen ${grn.documentNo} telah ditolak dengan kategori '${reasonCode}' dan dikembalikan untuk revisi.`,
    });
  };

  const getStepCurrentIndex = (status: DocStatus) => {
    switch (status) {
      case 'draft':
        return 0;
      case 'submitted':
        return 1;
      case 'approved':
        return 2;
      case 'in_progress':
        return 3;
      case 'completed':
        return 4;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  };

  const columns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Satuan',
      dataIndex: 'uom',
      key: 'uom',
      width: 90,
      render: (uom: string) => <Tag color="blue">{uom}</Tag>,
    },
    {
      title: 'Qty PO / Expected',
      dataIndex: 'qtyExpected',
      key: 'qtyExpected',
      width: 130,
      render: (qty: number) => <Text>{qty}</Text>,
    },
    {
      title: 'Qty Diterima (Physical)',
      dataIndex: 'qtyReceived',
      key: 'qtyReceived',
      width: 140,
      render: (qty: number) => <Text type="success" strong>{qty}</Text>,
    },
    {
      title: 'Qty Ditolak (QC Reject)',
      dataIndex: 'qtyRejected',
      key: 'qtyRejected',
      width: 140,
      render: (qty: number) =>
        qty > 0 ? <Text type="danger" strong>{qty}</Text> : <Text type="secondary">0</Text>,
    },
    {
      title: 'No. Batch / Lot',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 140,
      render: (batch?: string) => batch ? <Text code>{batch}</Text> : '-',
    },
    {
      title: 'Target Lokasi Storage Bin',
      dataIndex: 'targetLocationCode',
      key: 'targetLocationCode',
      width: 180,
      render: (loc?: string) =>
        loc ? (
          <Space>
            <EnvironmentOutlined style={{ color: '#36b37e' }} />
            <Text strong>{loc}</Text>
          </Space>
        ) : (
          <Text type="secondary">Belum Ditentukan</Text>
        ),
    },
  ];

  const statusTag = getDocStatusTagColor(grn.status);
  const isLocked = grn.status === 'completed' || grn.status === 'cancelled';

  return (
    <div data-testid="receipt-detail-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inbound/receipts')} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Dokumen Penerimaan: {grn.documentNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                  {isLocked && (
                    <Tag icon={<LockOutlined />} color="red">
                      Terkunci (Locked)
                    </Tag>
                  )}
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Referensi PO: {grn.poReference} | Pemasok: {grn.supplierName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {/* State Machine Action Buttons */}
          <Col>
            <Space>
              {grn.status === 'draft' && (
                <>
                  <Popconfirm
                    title="Batalkan Dokumen Penerimaan?"
                    onConfirm={() => handleStateTransition('cancelled', 'Dibatalkan')}
                    okText="Ya, Batalkan"
                    cancelText="Tidak"
                    data-testid="popconfirm-cancel-grn"
                  >
                    <Button danger icon={<CloseOutlined />} data-testid="btn-action-cancel">
                      Batalkan Dokumen
                    </Button>
                  </Popconfirm>

                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleStateTransition('submitted', 'Diajukan')}
                    data-testid="btn-action-submit"
                  >
                    Ajukan Dokumen (Submit)
                  </Button>
                </>
              )}

              {grn.status === 'submitted' && (
                <>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => setRejectModalOpen(true)}
                    data-testid="btn-action-reject"
                  >
                    Tolak / Revisi (Reject)
                  </Button>

                  <Tooltip
                    title={
                      isMaker
                        ? 'Pembuat dokumen tidak boleh menyetujui dokumennya sendiri (Prinsip Segregasi Tugas Maker-Checker BR-05)'
                        : 'Setujui Dokumen GRN'
                    }
                  >
                    <span>
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        disabled={isMaker}
                        onClick={() => handleStateTransition('approved', 'Disetujui')}
                        data-testid="btn-action-approve"
                      >
                        Setujui GRN (Approve)
                      </Button>
                    </span>
                  </Tooltip>
                </>
              )}

              {grn.status === 'approved' && (
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  onClick={() => handleStateTransition('in_progress', 'Sedang Putaway')}
                  data-testid="btn-action-start-putaway"
                >
                  Mulai Alur Putaway (In Progress)
                </Button>
              )}

              {grn.status === 'in_progress' && (
                <Button
                  type="primary"
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleStateTransition('completed', 'Selesai')}
                  data-testid="btn-action-complete"
                >
                  Selesaikan Penerimaan (Complete)
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* Maker-Checker Safeguard Banner Alert */}
        {grn.status === 'submitted' && isMaker && (
          <Alert
            message="Aturan Segregasi Tugas Maker-Checker (BR-05)"
            description={`Anda tercatat sebagai Pembuat Dokumen (${grn.createdByName}). Berdasarkan aturan kontrol internal BR-05, Anda tidak dapat menyetujui (Approve) dokumen yang Anda buat sendiri.`}
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined style={{ color: '#fa8c16' }} />}
            data-testid="alert-maker-checker"
          />
        )}

        {isLocked && (
          <Alert
            message="Dokumen Penerimaan Terkunci (Locked Document)"
            description="Dokumen ini telah berstatus Selesai (Completed) atau Dibatalkan. Seluruh data baris barang dan mutasi stok telah dibukukan dan tidak dapat diubah lagi."
            type="warning"
            showIcon
            icon={<LockOutlined />}
          />
        )}

        {/* Workflow Progress Steps */}
        <Card variant="borderless">
          <Steps
            current={getStepCurrentIndex(grn.status)}
            status={grn.status === 'cancelled' ? 'error' : 'process'}
            items={[
              { title: 'Draft', description: 'Entry Data GRN' },
              { title: 'Diajukan', description: 'Verifikasi Dokumen' },
              { title: 'Disetujui', description: 'Inspeksi QC & Pembongkaran' },
              { title: 'Sedang Putaway', description: 'Penempatan ke Rak Bin' },
              { title: 'Selesai', description: 'Stok Resmi Dibukukan' },
            ]}
          />
        </Card>

        {/* Document Header Metadata */}
        <Card variant="borderless" title="Informasi Penerimaan & Metadata Dokumen">
          <Row gutter={[24, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Pemasok (Supplier)</Text>
              <Text strong>{grn.supplierName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Referensi Purchase Order (PO)</Text>
              <Text code strong>{grn.poReference}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Tujuan Penerimaan</Text>
              <Text strong>{grn.warehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Tanggal Penerimaan Fisik</Text>
              <Text strong>{grn.receiptDate}</Text>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Dibuat Oleh</Text>
              <Text>{grn.createdByName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Waktu Pembuatan</Text>
              <Text>{new Date(grn.createdAt).toLocaleString('id-ID')}</Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Catatan Tambahan Penerimaan</Text>
              <Text>{grn.notes || '-'}</Text>
            </Col>
          </Row>
        </Card>

        {/* Items Line Table */}
        <Card variant="borderless" title="Rincian Baris Barang (Received Item Lines)">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={grn.items}
            pagination={false}
            data-testid="table-grn-items"
          />
        </Card>

        {/* Upload & Attachments Tab */}
        <ReceiptAttachmentTab receiptId={grn.id} isLocked={isLocked} />
      </Space>

      {/* Reject Reason Modal */}
      <RejectReasonModal
        open={rejectModalOpen}
        documentNo={grn.documentNo}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={handleRejectSubmit}
      />
    </div>
  );
};
