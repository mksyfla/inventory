import React from 'react';
import { Breadcrumb } from 'antd';
import { useLocation, Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

const ROUTE_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  master: 'Master Data',
  items: 'Data Barang (SKU)',
  locations: 'Lokasi Bin & Gudang',
  partners: 'Mitra & Pemasok',
  inbound: 'Inbound',
  receipts: 'Penerimaan GRN',
  putaway: 'Putaway Scan',
  outbound: 'Outbound',
  requests: 'Permintaan Barang',
  deliveries: 'Surat Jalan (DO)',
  transfer: 'Mutasi Antar Gudang',
  stock: 'Stok & Ledger',
  balances: 'Saldo Stok Real-Time',
  card: 'Kartu Stok',
  counting: 'Stock Opname',
  reports: 'Laporan & Analytics',
  admin: 'Administrasi RBAC',
  users: 'Kelola Pengguna',
  roles: 'Peran & Izin',
  'audit-logs': 'Audit Log',
};

export const BreadcrumbNav: React.FC = () => {
  const location = useLocation();
  const pathSnippets = location.pathname.split('/').filter((i) => i);

  const breadcrumbItems = [
    {
      title: (
        <Link to="/dashboard" data-testid="breadcrumb-home">
          <HomeOutlined />
        </Link>
      ),
    },
    ...pathSnippets.map((snippet, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
      const title = ROUTE_MAP[snippet] || snippet;
      const isLast = index === pathSnippets.length - 1;

      return {
        title: isLast ? (
          <span data-testid="breadcrumb-active">{title}</span>
        ) : (
          <Link to={url}>{title}</Link>
        ),
      };
    }),
  ];

  return (
    <Breadcrumb
      data-testid="breadcrumb-nav"
      style={{ margin: '16px 0 0 0' }}
      items={breadcrumbItems}
    />
  );
};
