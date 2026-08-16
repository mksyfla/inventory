import React, { useState } from 'react';
import { Layout, ConfigProvider, Typography } from 'antd';
import idID from 'antd/locale/id_ID';
import { Outlet } from 'react-router-dom';
import { SidebarMenu } from '../components/SidebarMenu';
import { HeaderBar } from '../components/HeaderBar';
import { BreadcrumbNav } from '../components/BreadcrumbNav';
import { simbarTheme } from '../utils/theme';

const { Content, Footer } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <ConfigProvider locale={idID} theme={simbarTheme}>
      <Layout style={{ minHeight: '100vh' }} data-testid="app-layout">
        {/* Fixed Collapsible Sider */}
        <SidebarMenu collapsed={collapsed} />

        {/* Main Content Layout Container */}
        <Layout
          style={{
            marginLeft: collapsed ? 80 : 250,
            transition: 'margin-left 0.2s',
            background: '#f5f7fa',
          }}
        >
          {/* Top Header */}
          <HeaderBar collapsed={collapsed} onToggleCollapse={toggleCollapse} />

          {/* Body Content Area */}
          <Content style={{ padding: '0 24px 24px 24px' }}>
            <BreadcrumbNav />
            <div
              style={{
                marginTop: 16,
                minHeight: 360,
              }}
              data-testid="main-content-area"
            >
              <Outlet />
            </div>
          </Content>

          {/* Footer */}
          <Footer style={{ textAlign: 'center', background: '#f5f7fa', padding: '16px 24px' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              SIMBAR — Sistem Manajemen Barang & Distribusi ©2026 PT Perusahaan Umum Percetakan Uang Republik Indonesia
            </Text>
          </Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
