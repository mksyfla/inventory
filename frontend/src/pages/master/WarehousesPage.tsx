import React from 'react';
import {
  Table,
  Space,
  Badge,
  Typography,
  Card,
  Row,
  Col,
  Alert,
} from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { useWarehouseStore } from '../../store/useWarehouseStore';

const { Title, Paragraph, Text } = Typography;

export const WarehousesPage: React.FC = () => {
  const { warehouses } = useWarehouseStore();

  const columns = [
    {
      title: 'Kode Gudang',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text strong style={{ color: '#0052cc' }}>{code}</Text>,
    },
    {
      title: 'Nama Gudang',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Status Operasional',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 150,
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Aktif' : 'Nonaktif'} />
      ),
    },
  ];

  return (
    <div data-testid="warehouses-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Master Data Gudang (Warehouse Facilities)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Daftar gudang yang diizinkan untuk akun Anda (berasal dari klaim JWT).
            </Paragraph>
          </Col>
        </Row>

        <Alert
          message="Endpoint Gudang Tidak Tersedia"
          description="Kontrak API (openapi.yaml) belum menyediakan endpoint CRUD warehouse. Daftar gudang di bawah ini disediakan dari konteks sesi aktif (klaim JWT) dan tidak dapat diedit melalui aplikasi ini."
          type="info"
          showIcon
          icon={<HomeOutlined />}
        />

        <Card variant="borderless">
          <Table
            rowKey="code"
            columns={columns}
            dataSource={warehouses}
            pagination={false}
            data-testid="table-warehouses"
          />
        </Card>
      </Space>
    </div>
  );
};
