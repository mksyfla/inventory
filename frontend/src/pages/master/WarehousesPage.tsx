import React from 'react';
import {
  Table,
  Space,
  Badge,
  Typography,
  Card,
  Row,
  Col,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Warehouse } from '../../types/warehouse';
import { warehouseService } from '../../api/services/warehouses';
import { mapWarehouseDTO } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const WarehousesPage: React.FC = () => {
  // Live master warehouse list from the backend (GET /warehouses).
  const { data: warehouses = [], isLoading } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const dtos = await warehouseService.list();
      return dtos.map(mapWarehouseDTO);
    },
  });

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
      title: 'Alamat',
      dataIndex: 'address',
      key: 'address',
      render: (address?: string) => (address ? <Text>{address}</Text> : <Text type="secondary">-</Text>),
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
              Daftar seluruh fasilitas gudang yang terdaftar di backend.
            </Paragraph>
          </Col>
        </Row>

        <Card variant="borderless">
          <Table
            rowKey="code"
            columns={columns}
            dataSource={warehouses}
            loading={isLoading}
            pagination={false}
            data-testid="table-warehouses"
          />
        </Card>
      </Space>
    </div>
  );
};
