import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Modal,
  Space,
  Tag,
  Typography,
  Row,
  Col,
} from 'antd';
import {
  AuditOutlined,
  SearchOutlined,
  EyeOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { AuditLog, AuditAction, MOCK_AUDIT_LOGS } from '../../types/stock';

const { Title, Paragraph, Text } = Typography;

export const AuditLogsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const filteredLogs = MOCK_AUDIT_LOGS.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.requestId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = selectedAction === 'all' || log.action === selectedAction;

    return matchesSearch && matchesAction;
  });

  const handleOpenDiffModal = (log: AuditLog) => {
    setSelectedLog(log);
    setModalOpen(true);
  };

  const getActionTag = (action: AuditAction) => {
    switch (action) {
      case 'CREATE':
        return <Tag color="blue">CREATE</Tag>;
      case 'UPDATE':
        return <Tag color="orange">UPDATE</Tag>;
      case 'APPROVE':
        return <Tag color="green">APPROVE</Tag>;
      case 'REJECT':
        return <Tag color="red">REJECT</Tag>;
      case 'CANCEL':
        return <Tag color="magenta">CANCEL</Tag>;
      case 'LOGIN':
        return <Tag color="purple">LOGIN</Tag>;
      default:
        return <Tag color="default">{action}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Waktu Aktivitas',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (ts: string) => <Text strong style={{ fontSize: 12 }}>{ts}</Text>,
    },
    {
      title: 'Pengguna / User',
      dataIndex: 'userName',
      key: 'userName',
      render: (user: string) => <Text strong>{user}</Text>,
    },
    {
      title: 'Aksi (Action)',
      dataIndex: 'action',
      key: 'action',
      width: 130,
      render: (action: AuditAction) => getActionTag(action),
    },
    {
      title: 'Entitas & Ref ID',
      key: 'entity',
      render: (_: any, record: AuditLog) => (
        <div>
          <Text strong>{record.entityName}</Text>
          <Text code style={{ display: 'block', fontSize: 11 }}>
            ID: {record.entityId}
          </Text>
        </div>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (ip: string) => <Text type="secondary">{ip}</Text>,
    },
    {
      title: 'Request ID (UUID)',
      dataIndex: 'requestId',
      key: 'requestId',
      width: 160,
      render: (reqId: string) => <Text code style={{ fontSize: 11 }}>{reqId}</Text>,
    },
    {
      title: 'Inspeksi Diff',
      key: 'diff',
      width: 130,
      render: (_: any, record: AuditLog) => (
        <Button
          icon={<EyeOutlined />}
          size="small"
          onClick={() => handleOpenDiffModal(record)}
          data-testid={`btn-view-diff-${record.id}`}
        >
          Lihat Diff
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="audit-logs-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <AuditOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Viewer Audit Log Sistem (FE-503)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Penelusuran jejak audit aktivitas pengguna dan perubahan data entitas (JSON Diff Inspection).
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari User, Entitas, Ref ID, atau Request ID..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-audit"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedAction}
                onChange={(val) => setSelectedAction(val)}
                style={{ width: '100%' }}
                data-testid="select-action-filter"
                options={[
                  { value: 'all', label: 'Semua Aksi Audit' },
                  { value: 'CREATE', label: 'CREATE' },
                  { value: 'UPDATE', label: 'UPDATE' },
                  { value: 'APPROVE', label: 'APPROVE' },
                  { value: 'REJECT', label: 'REJECT' },
                  { value: 'CANCEL', label: 'CANCEL' },
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredLogs}
            pagination={{ pageSize: 10 }}
            data-testid="table-audit-logs"
          />
        </Card>
      </Space>

      {/* Side-by-Side JSON Diff Modal */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={
          <Space>
            <CodeOutlined style={{ color: '#0052cc' }} />
            <span>Inspeksi Perubahan Data JSON Diff (Audit #{selectedLog?.id})</span>
          </Space>
        }
        footer={[
          <Button key="close" onClick={() => setModalOpen(false)}>
            Tutup
          </Button>,
        ]}
        width={760}
        data-testid="modal-audit-diff"
      >
        {selectedLog && (
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <Row gutter={16}>
              <Col span={12}>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Pengguna / User</Text>
                <Text strong>{selectedLog.userName}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Waktu Aktivitas</Text>
                <Text strong>{selectedLog.timestamp}</Text>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Card title="Data Sebelum (Old Value)" type="inner">
                  <pre
                    style={{
                      background: '#fff2f0',
                      padding: 12,
                      borderRadius: 6,
                      fontSize: 12,
                      maxHeight: 240,
                      overflow: 'auto',
                    }}
                    data-testid="json-old-value"
                  >
                    {JSON.stringify(selectedLog.oldValue || 'null (Belum ada data)', null, 2)}
                  </pre>
                </Card>
              </Col>

              <Col span={12}>
                <Card title="Data Sesudah (New Value)" type="inner">
                  <pre
                    style={{
                      background: '#f6ffed',
                      padding: 12,
                      borderRadius: 6,
                      fontSize: 12,
                      maxHeight: 240,
                      overflow: 'auto',
                    }}
                    data-testid="json-new-value"
                  >
                    {JSON.stringify(selectedLog.newValue || 'null', null, 2)}
                  </pre>
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Modal>
    </div>
  );
};
