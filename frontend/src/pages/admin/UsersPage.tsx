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
import {
  UserAccount,
  userFormSchema,
  UserFormValues,
  MOCK_USER_LIST,
  MOCK_ROLE_LIST,
} from '../../types/admin';
import { MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const UsersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [users, setUsers] = useState<UserAccount[]>(MOCK_USER_LIST);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

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
      roles: ['Warehouse Manager'],
      assignedWarehouseIds: [1],
      isActive: true,
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

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    reset({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      roles: ['Warehouse Manager'],
      assignedWarehouseIds: [1],
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
      roles: user.roles,
      assignedWarehouseIds: user.assignedWarehouseIds,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const handleFormSubmit = (values: UserFormValues) => {
    const assignedWhNames = values.assignedWarehouseIds.map(
      (id) => MOCK_WAREHOUSES.find((w) => w.id === id)?.name || `Gudang #${id}`
    );

    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                ...values,
                assignedWarehouseNames: assignedWhNames,
              }
            : u
        )
      );

      notification.success({
        message: 'Pengguna Berhasil Diperbarui (FE-801)',
        description: `Akun ${values.username} telah sukses dikonfigurasi ulang.`,
      });
    } else {
      const newUser: UserAccount = {
        id: Date.now(),
        ...values,
        assignedWarehouseNames: assignedWhNames,
        lastLoginAt: 'Belum Pernah Login',
      };

      setUsers([newUser, ...users]);

      notification.success({
        message: 'Pengguna Baru Berhasil Dibuat (FE-801)',
        description: `Akun ${newUser.username} telah didaftarkan ke sistem SIMBAR WMS.`,
      });
    }

    setModalOpen(false);
  };

  const handleResetPassword = (user: UserAccount) => {
    notification.info({
      message: 'Reset Password Berhasil (FE-801)',
      description: `Instruksi tautan reset password telah dikirim ke email ${user.email}.`,
    });
  };

  const handleToggleStatus = (user: UserAccount) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
    );

    notification.success({
      message: 'Status Akun Diubah',
      description: `Akun ${user.username} kini berstatus ${!user.isActive ? 'AKTIF' : 'NON-AKTIF'}.`,
    });
  };

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
              {r}
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
          onChange={() => handleToggleStatus(record)}
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
            onClick={() => handleResetPassword(record)}
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
                    options={MOCK_ROLE_LIST.map((r) => ({ value: r.name, label: r.name }))}
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
                    options={MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))}
                  />
                )}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" data-testid="btn-submit-user">
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
