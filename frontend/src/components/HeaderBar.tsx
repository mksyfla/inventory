import React from 'react';
import { Layout, Button, Select, Badge, Avatar, Dropdown, MenuProps, Space, Typography, Tag } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  HomeOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { useAuthStore } from '../store/useAuthStore';
import { useOfflineDraft } from '../hooks/useOfflineDraft';

const { Header } = Layout;
const { Text } = Typography;

interface HeaderBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ collapsed, onToggleCollapse }) => {
  const { warehouses, activeWarehouseId, setActiveWarehouseId } = useWarehouseStore();
  const { user, logout } = useAuthStore();
  const { isOnline } = useOfflineDraft();

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: (
        <div>
          <div><strong>{user?.fullName || 'User'}</strong></div>
          <Text type="secondary" style={{ fontSize: 12 }}>{user?.email}</Text>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Pengaturan Akun',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      danger: true,
      label: 'Keluar (Logout)',
      onClick: logout,
    },
  ];

  return (
    <Header
      data-testid="header-bar"
      style={{
        padding: '0 24px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        height: 64,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Left side: Toggle button & Active Warehouse Selector */}
      <Space size={16} align="center">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleCollapse}
          data-testid="sidebar-toggle-btn"
          style={{
            fontSize: '18px',
            width: 40,
            height: 40,
          }}
        />

        <Space align="center" style={{ marginLeft: 8 }}>
          <Tag color={isOnline ? 'success' : 'warning'} data-testid="network-status-tag">
            {isOnline ? 'Online' : 'Offline — Mode Draft'}
          </Tag>
          <HomeOutlined style={{ color: '#0052cc', fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>Gudang Aktif:</Text>
          <Select
            data-testid="warehouse-select"
            value={activeWarehouseId}
            onChange={(val) => setActiveWarehouseId(Number(val))}
            style={{ width: 230 }}
            options={warehouses.map((w) => ({
              value: w.id,
              label: (
                <Space>
                  <Tag color="blue">{w.code}</Tag>
                  <span>{w.name}</span>
                </Space>
              ),
            }))}
          />
        </Space>
      </Space>

      {/* Right side: Notification badge & User Profile Dropdown */}
      <Space size={20} align="center">
        <Badge count={3} overflowCount={99}>
          <Button
            type="text"
            shape="circle"
            icon={<BellOutlined style={{ fontSize: 18 }} />}
            data-testid="notification-btn"
          />
        </Badge>

        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }} data-testid="user-profile-dropdown">
            <Avatar style={{ backgroundColor: '#0052cc' }} icon={<UserOutlined />} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <Text strong style={{ fontSize: 13 }}>{user?.fullName || 'Staf Gudang'}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>Manager / Admin</Text>
            </div>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};
