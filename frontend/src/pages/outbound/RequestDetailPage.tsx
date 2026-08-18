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
  Popconfirm,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  CheckOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  LockOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ItemRequest,
  RequestStatus,
  getRequestStatusTagColor,
  MOCK_REQUEST_LIST,
} from '../../types/outbound';
import { RejectRequestModal } from '../../components/outbound/RejectRequestModal';

const { Title, Paragraph, Text } = Typography;

export const RequestDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const existingRequest = MOCK_REQUEST_LIST.find((r) => r.id === Number(id)) || MOCK_REQUEST_LIST[0];
  const [request, setRequest] = useState<ItemRequest>(existingRequest);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);

  const handleStateTransition = (nextStatus: RequestStatus, actionLabel: string) => {
    setRequest((prev) => ({ ...prev, status: nextStatus }));
    notification.success({
      message: `Status Permintaan Diperbarui`,
      description: `Permintaan ${request.requestNo} telah berhasil diubah menjadi '${actionLabel}'.`,
    });
  };

  const handleRejectSubmit = (reasonCode: string, notes?: string) => {
    setRequest((prev) => ({
      ...prev,
      status: 'rejected',
      rejectionReason: notes ? `[${reasonCode}]: ${notes}` : `[Kategori Penolakan]: ${reasonCode}`,
    }));
    setRejectModalOpen(false);
    notification.warning({
      message: 'Permintaan Barang Ditolak',
      description: `Permintaan ${request.requestNo} telah ditolak dengan alasan '${reasonCode}'.`,
    });
  };

  const getStepCurrentIndex = (status: RequestStatus) => {
    switch (status) {
      case 'draft':
        return 0;
      case 'submitted':
        return 1;
      case 'approved':
        return 2;
      case 'fulfilled':
        return 3;
      case 'rejected':
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
      title: 'Qty Diminta (Requested)',
      dataIndex: 'qtyRequested',
      key: 'qtyRequested',
      width: 170,
      render: (qty: number) => <Text strong>{qty}</Text>,
    },
    {
      title: 'Qty Disetujui (Approved)',
      dataIndex: 'qtyApproved',
      key: 'qtyApproved',
      width: 170,
      render: (qty: number) =>
        qty > 0 ? <Text type="success" strong>{qty}</Text> : <Text type="secondary">0</Text>,
    },
    {
      title: 'Catatan Per Baris',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes?: string) => notes || '-',
    },
  ];

  const statusTag = getRequestStatusTagColor(request.status);
  const isLocked = request.status === 'fulfilled' || request.status === 'cancelled' || request.status === 'rejected';

  return (
    <div data-testid="request-detail-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/outbound/requests')} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Permintaan Barang: {request.requestNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                  {request.priority === 'urgent' && (
                    <Tag color="red" icon={<AlertOutlined />}>URGENT</Tag>
                  )}
                  {isLocked && (
                    <Tag icon={<LockOutlined />} color="red">
                      Terkunci (Locked)
                    </Tag>
                  )}
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Unit Peminta: {request.requestingUnit} | Gudang Asal: {request.warehouseName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {/* State Machine Action Buttons */}
          <Col>
            <Space>
              {request.status === 'draft' && (
                <>
                  <Popconfirm
                    title="Batalkan Pengajuan Permintaan Ini?"
                    onConfirm={() => handleStateTransition('cancelled', 'Dibatalkan')}
                    okText="Ya, Batalkan"
                    cancelText="Tidak"
                    data-testid="popconfirm-cancel-request"
                  >
                    <Button danger icon={<CloseOutlined />} data-testid="btn-action-cancel-request">
                      Batalkan Permintaan
                    </Button>
                  </Popconfirm>

                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleStateTransition('submitted', 'Diajukan')}
                    data-testid="btn-action-submit-request"
                  >
                    Ajukan Permintaan (Submit)
                  </Button>
                </>
              )}

              {request.status === 'submitted' && (
                <>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => setRejectModalOpen(true)}
                    data-testid="btn-action-reject-request"
                  >
                    Tolak Permintaan (Reject)
                  </Button>

                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => handleStateTransition('approved', 'Disetujui')}
                    data-testid="btn-action-approve-request"
                  >
                    Setujui Permintaan (Approve)
                  </Button>
                </>
              )}

              {request.status === 'approved' && (
                <Button
                  type="primary"
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleStateTransition('fulfilled', 'Terpenuhi')}
                  data-testid="btn-action-fulfill-request"
                >
                  Tandai Terpenuhi (Fulfilled)
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {request.status === 'rejected' && request.rejectionReason && (
          <Alert
            message="Permintaan Barang Ditolak"
            description={`Alasan Penolakan: ${request.rejectionReason}`}
            type="error"
            showIcon
            data-testid="alert-request-rejected"
          />
        )}

        {isLocked && request.status !== 'rejected' && (
          <Alert
            message="Dokumen Permintaan Terkunci (Locked Document)"
            description="Dokumen permintaan ini telah berstatus Terpenuhi (Fulfilled) atau Dibatalkan dan tidak dapat diubah lagi."
            type="warning"
            showIcon
            icon={<LockOutlined />}
          />
        )}

        {/* Workflow Progress Steps */}
        <Card variant="borderless">
          <Steps
            current={getStepCurrentIndex(request.status)}
            status={request.status === 'rejected' || request.status === 'cancelled' ? 'error' : 'process'}
            items={[
              { title: 'Draft', description: 'Pengisian Kebutuhan' },
              { title: 'Diajukan', description: 'Verifikasi Supervisor' },
              { title: 'Disetujui', description: 'Siap Alokasi Stok & DO' },
              { title: 'Terpenuhi', description: 'Barang Telah Dikeluarkan' },
            ]}
          />
        </Card>

        {/* Document Header Metadata */}
        <Card variant="borderless" title="Informasi Permintaan & Metadata">
          <Row gutter={[24, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Unit / Divisi Peminta</Text>
              <Text strong>{request.requestingUnit}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Asal Barang</Text>
              <Text strong>{request.warehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Tanggal Dibutuhkan</Text>
              <Text strong>{request.requiredDate}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Tingkat Prioritas</Text>
              {request.priority === 'urgent' ? (
                <Tag color="red">URGENT</Tag>
              ) : (
                <Tag color="blue">NORMAL</Tag>
              )}
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Diajukan Oleh</Text>
              <Text>{request.createdByName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Waktu Pengajuan</Text>
              <Text>{new Date(request.createdAt).toLocaleString('id-ID')}</Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Catatan / Alasan Keperluan</Text>
              <Text>{request.notes || '-'}</Text>
            </Col>
          </Row>
        </Card>

        {/* Items Line Table */}
        <Card variant="borderless" title="Rincian Baris Barang (Requested Items)">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={request.items}
            pagination={false}
            data-testid="table-request-items"
          />
        </Card>
      </Space>

      {/* Reject Request Modal */}
      <RejectRequestModal
        open={rejectModalOpen}
        requestNo={request.requestNo}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={handleRejectSubmit}
      />
    </div>
  );
};
