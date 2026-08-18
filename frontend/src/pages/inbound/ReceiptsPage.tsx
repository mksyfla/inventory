import React from 'react';
import {
  Button,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Empty,
} from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

export const ReceiptsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div data-testid="receipts-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Dokumen Penerimaan Barang (Goods Receipt Notes)
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Daftar seluruh transaksi penerimaan fisik barang (Inbound GRN).
            </Paragraph>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/inbound/receipts/new')}
              data-testid="btn-create-grn"
            >
              Buat Penerimaan (GRN) Baru
            </Button>
          </Col>
        </Row>

        <Alert
          message="Daftar GRN Belum Tersedia di Backend"
          description="Kontrak API (openapi.yaml) saat ini hanya menyediakan pembuatan GRN (POST /receipts), submit, approve, dan alur putaway — belum ada endpoint daftar (GET /receipts) maupun detail (GET /receipts/:id). Anda tetap dapat membuat dokumen penerimaan baru melalui tombol di atas."
          type="info"
          showIcon
        />

        <Row>
          <Col span={24}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 48 }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical">
                    <FileTextOutlined style={{ fontSize: 32, color: '#bfbfbf' }} />
                    <span>Belum ada daftar dokumen — silakan buat GRN baru.</span>
                  </Space>
                }
              />
            </div>
          </Col>
        </Row>
      </Space>
    </div>
  );
};
