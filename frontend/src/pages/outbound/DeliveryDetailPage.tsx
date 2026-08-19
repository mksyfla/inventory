import React, { useState, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Table,
  Steps,
  Alert,
  Tooltip,
  Tabs,
  notification,
  Spin,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  ScanOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  PrinterOutlined,
  FileProtectOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DeliveryOrder,
  DeliveryStatus,
  DeliveryItemLine,
  StockAllocation,
  PODData,
  getDeliveryStatusTagColor,
} from '../../types/outbound';
import { documentService } from '../../api/services/documents';
import { outboundService } from '../../api/services/outbound';
import { mapDocumentToDeliveryOrder } from '../../api/mappers';
import {
  OverrideAllocationModal,
  OverrideAllocationFormValues,
} from '../../components/outbound/OverrideAllocationModal';
import { DeliveryPackingTab } from '../../components/outbound/DeliveryPackingTab';
import { DeliveryPrintModal } from '../../components/outbound/DeliveryPrintModal';
import { PODUploadModal } from '../../components/outbound/PODUploadModal';

const { Title, Paragraph, Text } = Typography;

export const DeliveryDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Load the live DO header + lines from the backend document store.
  const { data: loadedDelivery, isLoading } = useQuery({
    queryKey: ['delivery-detail', id],
    queryFn: async () => {
      const dto = await documentService.getDetail(Number(id));
      return mapDocumentToDeliveryOrder(dto, dto.lines);
    },
    enabled: !!id,
  });

  // Local overrides for the demo-flow state machine. FEFO allocation is
  // persisted on the backend (allocateDelivery); picking/packing/ship/POD
  // transitions remain UI-only for now.
  const [localStatus, setLocalStatus] = useState<DeliveryStatus | null>(null);
  const [localItems, setLocalItems] = useState<DeliveryItemLine[] | null>(null);
  const [localDriver, setLocalDriver] = useState<{
    driverName?: string;
    vehiclePlateNo?: string;
    shippingNotes?: string;
  }>({});
  const [localPod, setLocalPod] = useState<PODData | undefined>(undefined);
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [podModalOpen, setPodModalOpen] = useState<boolean>(false);
  const [targetItemIndex, setTargetItemIndex] = useState<number>(0);

  const delivery: DeliveryOrder | undefined = useMemo(() => {
    if (!loadedDelivery) return undefined;
    return {
      ...loadedDelivery,
      status: localStatus ?? loadedDelivery.status,
      items: localItems ?? loadedDelivery.items,
      driverName: localDriver.driverName ?? loadedDelivery.driverName,
      vehiclePlateNo: localDriver.vehiclePlateNo ?? loadedDelivery.vehiclePlateNo,
      shippingNotes: localDriver.shippingNotes ?? loadedDelivery.shippingNotes,
      pod: localPod ?? loadedDelivery.pod,
    };
  }, [loadedDelivery, localStatus, localItems, localDriver, localPod]);

  const handleRunFefoAllocation = async () => {
    try {
      const baseItems = localItems ?? loadedDelivery?.items ?? [];
      const results = await outboundService.allocateDelivery(
        Number(id),
        baseItems.map((item) => ({ line_id: item.id, qty: item.qtyOrdered }))
      );
      const allocatedItems = baseItems.map((item) => {
        const allocations = results
          .filter((r) => r.line_id === item.id)
          .map((r) => ({
            id: r.allocation_id,
            deliveryItemId: item.id,
            batchNo: r.batch_id != null ? `LOT-${r.batch_id}` : '-',
            locationCode: r.location_code,
            qtyAllocated: r.qty_allocated,
            isOverridden: false,
          }));
        const qtyAllocated = allocations.reduce((acc, a) => acc + a.qtyAllocated, 0);
        return { ...item, qtyAllocated, allocations };
      });
      setLocalItems(allocatedItems);
      setLocalStatus('allocated');
      notification.success({
        message: 'Alokasi Stok FEFO/FIFO Berhasil Di-Trigger',
        description: 'Stok barang berdasarkan batch terdekat expiry date telah ter-reserve.',
      });
    } catch {
      notification.error({
        message: 'Alokasi FEFO Gagal',
        description: 'Terjadi kesalahan saat memanggil endpoint alokasi server.',
      });
    }
  };

  const handleStateTransition = (nextStatus: DeliveryStatus, actionLabel: string) => {
    setLocalStatus(nextStatus);
    notification.success({
      message: `Status Delivery Order Diperbarui`,
      description: `Dokumen ${delivery?.doNo ?? ''} telah berhasil diubah menjadi '${actionLabel}'.`,
    });
  };

  const handlePostShipment = (driverName: string, vehiclePlateNo: string, shippingNotes?: string) => {
    setLocalDriver({ driverName, vehiclePlateNo, shippingNotes });
    setLocalStatus('shipped');
    notification.success({
      message: 'Posting Pengeluaran Barang / Ship Berhasil',
      description: `Surat Jalan ${delivery?.doNo ?? ''} resmi dikirim oleh driver ${driverName} (${vehiclePlateNo}).`,
    });
  };

  const handleSubmitPOD = (podData: PODData) => {
    setLocalPod(podData);
    setLocalStatus('delivered');
    setPodModalOpen(false);
    notification.success({
      message: 'Bukti Serah Terima (POD) Berhasil Disimpan',
      description: `Surat Jalan ${delivery?.doNo ?? ''} telah diterima oleh ${podData.receivedBy}. Status DO menjadi Delivered.`,
    });
  };

  const handleOpenOverrideModal = (itemIndex: number) => {
    setTargetItemIndex(itemIndex);
    setOverrideModalOpen(true);
  };

  const handleSaveOverrideAllocation = (values: OverrideAllocationFormValues) => {
    const currentItems = localItems ?? loadedDelivery?.items ?? [];
    const updatedItems = [...currentItems];
    const item = updatedItems[targetItemIndex];
    if (item && item.allocations.length > 0) {
      const firstAlloc = item.allocations[0];
      item.allocations = [
        {
          ...firstAlloc,
          batchNo: values.alternativeBatchNo,
          locationCode: values.alternativeLocationCode,
          isOverridden: true,
          overrideReason: `[${values.reasonCode}]: ${values.notes}`,
        },
      ];
    }
    setLocalItems(updatedItems);
    setOverrideModalOpen(false);
    notification.warning({
      message: 'Manual Override FEFO Berhasil Diterapkan',
      description: `Alokasi batch barang untuk ${currentItems[targetItemIndex]?.sku} disesuaikan secara manual.`,
    });
  };

  const getStepCurrentIndex = (status: DeliveryStatus) => {
    switch (status) {
      case 'draft':
        return 0;
      case 'allocated':
        return 1;
      case 'picking_in_progress':
      case 'picked':
        return 2;
      case 'packed':
        return 3;
      case 'shipped':
      case 'partially_delivered':
        return 4;
      case 'delivered':
        return 5;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  };

  if (isLoading) {
    return (
      <div data-testid="delivery-detail-page" style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div data-testid="delivery-detail-page">
        <Empty description="Delivery Order tidak ditemukan." />
      </div>
    );
  }

  const currentTargetItem = delivery.items[targetItemIndex] || delivery.items[0];

  const columns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang SKU',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Satuan',
      dataIndex: 'uom',
      key: 'uom',
      width: 90,
      render: (uom: string) => <Tag color="blue">{uom}</Tag>,
    },
    {
      title: 'Qty Order',
      dataIndex: 'qtyOrdered',
      key: 'qtyOrdered',
      width: 110,
      render: (qty: number) => <Text strong>{qty}</Text>,
    },
    {
      title: 'Qty Teralokasi FEFO',
      dataIndex: 'qtyAllocated',
      key: 'qtyAllocated',
      width: 150,
      render: (qty: number) =>
        qty > 0 ? <Text type="success" strong>{qty}</Text> : <Text type="secondary">0 (Belum Alokasi)</Text>,
    },
    {
      title: 'Detail Rincian Batch & Bin',
      key: 'allocationDetails',
      render: (_: any, record: any, idx: number) => (
        <div>
          {record.allocations.length > 0 ? (
            record.allocations.map((alloc: StockAllocation) => (
              <div key={alloc.id} style={{ marginBottom: 4 }}>
                <Space wrap>
                  <Text code>Batch: {alloc.batchNo}</Text>
                  {alloc.expiryDate && <Text type="secondary" style={{ fontSize: 11 }}>Exp: {alloc.expiryDate}</Text>}
                  <Tag icon={<EnvironmentOutlined />} color="green">{alloc.locationCode}</Tag>
                  <Text strong>({alloc.qtyAllocated} {record.uom})</Text>
                  {alloc.isOverridden && (
                    <Tooltip title={alloc.overrideReason}>
                      <Tag color="warning" icon={<WarningOutlined />}>Override FEFO</Tag>
                    </Tooltip>
                  )}
                </Space>
              </div>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>Klik "Jalankan Alokasi FEFO/FIFO" untuk mereserve batch stok.</Text>
          )}

          {record.allocations.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <Button
                size="small"
                type="dashed"
                icon={<WarningOutlined />}
                onClick={() => handleOpenOverrideModal(idx)}
                data-testid={`btn-override-item-${idx}`}
              >
                Override Alokasi FEFO
              </Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const outstandingColumns = [
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      render: (sku: string) => <Text strong style={{ color: '#0052cc' }}>{sku}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'itemName',
      key: 'itemName',
    },
    {
      title: 'Qty Dipesan',
      dataIndex: 'qtyOrdered',
      key: 'qtyOrdered',
    },
    {
      title: 'Qty Diterima Aktual',
      dataIndex: 'qtyDelivered',
      key: 'qtyDelivered',
      render: (qty?: number) => <Text type="success">{qty || 0}</Text>,
    },
    {
      title: 'Sisa Outstanding (Tergantung)',
      dataIndex: 'qtyOutstanding',
      key: 'qtyOutstanding',
      render: (qty?: number) => <Text type="danger" strong>{qty || 0}</Text>,
    },
  ];

  const statusTag = getDeliveryStatusTagColor(delivery.status);

  return (
    <div data-testid="delivery-detail-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/outbound/deliveries')} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Surat Jalan DO: {delivery.doNo}
                  </Title>
                  <Tag color={statusTag.color}>{statusTag.label}</Tag>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Penerima: {delivery.customerName} | Gudang Pengirim: {delivery.warehouseName}
                </Paragraph>
              </div>
            </Space>
          </Col>

          {/* State Machine Action Buttons */}
          <Col>
            <Space wrap>
              {/* Print DO 3-Ply Button (FE-305) */}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => setPrintModalOpen(true)}
                data-testid="btn-open-print-modal"
              >
                Cetak Surat Jalan (3-Ply DO)
              </Button>

              {delivery.status === 'draft' && (
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleRunFefoAllocation}
                  data-testid="btn-action-trigger-allocation"
                >
                  Jalankan Alokasi FEFO/FIFO
                </Button>
              )}

              {delivery.status === 'allocated' && (
                <Button
                  type="primary"
                  icon={<ScanOutlined />}
                  onClick={() => navigate(`/outbound/deliveries/${delivery.id}/picking`)}
                  data-testid="btn-action-start-picking"
                >
                  Mulai Picking (Picking List)
                </Button>
              )}

              {delivery.status === 'picking_in_progress' && (
                <Button
                  type="primary"
                  style={{ background: '#722ed1', borderColor: '#722ed1' }}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleStateTransition('picked', 'Selesai Picking')}
                  data-testid="btn-action-complete-picking"
                >
                  Tandai Selesai Picking
                </Button>
              )}

              {delivery.status === 'picked' && (
                <Button
                  type="primary"
                  style={{ background: '#eb2f96', borderColor: '#eb2f96' }}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleStateTransition('packed', 'Terkemas (Packed)')}
                  data-testid="btn-action-complete-packing"
                >
                  Tandai Terkemas (Packed)
                </Button>
              )}

              {(delivery.status === 'shipped' || delivery.status === 'partially_delivered') && (
                <Button
                  type="primary"
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  icon={<FileProtectOutlined />}
                  onClick={() => setPodModalOpen(true)}
                  data-testid="btn-open-pod-modal"
                >
                  Upload Bukti POD Digital (FE-306)
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* Workflow Progress Steps */}
        <Card variant="borderless">
          <Steps
            current={getStepCurrentIndex(delivery.status)}
            status={delivery.status === 'cancelled' ? 'error' : 'process'}
            items={[
              { title: 'Draft DO', description: 'Surat Jalan Dibuat' },
              { title: 'Alokasi FEFO', description: 'Batch Ter-reserve' },
              { title: 'Picking', description: 'Scan Rute pick_seq' },
              { title: 'Packing', description: 'QC & Rekonsiliasi' },
              { title: 'Shipped', description: 'Dalam Pengiriman' },
              { title: 'Delivered', description: 'Selesai & POD' },
            ]}
          />
        </Card>

        {/* FE-307: Partial Delivery Outstanding Tracker Banner */}
        {delivery.status === 'partially_delivered' && (
          <Card
            variant="borderless"
            style={{ border: '2px solid #fa8c16', background: '#fffbe6' }}
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
                <span>Tracker Pengiriman Parsial & Outstanding Delivery (FE-307)</span>
              </Space>
            }
          >
            <Alert
              message="Pengiriman Parsial (Partial Delivery)"
              description="Sebagian barang telah berhasil diterima pelanggan, namun terdapat kuantitas sisa yang outstanding untuk jadwal pengiriman berikutnya."
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              data-testid="alert-partial-delivery"
            />

            <Table
              rowKey="id"
              columns={outstandingColumns}
              dataSource={delivery.items}
              pagination={false}
              data-testid="table-partial-outstanding"
            />
          </Card>
        )}

        {/* Tab Navigation: Details vs Packing Reconciliation (FE-304) */}
        <Tabs
          defaultActiveKey="details"
          items={[
            {
              key: 'details',
              label: 'Informasi Detail & Hasil Alokasi FEFO',
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Card variant="borderless" title="Informasi Penerima & Metadata Surat Jalan">
                    <Row gutter={[24, 16]}>
                      <Col xs={24} sm={12} md={6}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Pelanggan / Penerima</Text>
                        <Text strong>{delivery.customerName}</Text>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Referensi Permintaan</Text>
                        <Text code strong>{delivery.requestNo || '-'}</Text>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Gudang Pengirim</Text>
                        <Text strong>{delivery.warehouseName}</Text>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Tanggal Pengiriman Target</Text>
                        <Text strong>{delivery.deliveryDate}</Text>
                      </Col>

                      <Col xs={24} sm={12} md={6}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Driver & Plat Kendaraan</Text>
                        <Text>{delivery.driverName || '-'} ({delivery.vehiclePlateNo || '-'})</Text>
                      </Col>
                      <Col xs={24} md={18}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Alamat Tujuan Pengiriman</Text>
                        <Text>{delivery.destinationAddress}</Text>
                      </Col>
                    </Row>
                  </Card>

                  {/* POD Summary Box */}
                  {delivery.pod && (
                    <Card
                      variant="borderless"
                      title="Bukti Serah Terima (POD - Proof of Delivery) Digital"
                      style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}
                      data-testid="card-pod-summary"
                    >
                      <Row gutter={[16, 12]}>
                        <Col xs={24} sm={12} md={8}>
                          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Penerima Aktual</Text>
                          <Text strong>{delivery.pod.receivedBy}</Text>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Waktu Serah Terima</Text>
                          <Text strong>{delivery.pod.receivedAt}</Text>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Tanda Tangan Digital</Text>
                          <Tag color="green" icon={<CheckCircleOutlined />}>Signed & Verified</Tag>
                        </Col>
                        {delivery.pod.notes && (
                          <Col xs={24}>
                            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Catatan Penerima</Text>
                            <Text>{delivery.pod.notes}</Text>
                          </Col>
                        )}
                      </Row>
                    </Card>
                  )}

                  <Card variant="borderless" title="Rincian Barang & Hasil Alokasi Stok Batch FEFO">
                    <Table
                      rowKey="id"
                      columns={columns}
                      dataSource={delivery.items}
                      pagination={false}
                      data-testid="table-do-items"
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'packing',
              label: 'Tahap Packing & Verifikasi Armada (FE-304)',
              children: (
                <DeliveryPackingTab
                  delivery={delivery}
                  onPostShipment={handlePostShipment}
                />
              ),
            },
          ]}
        />
      </Space>

      {/* Override FEFO Modal */}
      <OverrideAllocationModal
        open={overrideModalOpen}
        itemSku={currentTargetItem?.sku || ''}
        itemName={currentTargetItem?.itemName || ''}
        currentBatchNo={currentTargetItem?.allocations?.[0]?.batchNo || 'LOT-2026-001'}
        onClose={() => setOverrideModalOpen(false)}
        onSubmit={handleSaveOverrideAllocation}
      />

      {/* 3-Ply Printable DO Modal (FE-305) */}
      <DeliveryPrintModal
        open={printModalOpen}
        delivery={delivery}
        onClose={() => setPrintModalOpen(false)}
      />

      {/* Digital POD Modal (FE-306) */}
      <PODUploadModal
        open={podModalOpen}
        doNo={delivery.doNo}
        onClose={() => setPodModalOpen(false)}
        onSubmitPOD={handleSubmitPOD}
      />
    </div>
  );
};
