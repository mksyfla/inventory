import React from 'react';
import { Card, Row, Col, Statistic, Typography, Tag, Space, Alert, Button } from 'antd';
import {
  InboxOutlined,
  SendOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useWarehouseStore } from '../store/useWarehouseStore';

const { Title, Paragraph } = Typography;

export const DashboardPage: React.FC = () => {
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
              Dashboard Operasional Gudang
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Ringkasan pergerakan fisik barang, alokasi stok, dan dokumen persetujuan hari ini.
            </Paragraph>
          </Col>
          <Col>
            <Space>
              <Button type="primary" icon={<PlusOutlined />}>
                Buat GRN Baru
              </Button>

              <Button icon={<BarcodeOutlined />}>
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
                title="Menunggu Persetujuan"
                value={3}
                suffix="dokumen"
                valueStyle={{ color: '#ff5630' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
};
