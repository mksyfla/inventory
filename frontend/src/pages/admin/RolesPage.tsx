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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleItem, roleFormSchema, RoleFormValues, PermissionItem } from '../../types/admin';
import { adminService } from '../../api/services/admin';
import { mapRoleSummaryDTO } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

// Backend permission codes are `resource.action`. Display name per code, with a
// human-readable domain derived from the resource prefix.
const PERMISSION_LABELS: Record<string, string> = {
  'item.read': 'Melihat Master Barang',
  'item.write': 'Mengelola Master Barang',
  'item.import': 'Import Master Barang',
  'location.read': 'Melihat Gudang & Lokasi',
  'location.write': 'Mengelola Gudang & Lokasi',
  'partner.read': 'Melihat Mitra & Pemasok',
  'partner.write': 'Mengelola Mitra & Pemasok',
  'stock.read': 'Melihat Stok & Kartu Stok',
  'grn.read': 'Melihat Penerimaan (GRN)',
  'grn.create': 'Membuat Penerimaan (GRN)',
  'grn.approve': 'Persetujuan GRN (Maker-Checker)',
  'do.read': 'Melihat Pengiriman (DO)',
  'do.create': 'Membuat Pengiriman (DO)',
  'do.approve': 'Persetujuan DO',
  'transfer.read': 'Melihat Mutasi Antar Gudang',
  'transfer.create': 'Membuat Mutasi Antar Gudang',
  'transfer.approve': 'Persetujuan Mutasi',
  'request.read': 'Melihat Permintaan Barang',
  'request.create': 'Membuat Permintaan Barang',
  'request.approve': 'Persetujuan Permintaan',
  'count.read': 'Melihat Stock Opname',
  'count.create': 'Membuat Stock Opname',
  'count.execute': 'Eksekusi Stock Opname',
  'count.approve': 'Persetujuan Stock Opname',
  'adj.read': 'Melihat Penyesuaian Stok',
  'adj.create': 'Membuat Penyesuaian Stok',
  'adj.approve': 'Persetujuan Penyesuaian Stok',
  'report.read': 'Melihat Laporan & Analitik',
  'dashboard.read': 'Melihat Dashboard',
  'audit.read': 'Melihat Log Audit',
  'user.write': 'Mengelola User',
  'role.write': 'Mengelola Role',
  'settings.read': 'Melihat Pengaturan',
  'settings.write': 'Mengelola Pengaturan',
};

const DOMAIN_LABELS: Record<string, string> = {
  item: 'Master Barang',
  location: 'Master Gudang & Lokasi',
  partner: 'Mitra & Pemasok',
  stock: 'Stok',
  grn: 'Penerimaan (GRN)',
  do: 'Pengiriman (DO)',
  transfer: 'Mutasi Antar Gudang',
  request: 'Permintaan Barang',
  count: 'Stock Opname',
  adj: 'Penyesuaian Stok',
  report: 'Laporan & Analitik',
  dashboard: 'Dashboard',
  audit: 'Audit Trail',
  user: 'Manajemen User',
  role: 'Manajemen Role',
  settings: 'Pengaturan Sistem',
};

const permissionLabel = (code: string) =>
  PERMISSION_LABELS[code] ?? code.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const domainOf = (code: string) => {
  const resource = code.split('.')[0];
  return DOMAIN_LABELS[resource] ?? resource.toUpperCase();
};

export const RolesPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Real roles from the backend.
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const dtos = await adminService.listRoles();
      return dtos.map(mapRoleSummaryDTO);
    },
  });

  // Real permission catalog from the backend.
  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const dtos = await adminService.listPermissions();
      return dtos.map((p) => ({ key: p.code, name: permissionLabel(p.code), domain: domainOf(p.code) }));
    },
  });

  const permissionsByDomain = permissions.reduce((acc, p) => {
    if (!acc[p.domain]) acc[p.domain] = [];
    acc[p.domain].push(p);
    return acc;
  }, {} as Record<string, PermissionItem[]>);

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

  const saveRole = useMutation({
    mutationFn: async (values: RoleFormValues) => {
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        permissions: values.permissions,
      };
      if (editingRole) {
        await adminService.updateRole(editingRole.id, payload);
      } else {
        await adminService.createRole(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      notification.success({
        message: editingRole ? 'Peran (Role) Berhasil Diperbarui' : 'Peran (Role) Baru Berhasil Dibuat',
        description: `Matriks izin akses untuk ${editingRole?.name ?? ''} telah disimpan ke database.`,
      });
      setModalOpen(false);
    },
    onError: () => {
      notification.error({
        message: 'Gagal Menyimpan Peran',
        description: 'Periksa koneksi dan data, lalu coba lagi.',
      });
    },
  });

  const handleFormSubmit = (values: RoleFormValues) => {
    saveRole.mutate(values);
  };

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
            loading={isLoading}
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
                // Single Checkbox.Group so every permission registers with the
                // same group — a separate group per domain would have its
                // onChange filter out permissions from other domains (antd
                // drops any value not registered inside the group).
                <Checkbox.Group
                  value={field.value}
                  onChange={(checkedValues) => field.onChange(checkedValues)}
                  style={{ width: '100%' }}
                >
                  <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 8 }}>
                    {Object.entries(permissionsByDomain).map(([domain, perms]) => (
                      <Card
                        key={domain}
                        type="inner"
                        title={domain}
                        style={{ marginBottom: 12 }}
                        size="small"
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
                      </Card>
                    ))}
                  </div>
                </Checkbox.Group>
              )}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={saveRole.isPending}
                  data-testid="btn-submit-role"
                >
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
