import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  InputNumber,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Alert,
  Spin,
  Empty,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  LockOutlined,
  BarcodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CountSessionLine } from '../../types/counting';
import { countService } from '../../api/services';
import { mapCountDetailToSession } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const CountExecutePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: session, isLoading } = useQuery({
    queryKey: ['count-detail-blind', id],
    // Blind Count (FR-6.1): blind=true tells the backend to omit qty_system
    // from the payload, so the field device never receives it.
    queryFn: async () => {
      const dto = await countService.getCountDetail(Number(id), true);
      return mapCountDetailToSession(dto);
    },
    enabled: !!id,
  });

  const [lines, setLines] = useState<CountSessionLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) setLines(session.items);
  }, [session]);

  const handleQtyCountedChange = (index: number, val: number | null) => {
    if (val === null) return;
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qtyCounted: val };
      return updated;
    });
  };

  const handleSubmitForReview = async () => {
    if (!session) return;

    const isAnyUncounted = lines.some((i) => i.qtyCounted === undefined);
    if (isAnyUncounted) {
      notification.warning({
        message: 'Barang Belum Dihitung Lengkap',
        description: 'Pastikan seluruh baris barang telah diinput hasil perhitungan fisiknya.',
      });
      return;
    }

    try {
      setSubmitting(true);
      await countService.inputCountLines(
        session.id,
        lines.map((l) => ({ count_line_id: l.id, qty_counted: l.qtyCounted ?? 0 }))
      );

      notification.success({
        message: 'Hasil Hitung Fisik (Blind Count) Berhasil Disimpan',
        description: 'Sesi opname dikirim ke Supervisor untuk tahap rekonsiliasi selisih.',
      });

      navigate(`/counting/${session.id}`);
    } catch {
      notification.error({
        message: 'Gagal Menyimpan Hasil Hitung',
        description: 'Pastikan backend tersedia dan coba lagi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div data-testid="count-execute-page" style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (!session) {
    return (
      <div data-testid="count-execute-page">
        <Empty description="Sesi opname tidak ditemukan" />
      </div>
    );
  }

  // BLIND COUNT: Columns MUST NOT display `qtySystem`
  const columns = [
    {
      title: 'Lokasi Bin',
      dataIndex: 'binCode',
      key: 'binCode',
      width: 170,
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
      title: 'Deskripsi Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Batch No / Lot',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 160,
      render: (batch: string) => <Text code>{batch}</Text>,
    },
    {
      title: 'Satuan',
      dataIndex: 'uom',
      key: 'uom',
      width: 90,
      render: (uom: string) => <Tag color="geekblue">{uom}</Tag>,
    },
    {
      title: 'Hasil Hitung Fisik (Blind Count Input)',
      key: 'qtyCounted',
      width: 220,
      render: (_: any, record: CountSessionLine, idx: number) => (
        <InputNumber
          min={0}
          value={record.qtyCounted}
          placeholder="Input Qty Fisik..."
          onChange={(val) => handleQtyCountedChange(idx, val)}
          style={{ width: '100%' }}
          data-testid={`input-qty-counted-${idx}`}
        />
      ),
    },
  ];

  return (
    <div data-testid="count-execute-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/counting')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Layar Hitung Fisik Lapangan: {session.countNo}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Gudang: {session.warehouseName} | Cakupan: {session.targetScopeDetail}
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Space>
              <Button
                type="primary"
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                icon={<CheckCircleOutlined />}
                loading={submitting}
                onClick={handleSubmitForReview}
                data-testid="btn-submit-count-review"
              >
                Kirim Hasil Hitung ke Supervisor
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Blind Count Safeguard Banner */}
        <Alert
          message={
            <Space>
              <LockOutlined style={{ color: '#0052cc' }} />
              <strong>Prinsip Blind Count Active (FE-602)</strong>
            </Space>
          }
          description="Kuantitas stok versi sistem (qtySystem) disembunyikan secara total dari petugas penghitung di lapangan untuk menjamin objektivitas hasil opname fisik."
          type="info"
          showIcon
          data-testid="alert-blind-count-banner"
        />

        {/* Execution Table */}
        <Card
          variant="borderless"
          title={
            <Space>
              <BarcodeOutlined style={{ color: '#0052cc' }} />
              <span>Daftar Item & Scan Hasil Hitung Fisik</span>
            </Space>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={lines}
            pagination={false}
            data-testid="table-execute-lines"
          />
        </Card>
      </Space>
    </div>
  );
};
