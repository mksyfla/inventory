import React, { useState, useMemo } from 'react';
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
  Empty,
} from 'antd';
import {
  SearchOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { stockQueryService } from '../../api/services/stock';
import { BatchTraceDTO } from '../../api/dto';
import { StockStatus, getStockStatusTagColor } from '../../types/stock';

const { Title, Paragraph, Text } = Typography;

// LocationRow is the per-bin distribution of a traced batch, built from the
// batch-trace endpoint rows (one row per batch × balance location).
interface LocationRow {
  locationCode: string;
  status: string;
  qtyOnhand: number;
  qtyReserved: number;
}

export const BatchTracePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState<string>('');
  const [submittedSearch, setSubmittedSearch] = useState<string>('');

  const handleSearch = () => {
    setSubmittedSearch(searchInput.trim());
  };

  const { data: traces = [], isLoading } = useQuery({
    queryKey: ['batch-trace', submittedSearch],
    queryFn: () => stockQueryService.listBatchTrace(submittedSearch || undefined),
  });

  const { header, locations } = useMemo(() => {
    if (traces.length === 0) return { header: null as BatchTraceDTO | null, locations: [] as LocationRow[] };
    const first = traces[0];
    const locs = traces
      .filter((t) => t.batch_id === first.batch_id && t.balance_id != null)
      .map((t): LocationRow => ({
        locationCode: t.location_code || '-',
        status: t.status,
        qtyOnhand: t.qty_onhand,
        qtyReserved: t.qty_reserved,
      }));
    return { header: first, locations: locs };
  }, [traces]);

  const totalReceived = locations.reduce((acc, l) => acc + l.qtyOnhand + l.qtyReserved, 0);
  const uom = header?.base_uom ?? '-';

  const locationColumns = [
    {
      title: 'Lokasi Bin',
      dataIndex: 'locationCode',
      key: 'locationCode',
      render: (code: string) => <Tag color="geekblue">{code}</Tag>,
    },
    {
      title: 'Status Stok',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const { color, label } = getStockStatusTagColor(status as StockStatus);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Qty On-Hand',
      dataIndex: 'qtyOnhand',
      key: 'qtyOnhand',
      render: (qty: number) => (
        <Text strong>
          {qty} {uom}
        </Text>
      ),
    },
    {
      title: 'Qty Reserved',
      dataIndex: 'qtyReserved',
      key: 'qtyReserved',
      render: (qty: number) =>
        qty > 0 ? (
          <Text type="warning" strong>
            {qty} {uom}
          </Text>
        ) : (
          <Text type="secondary">0</Text>
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onPressEnter={handleSearch}
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
              {header ? (
                <Timeline
                  items={[
                    {
                      color: 'blue',
                      children: (
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Pemasok / Supplier Asal</Text>
                          <div><Text strong>{header.supplier_name || '-'}</Text></div>
                        </div>
                      ),
                    },
                    {
                      color: 'green',
                      children: (
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Dokumen Penerimaan (GRN)</Text>
                          <div>
                            <Text code strong>{header.grn_no || '-'}</Text> ({header.grn_date || '-'})
                          </div>
                          <Tag color="blue" style={{ marginTop: 4 }}>
                            Penerimaan Total: {totalReceived} {uom}
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
                            <Text strong style={{ color: '#0052cc' }}>{header.sku}</Text> - {header.item_name}
                          </div>
                          <Tag color="geekblue" style={{ marginTop: 4 }}>
                            Batch No: {header.batch_no}
                          </Tag>
                          {header.expiry_date && (
                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                              Exp: {header.expiry_date}
                            </Text>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty
                  description={
                    isLoading ? 'Memuat data batch...' : 'Batch tidak ditemukan. Coba nomor batch lain.'
                  }
                />
              )}
            </Card>
          </Col>

          {/* Forward Traceability */}
          <Col xs={24} md={12}>
            <Card
              variant="borderless"
              title={
                <Space>
                  <SendOutlined style={{ color: '#52c41a' }} />
                  <span>2. Forward Traceability (Distribusi Lokasi)</span>
                </Space>
              }
              data-testid="card-forward-trace"
            >
              <Table
                rowKey="locationCode"
                columns={locationColumns}
                dataSource={locations}
                loading={isLoading}
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
