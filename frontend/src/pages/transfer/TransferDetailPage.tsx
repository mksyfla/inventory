import React, { useEffect, useState } from 'react';
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
  Spin,
  Empty,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  StockTransferLine,
  TransferStatus,
  getTransferStatusTagColor,
} from '../../types/transfer';
import { documentService, locationService, transferService } from '../../api/services';
import { mapDocumentToTransfer } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const TransferDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['transfer-detail', id],
    queryFn: async () => {
      const dto = await documentService.getDetail(Number(id));
      return mapDocumentToTransfer(dto, dto.lines);
    },
    enabled: !!id,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', detail?.destinationWarehouseId],
    queryFn: () => locationService.listLocations(detail?.destinationWarehouseId ?? 0),
    enabled: !!detail && !!detail.destinationWarehouseId,
  });

  // Local overrides for the receive-in flow (qty received, target bin, status).
  const [lines, setLines] = useState<StockTransferLine[]>([]);
  const [status, setStatus] = useState<TransferStatus>('draft');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    if (detail) {
      setLines(detail.items);
      setStatus(detail.status);
      setDiscrepancyReason(detail.discrepancyReason || '');
    }
  }, [detail]);

  const handleQtyReceivedChange = (index: number, val: number | null) => {
    if (val === null) return;
    setLines((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const variance = current.qtySent - val;
      updated[index] = {
        ...current,
        qtyReceived: val,
        qtyVariance: variance > 0 ? variance : 0,
      };
      return updated;
    });
  };

  const handleLocationChange = (index: number, locCode: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], targetLocationCode: locCode };
      return updated;
    });
  };

  const hasVariance = lines.some((item) => (item.qtyVariance || 0) > 0);

  const handleConfirmTransferIn = async () => {
    if (!detail) return;

    if (hasVariance && !discrepancyReason.trim()) {
      notification.error({
        message: 'Alasan Selisih Transit Wajib Diisi (FE-403)',
        description:
          'Terdapat perbedaan antara Qty Dikirim dan Qty Diterima. Wajib mengisi Berita Acara / Alasan Selisih Transit.',
      });
      return;
    }

    const codeToId = new Map(locations.map((l) => [l.code, l.id]));

    try {
      setReceiving(true);
      const result = await transferService.receiveTransfer(
        detail.id,
        lines.map((item) => ({
          line_id: item.id,
          qty_received: item.qtyReceived ?? item.qtySent,
          location_id: item.targetLocationCode ? (codeToId.get(item.targetLocationCode) ?? 0) : 0,
          notes: hasVariance ? discrepancyReason : undefined,
        }))
      );

      const nextStatus: TransferStatus = result.discrepancy ? 'partial_received' : 'received';
      setStatus(nextStatus);

      notification.success({
        message: 'Konfirmasi Penerimaan Mutasi (Transfer In) Berhasil',
        description: `Barang telah diterima di Gudang ${detail.destinationWarehouseName} dan dimasukkan ke stok aktif.`,
      });
    } catch {
      notification.error({
        message: 'Gagal Konfirmasi Penerimaan',
        description: 'Pastikan lokasi bin tujuan telah dipilih dan backend tersedia.',
      });
    } finally {
      setReceiving(false);
    }
  };

  const getStepCurrentIndex = (s: TransferStatus) => {
    switch (s) {
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

  if (isLoading) {
    return (
      <div data-testid="transfer-detail-page" style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-testid="transfer-detail-page">
        <Empty description="Dokumen mutasi tidak ditemukan" />
      </div>
    );
  }

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
          disabled={status === 'received' || status === 'partial_received'}
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
          value={record.targetLocationCode || locations[0]?.code}
          onChange={(val) => handleLocationChange(idx, val)}
          disabled={status === 'received' || status === 'partial_received'}
          data-testid={`select-target-bin-${idx}`}
          options={locations.map((loc) => ({
            value: loc.code,
            label: `${loc.code} (${loc.loc_type})`,
          }))}
        />
      ),
    },
  ];

  const statusTag = getTransferStatusTagColor(status);

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
                    Dokumen Mutasi: {detail.transferNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Dari {detail.originWarehouseName} ke {detail.destinationWarehouseName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {status === 'in_transit' && (
            <Col>
              <Button
                type="primary"
                size="large"
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                icon={<CheckCircleOutlined />}
                loading={receiving}
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
            current={getStepCurrentIndex(status)}
            status={status === 'cancelled' ? 'error' : 'process'}
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
              <Text strong style={{ color: '#0052cc' }}>{detail.originWarehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Penerima (Destination)</Text>
              <Text strong style={{ color: '#722ed1' }}>{detail.destinationWarehouseName}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Pengemudi / Driver</Text>
              <Text strong>{detail.driverName || '-'}</Text>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Plat Nomor Armada</Text>
              <Text strong>{detail.vehiclePlateNo || '-'}</Text>
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
              disabled={status === 'received' || status === 'partial_received'}
              data-testid="input-discrepancy-reason"
            />
          </Card>
        )}

        {/* Items Table */}
        <Card variant="borderless" title="Rincian Barang Mutasi & Verifikasi Transfer In">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={lines}
            pagination={false}
            data-testid="table-transfer-items"
          />
        </Card>
      </Space>
    </div>
  );
};
