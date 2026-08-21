import React, { useState, useEffect, useCallback } from 'react';
import { Alert, Badge, Button, Space, Typography, notification } from 'antd';
import { WifiOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';
import { offlineDb, SyncQueueItem } from '../../db/offlineDb';
import { apiClient } from '../../api/client';

const { Text } = Typography;

export const OfflineSyncBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await offlineDb.syncQueue.where('status').equals('pending').count();
      setPendingQueueCount(count);
    } catch {
      // IndexedDB might not be available
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const pendingItems: SyncQueueItem[] = await offlineDb.syncQueue
        .where('status')
        .equals('pending')
        .toArray();

      if (pendingItems.length === 0) {
        setIsSyncing(false);
        setPendingQueueCount(0);
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of pendingItems) {
        if (!item.id) continue;
        await offlineDb.syncQueue.update(item.id, { status: 'syncing' });

        try {
          await apiClient.request({
            url: item.endpoint,
            method: item.method,
            data: item.payload,
            headers: {
              'Idempotency-Key': item.idempotencyKey,
            },
          });

          await offlineDb.syncQueue.update(item.id, { status: 'completed' });
          successCount++;
        } catch {
          const retries = (item.retryCount || 0) + 1;
          await offlineDb.syncQueue.update(item.id, {
            status: retries >= 3 ? 'failed' : 'pending',
            retryCount: retries,
          });
          failCount++;
        }
      }

      await refreshPendingCount();

      if (successCount > 0 && failCount === 0) {
        notification.success({
          message: 'Sinkronisasi Data Selesai (FE-902)',
          description: `Sebanyak ${successCount} draf transaksi offline berhasil disinkronkan ke server.`,
        });
      } else if (failCount > 0) {
        notification.warning({
          message: 'Sinkronisasi Sebagian Berhasil',
          description: `${successCount} draf terkirim, ${failCount} draf gagal dan akan dicoba kembali.`,
        });
      }
    } catch (err) {
      notification.error({
        message: 'Gagal Menyinkronkan Data',
        description: 'Terjadi kesalahan saat memproses antrean draf offline.',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();

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
      refreshPendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check for offline queue changes
    const interval = setInterval(refreshPendingCount, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount, triggerSync]);

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
