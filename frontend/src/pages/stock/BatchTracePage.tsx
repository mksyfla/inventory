import React, { useState } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Table,
  Timeline,
} from 'antd';
import {
  SearchOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { BatchTrace, MOCK_BATCH_TRACE } from '../../types/stock';

const { Title, Paragraph, Text } = Typography;

export const BatchTracePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchBatchNo, setSearchBatchNo] = useState<string>('LOT-SIC-202608-01');
  const [traceData, setTraceData] = useState<BatchTrace>(MOCK_BATCH_TRACE);

  const handleSearch = () => {
    setTraceData({
      ...MOCK_BATCH_TRACE,
      batchNo: searchBatchNo || MOCK_BATCH_TRACE.batchNo,
    });
  };

  const deliveryColumns = [
    {
      title: 'No. Surat Jalan (DO)',
      dataIndex: 'doNo',
      key: 'doNo',
      render: (doNo: string) => <Text strong style={{ color: '#0052cc' }}>{doNo}</Text>,
    },
    {
      title: 'Pelanggan / Penerima',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (c: string) => <Text strong>{c}</Text>,
    },
    {
      title: 'Tanggal Pengiriman',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
    },
    {
      title: 'Jumlah Diteruskan (Qty)',
      dataIndex: 'qtyDelivered',
      key: 'qtyDelivered',
      render: (qty: number) => (
        <Text type="success" strong>
          {qty} {traceData.uom}
        </Text>
      ),
    },
  ];

  return (
    <div data-testid="batch-trace-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/stock/balances')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Visualisator Penelusuran Batch (FE-504)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Backward & Forward Batch Traceability dari Pemasok hingga Pelanggan Akhir.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        {/* Search Bar */}
        <Card variant="borderless">
          <Row gutter={16} align="middle">
            <Col xs={24} md={16}>
              <Input
                size="large"
                placeholder="Masukkan Nomor Batch / Lot Barang (contoh: LOT-SIC-202608-01)..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchBatchNo}
                onChange={(e) => setSearchBatchNo(e.target.value)}
                data-testid="input-search-batch"
              />
            </Col>
            <Col xs={24} md={8}>
              <Button
                type="primary"
                size="large"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                data-testid="btn-search-batch"
              >
                Telusuri Alur Batch
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Traceability Grid */}
        <Row gutter={[16, 16]}>
          {/* Backward Traceability */}
          <Col xs={24} md={12}>
            <Card
              variant="borderless"
              title={
                <Space>
                  <InboxOutlined style={{ color: '#0052cc' }} />
                  <span>1. Backward Traceability (Asal Usul Inbound)</span>
                </Space>
              }
              data-testid="card-backward-trace"
            >
              <Timeline
                items={[
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>Pemasok / Supplier Asal</Text>
                        <div><Text strong>{traceData.supplierName}</Text></div>
                      </div>
                    ),
                  },
                  {
                    color: 'green',
                    children: (
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>Dokumen Penerimaan (GRN)</Text>
                        <div>
                          <Text code strong>{traceData.grnNo}</Text> ({traceData.receiptDate})
                        </div>
                        <Tag color="blue" style={{ marginTop: 4 }}>
                          Penerimaan Total: {traceData.totalQtyReceived} {traceData.uom}
                        </Tag>
                      </div>
                    ),
                  },
                  {
                    color: 'purple',
                    children: (
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>Informasi Batch & SKU</Text>
                        <div>
                          <Text strong style={{ color: '#0052cc' }}>{traceData.sku}</Text> - {traceData.itemName}
                        </div>
                        <Tag color="geekblue" style={{ marginTop: 4 }}>
                          Batch No: {traceData.batchNo}
                        </Tag>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>

          {/* Forward Traceability */}
          <Col xs={24} md={12}>
            <Card
              variant="borderless"
              title={
                <Space>
                  <SendOutlined style={{ color: '#52c41a' }} />
                  <span>2. Forward Traceability (Distribusi Outbound)</span>
                </Space>
              }
              data-testid="card-forward-trace"
            >
              <Table
                rowKey="doNo"
                columns={deliveryColumns}
                dataSource={traceData.deliveries}
                pagination={false}
                data-testid="table-forward-deliveries"
              />
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
};
