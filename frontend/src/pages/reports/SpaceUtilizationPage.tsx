import React from 'react';
import {
  Card,
  Table,
  Progress,
  Space,
  Typography,
  Row,
  Col,
} from 'antd';
import { HomeOutlined, DashboardOutlined } from '@ant-design/icons';
import { WarehouseSpaceReport, MOCK_SPACE_REPORTS } from '../../types/report';

const { Title, Paragraph, Text } = Typography;

export const SpaceUtilizationPage: React.FC = () => {
  const zoneColumns = [
    {
      title: 'Nama Zona / Area Gudang',
      dataIndex: 'zoneName',
      key: 'zoneName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Kapasitas Volume Total (m³)',
      dataIndex: 'capacityVolumeM3',
      key: 'capacityVolumeM3',
      width: 200,
      render: (val: number) => `${val} m³`,
    },
    {
      title: 'Volume Terpakai (m³)',
      dataIndex: 'usedVolumeM3',
      key: 'usedVolumeM3',
      width: 180,
      render: (val: number) => <Text strong style={{ color: '#0052cc' }}>{val} m³</Text>,
    },
    {
      title: 'Tingkat Okupansi (%)',
      dataIndex: 'occupancyPct',
      key: 'occupancyPct',
      width: 240,
      render: (pct: number) => (
        <Progress
          percent={pct}
          size="small"
          status={pct > 85 ? 'exception' : 'active'}
        />
      ),
    },
  ];

  return (
    <div data-testid="space-utilization-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <DashboardOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Laporan Pemanfaatan Kapasitas Gudang (FE-703)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Metrik utilisasi ruang penyimpanan (m³) dan batas beban berat (kg) per Gudang dan Zona.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        {/* Warehouse Cards Grid */}
        {MOCK_SPACE_REPORTS.map((wh: WarehouseSpaceReport) => (
          <Card
            key={wh.warehouseId}
            variant="borderless"
            title={
              <Space>
                <HomeOutlined style={{ color: '#0052cc' }} />
                <span>{wh.warehouseName}</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
            data-testid={`card-warehouse-space-${wh.warehouseId}`}
          >
            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
              <Col xs={24} md={12}>
                <Card type="inner" title="Utilisasi Volume Ruang (m³)">
                  <Progress
                    type="dashboard"
                    percent={wh.volumeOccupancyPct}
                    status={wh.volumeOccupancyPct > 85 ? 'exception' : 'normal'}
                  />
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ display: 'block' }}>
                      Volume Terpakai: <Text strong>{wh.usedVolumeM3} m³</Text> dari {wh.totalVolumeM3} m³
                    </Text>
                  </div>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card type="inner" title="Utilisasi Beban Berat (kg)">
                  <Progress
                    type="dashboard"
                    percent={wh.weightOccupancyPct}
                    strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                  />
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ display: 'block' }}>
                      Beban Terpakai: <Text strong>{wh.usedWeightKg.toLocaleString()} kg</Text> dari {wh.totalWeightKg.toLocaleString()} kg
                    </Text>
                  </div>
                </Card>
              </Col>
            </Row>

            <Title level={5}>Breakdown Okupansi per Zona Lokasi</Title>
            <Table
              rowKey="zoneName"
              columns={zoneColumns}
              dataSource={wh.zones}
              pagination={false}
              data-testid={`table-zones-space-${wh.warehouseId}`}
            />
          </Card>
        ))}
      </Space>
    </div>
  );
};
