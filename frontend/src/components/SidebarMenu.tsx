import React from 'react';
import { Layout, Menu, Typography, MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  DatabaseOutlined,
  ImportOutlined,
  ExportOutlined,
  SwapOutlined,
  BarChartOutlined,
  AuditOutlined,
  UsergroupAddOutlined,
  InboxOutlined,
  FileTextOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;
const { Title } = Typography;

interface SidebarMenuProps {
  collapsed: boolean;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard Operasional',
    },
    {
      key: 'master',
      icon: <DatabaseOutlined />,
      label: 'Master Data',
      children: [
        { key: '/master/items', label: 'Data Barang / SKU' },
        { key: '/master/locations', label: 'Lokasi Bin & Gudang' },
        { key: '/master/partners', label: 'Mitra & Pemasok' },
      ],
    },
    {
      key: 'inbound',
      icon: <ImportOutlined />,
      label: 'Inbound (Penerimaan)',
      children: [
        { key: '/inbound/receipts', label: 'Penerimaan GRN' },
        { key: '/inbound/putaway', label: 'Putaway Scan Bin' },
      ],
    },
    {
      key: 'outbound',
      icon: <ExportOutlined />,
      label: 'Outbound (Pengeluaran)',
      children: [
        { key: '/outbound/requests', label: 'Permintaan Barang' },
        { key: '/outbound/deliveries', label: 'Surat Jalan (DO)' },
      ],
    },
    {
      key: '/transfer',
      icon: <SwapOutlined />,
      label: 'Mutasi Antar Gudang',
    },
    {
      key: 'stock',
      icon: <InboxOutlined />,
      label: 'Stok & Buku Besar',
      children: [
        { key: '/stock/balances', label: 'Saldo Stok Real-Time' },
        { key: '/stock/card', label: 'Kartu Stok Ledger' },
      ],
    },
    {
      key: '/counting',
      icon: <FileTextOutlined />,
      label: 'Stock Opname',
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: 'Laporan & Analytics',
    },
    {
      key: 'admin',
      icon: <UsergroupAddOutlined />,
      label: 'Administrasi RBAC',
      children: [
        { key: '/admin/users', label: 'Kelola Pengguna' },
        { key: '/admin/roles', label: 'Peran & Izin' },
        { key: '/admin/audit-logs', label: 'Audit Log' },
      ],
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key);
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      trigger={null}
      width={250}
      data-testid="sidebar-sider"
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 20,
        boxShadow: '2px 0 8px rgba(0,21,41,0.15)',
      }}
    >
      {/* Brand Logo Header */}
      <div
        data-testid="brand-logo"
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 20px',
          background: '#002140',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'all 0.2s',
        }}
      >
        <AuditOutlined style={{ fontSize: 24, color: '#1890ff' }} />
        {!collapsed && (
          <Title
            level={4}
            style={{
              color: '#ffffff',
              margin: '0 0 0 12px',
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            SIMBAR
          </Title>
        )}
      </div>

      {/* Navigation Menu */}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        defaultOpenKeys={['master', 'inbound', 'outbound', 'stock', 'admin']}
        onClick={handleMenuClick}
        items={menuItems}
        data-testid="sidebar-menu"
      />
    </Sider>
  );
};
