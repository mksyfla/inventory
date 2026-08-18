import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Modal,
  Checkbox,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  notification,
} from 'antd';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  EditOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  RoleItem,
  roleFormSchema,
  RoleFormValues,
  MOCK_ROLE_LIST,
  MOCK_PERMISSIONS_MATRIX,
} from '../../types/admin';

const { Title, Paragraph, Text } = Typography;

export const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>(MOCK_ROLE_LIST);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);

  const {
    control,
    handleSubmit,
    reset,
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      permissions: ['dashboard.read', 'item.read'],
    },
  });

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    reset({
      code: '',
      name: '',
      description: '',
      permissions: ['dashboard.read', 'item.read'],
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (role: RoleItem) => {
    setEditingRole(role);
    reset({
      code: role.code,
      name: role.name,
      description: role.description || '',
      permissions: role.permissions,
    });
    setModalOpen(true);
  };

  const handleFormSubmit = (values: RoleFormValues) => {
    if (editingRole) {
      setRoles((prev) =>
        prev.map((r) => (r.id === editingRole.id ? { ...r, ...values } : r))
      );

      notification.success({
        message: 'Peran (Role) Berhasil Diperbarui (FE-802)',
        description: `Konfigurasi izin matriks untuk ${values.name} telah disimpan.`,
      });
    } else {
      const newRole: RoleItem = {
        id: Date.now(),
        ...values,
        isSystem: false,
      };

      setRoles([...roles, newRole]);

      notification.success({
        message: 'Peran (Role) Baru Berhasil Dibuat (FE-802)',
        description: `Peran ${newRole.name} telah resmi ditambahkan ke matriks otorisasi.`,
      });
    }

    setModalOpen(false);
  };

  // Group permissions by domain for checkbox matrix
  const permissionsByDomain = MOCK_PERMISSIONS_MATRIX.reduce((acc, p) => {
    if (!acc[p.domain]) acc[p.domain] = [];
    acc[p.domain].push(p);
    return acc;
  }, {} as Record<string, typeof MOCK_PERMISSIONS_MATRIX>);

  const columns = [
    {
      title: 'Kode Peran',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text strong style={{ color: '#0052cc' }}>{code}</Text>,
    },
    {
      title: 'Nama Peran (Role)',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: RoleItem) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isSystem && (
            <Tag color="gold" icon={<LockOutlined />}>
              System Default
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Jumlah Izin Akses',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 160,
      render: (perms: string[]) => (
        <Tag color="purple">
          {perms.length} Izin Terkonfigurasi
        </Tag>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 120,
      render: (_: any, record: RoleItem) => (
        <Button
          icon={<EditOutlined />}
          size="small"
          onClick={() => handleOpenEditModal(record)}
          data-testid={`btn-edit-role-${record.id}`}
        >
          Konfigurasi
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="roles-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <SafetyCertificateOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Peran & Matriks Izin Akses Granular (FE-802)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Konfigurasi otorisasi Role-Based Access Control (RBAC) per modul & domain aksi.
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              data-testid="btn-create-role"
            >
              Tambah Peran Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={roles}
            pagination={false}
            data-testid="table-roles"
          />
        </Card>
      </Space>

      {/* Modal Form Role & Permission Matrix */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={editingRole ? 'Konfigurasi Matriks Peran (FE-802)' : 'Tambah Peran Baru (FE-802)'}
        footer={null}
        width={760}
        destroyOnHidden
        data-testid="modal-role-form"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="form-role">
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <Row gutter={16}>
              <Col span={12}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Kode Peran <Text type="danger">*</Text>
                </label>
                <Controller
                  name="code"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="Contoh: AUDITOR_OFFICER"
                      disabled={editingRole?.isSystem}
                      data-testid="input-role-code"
                    />
                  )}
                />
              </Col>

              <Col span={12}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Nama Peran <Text type="danger">*</Text>
                </label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} placeholder="Contoh: Auditor Lapangan" data-testid="input-role-name" />
                  )}
                />
              </Col>

              <Col span={24}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Deskripsi Peran</label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} placeholder="Deskripsi tugas dan wewenang" data-testid="input-role-desc" />
                  )}
                />
              </Col>
            </Row>

            {/* Granular Permission Matrix Grouped by Domain */}
            <Title level={5} style={{ marginTop: 12 }}>
              Matriks Izin Akses Granular (Permission Matrix)
            </Title>

            <Controller
              name="permissions"
              control={control}
              render={({ field }) => (
                <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 8 }}>
                  {Object.entries(permissionsByDomain).map(([domain, perms]) => (
                    <Card
                      key={domain}
                      type="inner"
                      title={domain}
                      style={{ marginBottom: 12 }}
                      size="small"
                    >
                      <Checkbox.Group
                        value={field.value}
                        onChange={(checkedValues) => field.onChange(checkedValues)}
                        style={{ width: '100%' }}
                      >
                        <Row gutter={[12, 12]}>
                          {perms.map((p) => (
                            <Col span={12} key={p.key}>
                              <Checkbox value={p.key} data-testid={`checkbox-perm-${p.key}`}>
                                <Text strong>{p.name}</Text>
                                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                                  key: {p.key}
                                </Text>
                              </Checkbox>
                            </Col>
                          ))}
                        </Row>
                      </Checkbox.Group>
                    </Card>
                  ))}
                </div>
              )}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" data-testid="btn-submit-role">
                  Simpan Matriks Peran
                </Button>
              </Space>
            </div>
          </Space>
        </form>
      </Modal>
    </div>
  );
};
