import React from 'react';
import { Card, Row, Col, Statistic, Typography, Tag, Space, Alert, Button, Progress } from 'antd';
import {
  InboxOutlined,
  SendOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  PlusOutlined,
  PieChartOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';

const { Title, Paragraph, Text } = Typography;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWarehouse } = useWarehouseStore();

  return (
    <div data-testid="dashboard-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Welcome Header */}
        <Alert
          message={
            <Space align="center">
              <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                {activeWarehouse?.code || 'JKT01'}
              </Tag>
              <strong>Konteks Gudang Aktif: {activeWarehouse?.name}</strong>
            </Space>
          }
          description="Sistem inventori beroperasi penuh dalam mode Perpetual Inventory + Audit Trail append-only."
          type="info"
          showIcon
        />

        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Dashboard Operasional & Analisis Gudang (FE-704)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Ringkasan pergerakan fisik barang, alokasi stok, dan dokumen persetujuan hari ini.
            </Paragraph>
          </Col>
          <Col>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/inbound/receipts/new')}
                data-testid="btn-quick-grn"
              >
                Buat GRN Baru
              </Button>

              <Button
                icon={<BarcodeOutlined />}
                onClick={() => navigate('/outbound/deliveries/picking')}
                data-testid="btn-quick-scan"
              >
                Scan Quick Action
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Metric Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Penerimaan Hari Ini (GRN)"
                value={12}
                suffix="dokumen"
                valueStyle={{ color: '#0052cc' }}
                prefix={<InboxOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Pengeluaran Hari Ini (DO)"
                value={28}
                suffix="dokumen"
                valueStyle={{ color: '#36b37e' }}
                prefix={<SendOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="SKU di Bawah Min Stock"
                value={5}
                suffix="item"
                valueStyle={{ color: '#ffab00' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Akurasi Opname (IRA)"
                value={98.5}
                suffix="%"
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* FE-704: Analytical Widgets & Quick Report Navigation */}
        <Title level={4}>Akses Cepat Laporan & Analitik Inventori (EPIC-7)</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card
              hoverable
              variant="borderless"
              onClick={() => navigate('/reports/valuation')}
              data-testid="card-report-valuation"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space align="center">
                  <PieChartOutlined style={{ fontSize: 24, color: '#0052cc' }} />
                  <Text strong style={{ fontSize: 16 }}>Laporan Valuasi Stok (FE-701)</Text>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                  Metode FIFO, mutasi saldo awal/akhir, dan nilai total persediaan barang.
                </Paragraph>
                <Tag color="blue">Valuasi: Rp 7.450.000.000</Tag>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              variant="borderless"
              onClick={() => navigate('/reports/fsn')}
              data-testid="card-report-fsn"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space align="center">
                  <ThunderboltOutlined style={{ fontSize: 24, color: '#faad14' }} />
                  <Text strong style={{ fontSize: 16 }}>Analisis FSN (FE-702)</Text>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                  Klasifikasi Fast-Moving, Slow-Moving, & Dead-Stock (TOR & DOI).
                </Paragraph>
                <Tag color="orange">Fast: 1 SKU | Dead: 1 SKU</Tag>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              variant="borderless"
              onClick={() => navigate('/reports/space-utilization')}
              data-testid="card-report-space"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space align="center">
                  <DashboardOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                  <Text strong style={{ fontSize: 16 }}>Utilisasi Ruang Gudang (FE-703)</Text>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                  Kapasitas volume (m³) dan batas beban berat (kg) per Gudang.
                </Paragraph>
                <Progress percent={77} size="small" status="active" />
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
};
