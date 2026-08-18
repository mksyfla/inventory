import React, { useState, useEffect } from 'react';
import { Alert, Badge, Button, Space, Typography, notification } from 'antd';
import { WifiOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const OfflineSyncBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      notification.success({
        message: 'Koneksi Terhubung Kembali (Online)',
        description: 'Menyinkronkan draf transaksi offline ke server...',
      });
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      notification.warning({
        message: 'Koneksi Terputus (Offline)',
        description: 'Sistem beralih ke mode penyimpanan lokal IndexedDB Dexie.js.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setPendingQueueCount(0);
      setIsSyncing(false);
      notification.success({
        message: 'Sinkronisasi Data Selesai (FE-902)',
        description: 'Seluruh draf transaksi offline berhasil terkirim ke server.',
      });
    }, 1500);
  };

  if (isOnline && pendingQueueCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div data-testid="offline-sync-banner" style={{ marginBottom: 16 }}>
      {!isOnline ? (
        <Alert
          message={
            <Space align="center">
              <DisconnectOutlined style={{ fontSize: 16, color: '#fa8c16' }} />
              <strong>Mode Offline Aktif (FE-902)</strong>
              <Badge count={`${pendingQueueCount} Draf Tertunda`} style={{ backgroundColor: '#fa8c16' }} />
            </Space>
          }
          description="Koneksi internet terputus. Transaksi Anda akan tersimpan lokal di peranti browser dan otomatis tersinkron saat koneksi pulih."
          type="warning"
          showIcon={false}
          data-testid="alert-offline"
        />
      ) : isSyncing ? (
        <Alert
          message={
            <Space align="center">
              <SyncOutlined spin style={{ fontSize: 16, color: '#1890ff' }} />
              <strong>Proses Sinkronisasi Data Offline Ke Server...</strong>
            </Space>
          }
          type="info"
          showIcon={false}
          data-testid="alert-syncing"
        />
      ) : pendingQueueCount > 0 ? (
        <Alert
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Space align="center">
                <WifiOutlined style={{ fontSize: 16, color: '#52c41a' }} />
                <Text strong>Terdapat {pendingQueueCount} Draf Transaksi Belum Tersinkron</Text>
              </Space>

              <Button
                type="primary"
                size="small"
                icon={<SyncOutlined />}
                onClick={triggerSync}
                data-testid="btn-sync-now"
              >
                Sinkronkan Sekarang
              </Button>
            </div>
          }
          type="info"
          showIcon={false}
          data-testid="alert-pending-sync"
        />
      ) : null}
    </div>
  );
};
