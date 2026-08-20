import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Alert,
  Steps,
  Spin,
  Empty,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CountSessionLine,
  CountSessionStatus,
  AdjustmentReasonCode,
  getCountStatusTagColor,
} from '../../types/counting';
import { countService } from '../../api/services';
import { mapCountDetailToSession, normalizeCountStatus } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const CountingDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['count-detail', id],
    queryFn: async () => {
      const dto = await countService.getCountDetail(Number(id));
      return mapCountDetailToSession(dto);
    },
    enabled: !!id,
  });

  // The reconciliation edits (reason codes) are local overrides applied on top
  // of the server data; posting pushes them to the backend.
  const [lines, setLines] = useState<CountSessionLine[]>([]);
  const [status, setStatus] = useState<CountSessionStatus>('open');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (detail) {
      setLines(detail.items);
      setStatus(detail.status);
    }
  }, [detail]);

  const handleReasonChange = (index: number, reason: AdjustmentReasonCode) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], reasonCode: reason };
      return updated;
    });
  };

  const hasVariance = lines.some(
    (item) => item.qtyVariance !== undefined && item.qtyVariance !== 0
  );

  const handlePostAdjustments = async () => {
    if (!detail) return;

    const unreasonedLines = lines.filter(
      (item) => item.qtyVariance !== undefined && item.qtyVariance !== 0 && !item.reasonCode
    );

    if (unreasonedLines.length > 0) {
      notification.error({
        message: 'Kode Alasan Wajib Diisi (FE-603)',
        description: 'Seluruh baris barang yang memiliki selisih wajib dilengkapi Kode Alasan Penyesuaian.',
      });
      return;
    }

    try {
      setPosting(true);
      const result = await countService.postCount(detail.id);
      setStatus(normalizeCountStatus(result.status));
      await queryClient.invalidateQueries({ queryKey: ['count-sessions'] });

      notification.success({
        message: 'Penyesuaian Stok (ADJ) Berhasil Diposting',
        description: `Jurnal pergerakan stok penyesuaian untuk sesi ${detail.countNo} telah resmi dicatat ke ledger (${result.posted_adjustment_lines} baris ADJ).`,
      });
    } catch {
      notification.error({
        message: 'Gagal Posting Penyesuaian',
        description: 'Pastikan seluruh selisih telah diberi alasan dan backend tersedia.',
      });
    } finally {
      setPosting(false);
    }
  };

  const getStepCurrentIndex = (s: CountSessionStatus) => {
    switch (s) {
      case 'open':
        return 0;
      case 'in_progress':
        return 1;
      case 'review':
        return 2;
      case 'posted':
        return 3;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  };

  if (isLoading) {
    return (
      <div data-testid="counting-detail-page" style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-testid="counting-detail-page">
        <Empty description="Sesi opname tidak ditemukan" />
      </div>
    );
  }

  const columns = [
    {
      title: 'Lokasi Bin',
      dataIndex: 'binCode',
      key: 'binCode',
      width: 150,
      render: (bin: string) => <Tag color="blue">{bin}</Tag>,
    },
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 140,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Batch No',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 150,
      render: (batch: string) => <Text code>{batch}</Text>,
    },
    {
      title: 'Qty Sistem',
      dataIndex: 'qtySystem',
      key: 'qtySystem',
      width: 110,
      render: (qty: number) => <Text strong>{qty}</Text>,
    },
    {
      title: 'Qty Hitung Fisik',
      dataIndex: 'qtyCounted',
      key: 'qtyCounted',
      width: 130,
      render: (qty?: number) => (qty !== undefined ? <Text strong>{qty}</Text> : <Text type="secondary">-</Text>),
    },
    {
      title: 'Selisih (Variance)',
      key: 'qtyVariance',
      width: 140,
      render: (_: any, record: CountSessionLine) => {
        const v = record.qtyVariance ?? (record.qtyCounted !== undefined ? record.qtyCounted - record.qtySystem : 0);
        return v !== 0 ? (
          <Tag color="error" icon={<ExclamationCircleOutlined />}>
            {v > 0 ? `+${v}` : v} {record.uom} (Selisih)
          </Tag>
        ) : (
          <Tag color="success">Cocok (0)</Tag>
        );
      },
    },
    {
      title: 'Kode Alasan Penyesuaian (FE-603)',
      key: 'reasonCode',
      width: 220,
      render: (_: any, record: CountSessionLine, idx: number) => {
        const v = record.qtyVariance ?? (record.qtyCounted !== undefined ? record.qtyCounted - record.qtySystem : 0);
        if (v === 0) return <Text type="secondary">-</Text>;

        return (
          <Select
            style={{ width: '100%' }}
            placeholder="Pilih Alasan..."
            value={record.reasonCode}
            onChange={(val) => handleReasonChange(idx, val)}
            disabled={status === 'posted'}
            data-testid={`select-reason-${idx}`}
            options={[
              { value: 'DAMAGED_ITEM', label: 'Barang Rusak (Damaged)' },
              { value: 'EXPIRED_ITEM', label: 'Kedaluwarsa (Expired)' },
              { value: 'LOST_ITEM', label: 'Barang Hilang / Kurang' },
              { value: 'COUNT_DISCREPANCY', label: 'Selisih Hitung Fisik' },
              { value: 'SYSTEM_CORRECTION', label: 'Koreksi Data Sistem' },
            ]}
          />
        );
      },
    },
  ];

  const statusTag = getCountStatusTagColor(status);

  return (
    <div data-testid="counting-detail-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/counting')} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Sesi Opname: {detail.countNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  {detail.title} | Gudang: {detail.warehouseName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {status !== 'posted' && (
            <Col>
              <Button
                type="primary"
                size="large"
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                icon={<SaveOutlined />}
                loading={posting}
                onClick={handlePostAdjustments}
                data-testid="btn-post-adjustments"
              >
                Posting Penyesuaian (Post Adjustment ADJ)
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
              { title: 'Sesi Dibuka', description: 'Snapshot Stok' },
              { title: 'Hitung Fisik', description: 'Blind Count Lapangan' },
              { title: 'Rekonsiliasi Supervisor', description: 'Cek Selisih & Alasan' },
              { title: 'Posting Penyesuaian', description: 'Update Ledger ADJ' },
            ]}
          />
        </Card>

        {/* Discrepancy Alert */}
        {hasVariance && (
          <Alert
            message="Ditemukan Variansi Kuantitas Antara Stok Sistem dan Fisik (FE-603)"
            description="Lengkapi Kode Alasan Penyesuaian untuk setiap baris barang yang memiliki selisih sebelum menekan tombol Posting Penyesuaian."
            type="warning"
            showIcon
            data-testid="alert-reconciliation-warning"
          />
        )}

        {/* Detail Table */}
        <Card variant="borderless" title="Rekonsiliasi Kuantitas & Kode Alasan Penyesuaian">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={lines}
            pagination={false}
            data-testid="table-counting-reconciliation"
          />
        </Card>
      </Space>
    </div>
  );
};
