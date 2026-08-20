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
  Switch,
  notification,
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  KeyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserAccount, userFormSchema, UserFormValues } from '../../types/admin';
import { adminService } from '../../api/services/admin';
import { warehouseService } from '../../api/services/warehouses';
import { mapRoleSummaryDTO, mapUserSummaryDTO, mapWarehouseDTO } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const UsersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const queryClient = useQueryClient();

  // Real users from the backend (GET /users).
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const dtos = await adminService.listUsers();
      return dtos.map(mapUserSummaryDTO);
    },
  });

  // Role options (code → name) for the assignment select + display lookup.
  const { data: roleOptions = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const dtos = await adminService.listRoles();
      return dtos.map(mapRoleSummaryDTO);
    },
  });
  const roleNameByCode = new Map(roleOptions.map((r) => [r.code, r.name]));
  const roleSelectOptions = roleOptions.map((r) => ({ value: r.code, label: r.name }));

  // Real warehouses for the assignment select.
  const { data: warehouseOptions = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const dtos = await warehouseService.list();
      return dtos.map(mapWarehouseDTO);
    },
  });
  const warehouseSelectOptions = warehouseOptions.map((w) => ({ value: w.id, label: w.name }));

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      roles: [],
      assignedWarehouseIds: [],
      isActive: true,
    },
  });

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const saveUser = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (editingUser) {
        await adminService.updateUser(editingUser.id, {
          full_name: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
          password: values.password || undefined,
          is_active: values.isActive,
          roles: values.roles,
          warehouse_ids: values.assignedWarehouseIds,
        });
      } else {
        await adminService.createUser({
          username: values.username,
          full_name: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
          password: values.password || '',
          is_active: values.isActive,
          roles: values.roles,
          warehouse_ids: values.assignedWarehouseIds,
        });
      }
    },
    onSuccess: () => {
      invalidateLists();
      notification.success({
        message: editingUser ? 'Pengguna Berhasil Diperbarui' : 'Pengguna Baru Berhasil Dibuat',
        description: `Perubahan akun telah disimpan ke database.`,
      });
      setModalOpen(false);
    },
    onError: () => {
      notification.error({
        message: 'Gagal Menyimpan Pengguna',
        description: 'Periksa koneksi dan data, lalu coba lagi.',
      });
    },
  });

  const handleFormSubmit = (values: UserFormValues) => {
    if (!editingUser && (!values.password || values.password.length < 6)) {
      notification.error({
        message: 'Password Wajib Diisi',
        description: 'Password minimal 6 karakter saat membuat pengguna baru.',
      });
      return;
    }
    saveUser.mutate(values);
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    reset({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      roles: [],
      assignedWarehouseIds: [],
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (user: UserAccount) => {
    setEditingUser(user);
    reset({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      password: '',
      roles: user.roles,
      assignedWarehouseIds: user.assignedWarehouseIds,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const toggleStatus = useMutation({
    mutationFn: (user: UserAccount) =>
      adminService.updateUser(user.id, {
        full_name: user.fullName,
        email: user.email,
        phone: user.phone || undefined,
        is_active: !user.isActive,
        roles: user.roles,
        warehouse_ids: user.assignedWarehouseIds,
      }),
    onSuccess: (_data, user) => {
      invalidateLists();
      notification.success({
        message: 'Status Akun Diubah',
        description: `Akun ${user.username} kini berstatus ${user.isActive ? 'NON-AKTIF' : 'AKTIF'}.`,
      });
    },
    onError: () => {
      notification.error({
        message: 'Gagal Mengubah Status',
        description: 'Perubahan status tidak tersimpan.',
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (user: UserAccount) => {
      const tempPassword = `Reset@${Math.floor(1000 + Math.random() * 9000)}`;
      return adminService
        .updateUser(user.id, {
          full_name: user.fullName,
          email: user.email,
          phone: user.phone || undefined,
          password: tempPassword,
          is_active: user.isActive,
          roles: user.roles,
          warehouse_ids: user.assignedWarehouseIds,
        })
        .then(() => tempPassword);
    },
    onSuccess: (tempPassword, user) => {
      notification.success({
        message: 'Password Direset',
        description: `Password sementara untuk ${user.username}: ${tempPassword}`,
      });
    },
    onError: () => {
      notification.error({
        message: 'Gagal Reset Password',
        description: 'Reset password tidak tersimpan.',
      });
    },
  });

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'active' && u.isActive) ||
      (selectedStatus === 'inactive' && !u.isActive);

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (un: string) => (
        <Space align="center">
          <UserOutlined style={{ color: '#0052cc' }} />
          <Text strong>{un}</Text>
        </Space>
      ),
    },
    {
      title: 'Nama Lengkap & Email',
      key: 'userinfo',
      render: (_: any, record: UserAccount) => (
        <div>
          <Text strong>{record.fullName}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
            {record.email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Peran (Role)',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: string[]) => (
        <Space wrap>
          {roles.map((r) => (
            <Tag color="purple" key={r}>
              {roleNameByCode.get(r) ?? r}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Penugasan Gudang',
      dataIndex: 'assignedWarehouseNames',
      key: 'assignedWarehouseNames',
      render: (whs: string[]) => (
        <Space wrap>
          {whs.map((w) => (
            <Tag color="blue" key={w}>
              {w}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      render: (active: boolean, record: UserAccount) => (
        <Switch
          checked={active}
          onChange={() => toggleStatus.mutate(record)}
          checkedChildren="Aktif"
          unCheckedChildren="Non-Aktif"
        />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 180,
      render: (_: any, record: UserAccount) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleOpenEditModal(record)}
            data-testid={`btn-edit-user-${record.id}`}
          >
            Edit
          </Button>

          <Button
            icon={<KeyOutlined />}
            size="small"
            onClick={() => resetPassword.mutate(record)}
            data-testid={`btn-reset-password-${record.id}`}
          >
            Reset
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="users-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <CheckCircleOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Manajemen Pengguna & Akun (FE-801)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Kelola hak akses akun pengguna, penugasan gudang, dan peran dalam sistem.
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              data-testid="btn-create-user"
            >
              Tambah Pengguna Baru
            </Button>
          </Col>
        </Row>

        <Card variant="borderless">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Cari Username, Nama, atau Email..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                data-testid="input-search-users"
              />
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Select
                value={selectedStatus}
                onChange={(val) => setSelectedStatus(val)}
                style={{ width: '100%' }}
                data-testid="select-status-filter"
                options={[
                  { value: 'all', label: 'Semua Status Akun' },
                  { value: 'active', label: 'Aktif' },
                  { value: 'inactive', label: 'Non-Aktif' },
                ]}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredUsers}
            loading={isLoading}
            pagination={{ pageSize: 10 }}
            data-testid="table-users"
          />
        </Card>
      </Space>

      {/* Modal Form User */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={editingUser ? 'Edit Akun Pengguna (FE-801)' : 'Tambah Pengguna Baru (FE-801)'}
        footer={null}
        destroyOnHidden
        data-testid="modal-user-form"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="form-user">
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Username <Text type="danger">*</Text>
              </label>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: dipo.manager"
                    status={errors.username ? 'error' : ''}
                    disabled={!!editingUser}
                    data-testid="input-user-username"
                  />
                )}
              />
              {errors.username && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  {errors.username.message}
                </Text>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Lengkap <Text type="danger">*</Text>
              </label>
              <Controller
                name="fullName"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: Dipo Inventory"
                    status={errors.fullName ? 'error' : ''}
                    data-testid="input-user-fullname"
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Email Perusahaan <Text type="danger">*</Text>
              </label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="user@peruri.co.id"
                    status={errors.email ? 'error' : ''}
                    data-testid="input-user-email"
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nomor Telepon
              </label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <Input {...field} placeholder="08xxxxxxxxxx" data-testid="input-user-phone" />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Password {!editingUser && <Text type="danger">*</Text>}
              </label>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <Input.Password
                    {...field}
                    placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                    status={errors.password ? 'error' : ''}
                    data-testid="input-user-password"
                  />
                )}
              />
              {editingUser && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Kosongkan untuk mempertahankan password lama.
                </Text>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Peran (Role) Akses <Text type="danger">*</Text>
              </label>
              <Controller
                name="roles"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    mode="multiple"
                    style={{ width: '100%' }}
                    data-testid="select-user-roles"
                    options={roleSelectOptions}
                    placeholder="Pilih peran akses"
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Penugasan Gudang <Text type="danger">*</Text>
              </label>
              <Controller
                name="assignedWarehouseIds"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    mode="multiple"
                    style={{ width: '100%' }}
                    data-testid="select-user-warehouses"
                    options={warehouseSelectOptions}
                    placeholder="Pilih gudang"
                  />
                )}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Status Akun
              </label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onChange={(val) => field.onChange(val)}
                    checkedChildren="Aktif"
                    unCheckedChildren="Non-Aktif"
                    data-testid="switch-user-active"
                  />
                )}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={saveUser.isPending}
                  data-testid="btn-submit-user"
                >
                  Simpan Pengguna
                </Button>
              </Space>
            </div>
          </Space>
        </form>
      </Modal>
    </div>
  );
};
