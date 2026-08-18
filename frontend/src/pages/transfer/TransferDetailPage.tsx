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
  Input,
  InputNumber,
  Select,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
  StockTransfer,
  StockTransferLine,
  TransferStatus,
  getTransferStatusTagColor,
  MOCK_TRANSFER_LIST,
} from '../../types/transfer';
import { MOCK_LOCATIONS } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const TransferDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const existingTransfer =
    MOCK_TRANSFER_LIST.find((t) => t.id === Number(id) || String(t.id) === String(id)) ||
    MOCK_TRANSFER_LIST[0];

  const [transfer, setTransfer] = useState<StockTransfer>(existingTransfer);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>(
    existingTransfer.discrepancyReason || ''
  );

  const handleQtyReceivedChange = (index: number, val: number | null) => {
    if (val === null) return;
    setTransfer((prev) => {
      const updatedItems = [...prev.items];
      const current = updatedItems[index];
      const variance = current.qtySent - val;
      updatedItems[index] = {
        ...current,
        qtyReceived: val,
        qtyVariance: variance > 0 ? variance : 0,
      };
      return { ...prev, items: updatedItems };
    });
  };

  const handleLocationChange = (index: number, locCode: string) => {
    setTransfer((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = { ...updatedItems[index], targetLocationCode: locCode };
      return { ...prev, items: updatedItems };
    });
  };

  const hasVariance = transfer.items.some((item) => (item.qtyVariance || 0) > 0);

  const handleConfirmTransferIn = () => {
    if (hasVariance && !discrepancyReason.trim()) {
      notification.error({
        message: 'Alasan Selisih Transit Wajib Diisi (FE-403)',
        description:
          'Terdapat perbedaan antara Qty Dikirim dan Qty Diterima. Wajib mengisi Berita Acara / Alasan Selisih Transit.',
      });
      return;
    }

    const nextStatus: TransferStatus = hasVariance ? 'partial_received' : 'received';

    setTransfer((prev) => ({
      ...prev,
      status: nextStatus,
      discrepancyReason: hasVariance ? discrepancyReason : undefined,
    }));

    notification.success({
      message: 'Konfirmasi Penerimaan Mutasi (Transfer In) Berhasil',
      description: `Barang telah diterima di Gudang ${transfer.destinationWarehouseName} dan dimasukkan ke stok aktif.`,
    });
  };

  const getStepCurrentIndex = (status: TransferStatus) => {
    switch (status) {
      case 'draft':
        return 0;
      case 'in_transit':
        return 1;
      case 'received':
      case 'partial_received':
        return 2;
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
      width: 140,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang SKU',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Batch No / Lot',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 150,
      render: (batch: string) => <Text code>{batch}</Text>,
    },
    {
      title: 'Qty Dikirim (Origin)',
      dataIndex: 'qtySent',
      key: 'qtySent',
      width: 130,
      render: (qty: number, record: StockTransferLine) => (
        <Text strong>
          {qty} {record.uom}
        </Text>
      ),
    },
    {
      title: 'Qty Diterima Aktual (FE-402)',
      key: 'qtyReceived',
      width: 160,
      render: (_: any, record: StockTransferLine, idx: number) => (
        <InputNumber
          min={0}
          max={record.qtySent}
          value={record.qtyReceived ?? record.qtySent}
          onChange={(val) => handleQtyReceivedChange(idx, val)}
          disabled={transfer.status === 'received' || transfer.status === 'partial_received'}
          data-testid={`input-qty-received-${idx}`}
        />
      ),
    },
    {
      title: 'Selisih Transit (FE-403)',
      key: 'qtyVariance',
      width: 140,
      render: (_: any, record: StockTransferLine) => {
        const variance = record.qtyVariance || 0;
        return variance > 0 ? (
          <Tag color="error" icon={<ExclamationCircleOutlined />}>
            -{variance} {record.uom} (Selisih)
          </Tag>
        ) : (
          <Tag color="success">Sesuai (0)</Tag>
        );
      },
    },
    {
      title: 'Lokasi Bin Tujuan Gudang',
      key: 'targetLocationCode',
      width: 200,
      render: (_: any, record: StockTransferLine, idx: number) => (
        <Select
          style={{ width: '100%' }}
          value={record.targetLocationCode || MOCK_LOCATIONS[0].code}
          onChange={(val) => handleLocationChange(idx, val)}
          disabled={transfer.status === 'received' || transfer.status === 'partial_received'}
          data-testid={`select-target-bin-${idx}`}
          options={MOCK_LOCATIONS.map((loc: { code: string; type: string }) => ({
            value: loc.code,
            label: `${loc.code} (${loc.type})`,
          }))}
        />
      ),
    },
  ];

  const statusTag = getTransferStatusTagColor(transfer.status);

  return (
    <div data-testid="transfer-detail-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transfer')} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Dokumen Mutasi: {transfer.transferNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Dari {transfer.originWarehouseName} ke {transfer.destinationWarehouseName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {transfer.status === 'in_transit' && (
            <Col>
              <Button
                type="primary"
                size="large"
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmTransferIn}
                data-testid="btn-confirm-transfer-in"
              >
                Konfirmasi Penerimaan (Transfer In)
              </Button>
            </Col>
          )}
        </Row>

        {/* Progress Steps */}
        <Card variant="borderless">
          <Steps
            current={getStepCurrentIndex(transfer.status)}
            status={transfer.status === 'cancelled' ? 'error' : 'process'}
            items={[
              { title: 'Draft Pengiriman', description: 'Gudang Asal' },
              { title: 'In-Transit', description: 'Dalam Perjalanan Armada' },
              { title: 'Transfer In Received', description: 'Diterima Gudang Tujuan' },
            ]}
          />
        </Card>

        {/* Metadata Summary */}
        <Card variant="borderless" title="Informasi Pengiriman & Armada">
          <Row gutter={[24, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Pengirim (Origin)</Text>
              <Text strong style={{ color: '#0052cc' }}>{transfer.originWarehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Penerima (Destination)</Text>
              <Text strong style={{ color: '#722ed1' }}>{transfer.destinationWarehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Pengemudi / Driver</Text>
              <Text strong>{transfer.driverName || '-'}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Plat Nomor Armada</Text>
              <Text strong>{transfer.vehiclePlateNo || '-'}</Text>
            </Col>
          </Row>
        </Card>

        {/* FE-403: Discrepancy Warning Alert & Reason Form */}
        {hasVariance && (
          <Card
            variant="borderless"
            style={{ border: '2px solid #ff4d4f', background: '#fff2f0' }}
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                <span>Peringatan Selisih Transit & Berita Acara (FE-403)</span>
              </Space>
            }
          >
            <Alert
              message="Ditemukan Selisih Kuantitas Pengiriman Transit!"
              description="Jumlah barang yang diterima aktual kurang dari jumlah barang yang dikirim oleh gudang asal. Wajib mengisi Alasan / Berita Acara Selisih."
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              data-testid="alert-discrepancy-warning"
            />

            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Alasan / Berita Acara Selisih Transit <Text type="danger">*</Text>
            </label>
            <Input.TextArea
              rows={3}
              placeholder="Contoh: Ditemukan kemasan fisik rusak akibat benturan saat pengangkutan truk"
              value={discrepancyReason}
              onChange={(e) => setDiscrepancyReason(e.target.value)}
              disabled={transfer.status === 'received' || transfer.status === 'partial_received'}
              data-testid="input-discrepancy-reason"
            />
          </Card>
        )}

        {/* Items Table */}
        <Card variant="borderless" title="Rincian Barang Mutasi & Verifikasi Transfer In">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={transfer.items}
            pagination={false}
            data-testid="table-transfer-items"
          />
        </Card>
      </Space>
    </div>
  );
};
