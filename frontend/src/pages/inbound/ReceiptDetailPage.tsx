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
  Empty,
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
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GoodsReceiptNote,
  DocStatus,
  ReceiptItemLine,
  getDocStatusTagColor,
} from '../../types/inbound';
import { useAuthStore } from '../../store/useAuthStore';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { receiptService } from '../../api/services/receipts';
import { documentService } from '../../api/services/documents';
import { mapDocumentToGoodsReceiptNote } from '../../api/mappers';
import { DocumentDetailDTO } from '../../api/dto';
import { RejectReasonModal } from '../../components/inbound/RejectReasonModal';
import { ReceiptAttachmentTab } from '../../components/inbound/ReceiptAttachmentTab';

const { Title, Paragraph, Text } = Typography;

export const ReceiptDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);

  const queryClient = useQueryClient();
  const stateDoc = (location.state as { doc?: DocumentDetailDTO })?.doc;
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);

  // Live detail from the shared document store (GET /documents/:id, doc_type GRN).
  const { data: doc } = useQuery<DocumentDetailDTO | undefined>({
    queryKey: ['receipt', Number(id)],
    queryFn: () => documentService.getDetail(Number(id)),
    enabled: Boolean(id),
    initialData: stateDoc,
  });

  const grn: GoodsReceiptNote | null = doc ? mapDocumentToGoodsReceiptNote(doc, doc.lines) : null;

  // Maker-Checker Safeguard rule (BR-05): creator cannot approve their own document.
  const isMaker = Boolean(user && doc && user.id === doc.created_by);

  const submitMutation = useMutationWithToast({
    mutationFn: async () => {
      const res = await receiptService.submitReceipt(Number(id));
      return res.status;
    },
    successTitle: 'Dokumen Berhasil Diajukan',
    successMessage: 'Dokumen GRN telah diajukan untuk persetujuan.',
    onSuccess: (status) => {
      queryClient.setQueryData<DocumentDetailDTO>(['receipt', Number(id)], (old) =>
        old ? { ...old, status: status as DocStatus } : old
      );
    },
  });

  const approveMutation = useMutationWithToast({
    mutationFn: async () => {
      const res = await receiptService.approveReceipt(Number(id));
      return res.status;
    },
    successTitle: 'Dokumen Berhasil Disetujui',
    successMessage: 'Dokumen GRN telah disetujui dan stok diposting ke staging.',
    onSuccess: (status) => {
      queryClient.setQueryData<DocumentDetailDTO>(['receipt', Number(id)], (old) =>
        old ? { ...old, status: status as DocStatus } : old
      );
    },
  });

  const handleStateTransition = (action: 'submit' | 'approve') => {
    if (action === 'submit') {
      submitMutation.mutate(undefined as any);
    } else {
      approveMutation.mutate(undefined as any);
    }
  };

  const handleRejectSubmit = (reasonCode: string, notes?: string) => {
    setRejectModalOpen(false);
    queryClient.setQueryData<DocumentDetailDTO>(['receipt', Number(id)], (old) =>
      old
        ? {
            ...old,
            status: 'draft',
            notes: notes
              ? `[Alasan Penolakan ${reasonCode}]: ${notes}`
              : `[Alasan Penolakan]: ${reasonCode}`,
          }
        : old
    );
  };

  if (!grn) {
    return (
      <div data-testid="receipt-detail-page">
        <Empty
          description="Detail dokumen tidak dapat dimuat. Periksa koneksi atau dokumen mungkin sudah dihapus."
          style={{ padding: 48 }}
        />
        <div style={{ textAlign: 'center' }}>
          <Button type="primary" onClick={() => navigate('/inbound/receipts')}>
            Kembali ke Daftar GRN
          </Button>
        </div>
      </div>
    );
  }

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
      key: 'sku',
      width: 150,
      render: (_: any, record: ReceiptItemLine) => (
        <Text strong style={{ color: '#0052cc' }}>{record.sku}</Text>
      ),
    },
    {
      title: 'Nama Barang',
      key: 'itemName',
      render: (_: any, record: ReceiptItemLine) => <Text strong>{record.itemName}</Text>,
    },
    {
      title: 'Satuan',
      key: 'uom',
      width: 90,
      render: (_: any, record: ReceiptItemLine) => <Tag color="blue">{record.uom || '-'}</Tag>,
    },
    {
      title: 'Qty Request',
      key: 'qtyRequest',
      width: 130,
      render: (_: any, record: ReceiptItemLine) => <Text>{record.qtyExpected}</Text>,
    },
    {
      title: 'Qty Processed',
      key: 'qtyProcessed',
      width: 130,
      render: (_: any, record: ReceiptItemLine) => (
        <Text type="success" strong>{record.qtyReceived}</Text>
      ),
    },
    {
      title: 'Status Line',
      key: 'status',
      width: 140,
      render: (_: any, record: ReceiptItemLine) => (
        <Tag>{record.qtyRejected > 0 ? 'damaged' : 'available'}</Tag>
      ),
    },
    {
      title: 'Target Lokasi Storage Bin',
      key: 'location',
      width: 180,
      render: (_: any, record: ReceiptItemLine) => {
        const loc = record.targetLocationCode;
        return loc ? (
          <Space>
            <EnvironmentOutlined style={{ color: '#36b37e' }} />
            <Text strong>{loc}</Text>
          </Space>
        ) : (
          <Text type="secondary">Belum Ditentukan</Text>
        );
      },
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
                  Referensi PO: {grn.poReference || '-'} | Pemasok: {grn.supplierName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {/* State Machine Action Buttons */}
          <Col>
            <Space>
              {grn.status === 'draft' && (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => handleStateTransition('submit')}
                  loading={submitMutation.isPending}
                  data-testid="btn-action-submit"
                >
                  Ajukan Dokumen (Submit)
                </Button>
              )}

              {grn.status === 'submitted' && (
                <>
                  <Button danger icon={<CloseOutlined />} onClick={() => setRejectModalOpen(true)} data-testid="btn-action-reject">
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
                        loading={approveMutation.isPending}
                        onClick={() => handleStateTransition('approve')}
                        data-testid="btn-action-approve"
                      >
                        Setujui GRN (Approve)
                      </Button>
                    </span>
                  </Tooltip>
                </>
              )}

              {(grn.status === 'approved' || grn.status === 'in_progress') && (
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  onClick={() => navigate(`/inbound/receipts/${grn.id}/putaway`)}
                  data-testid="btn-action-start-putaway"
                >
                  Mulai Alur Putaway
                </Button>
              )}

              {grn.status === 'completed' && (
                <Button
                  type="primary"
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  icon={<CheckCircleOutlined />}
                  disabled
                  data-testid="btn-action-complete"
                >
                  Selesai (Completed)
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* Maker-Checker Safeguard Banner Alert */}
        {grn.status === 'submitted' && isMaker && (
          <Alert
            message="Aturan Segregasi Tugas Maker-Checker (BR-05)"
            description={`Anda tercatat sebagai Pembuat Dokumen. Berdasarkan aturan kontrol internal BR-05, Anda tidak dapat menyetujui (Approve) dokumen yang Anda buat sendiri.`}
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined style={{ color: '#fa8c16' }} />}
            data-testid="alert-maker-checker"
          />
        )}

        {isLocked && (
          <Alert
            message="Dokumen Penerimaan Terkunci (Locked Document)"
            description="Dokumen ini telah berstatus Selesai (Completed) atau Dibatalkan."
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
              <Text code strong>{grn.poReference || '-'}</Text>
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

        {/* Attachment (Lampiran) — surat jalan / BAP QC / foto truk */}
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
