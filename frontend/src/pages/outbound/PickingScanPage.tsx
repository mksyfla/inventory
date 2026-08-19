import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Input,
  InputNumber,
  Progress,
  Alert,
  Table,
  Badge,
  Divider,
  Spin,
  Empty,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  BarcodeOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PickingItemRow } from '../../types/outbound';
import { outboundService, PickingListItemDTO, PickScanPayload } from '../../api/services/outbound';
import { documentService } from '../../api/services/documents';
import { mapDocumentToDeliveryOrder } from '../../api/mappers';
import { useScannerKeyboardWedge } from '../../hooks/useScannerKeyboardWedge';
import { CameraScannerModal } from '../../components/CameraScannerModal';

const { Title, Paragraph, Text } = Typography;

// The picking list endpoint intentionally does not carry the item display name
// (only sku + base_uom). Use the SKU as the row label; master names stay in the
// item master / DO detail views.
const toPickingItemRow = (p: PickingListItemDTO, index: number): PickingItemRow => ({
  id: p.allocation_id,
  deliveryItemId: p.line_id,
  pickSeq: p.pick_seq ?? index + 1,
  targetBinCode: p.location_code,
  targetSku: p.sku,
  itemName: p.sku,
  targetBatchNo: p.batch_no || '-',
  uom: p.base_uom,
  qtyToPick: p.qty_remaining,
  qtyPicked: p.qty_picked,
  scannedBinCode: '',
  scannedSku: '',
  isBinMatched: false,
  isSkuMatched: false,
  // Lines already fully picked on the backend start out completed.
  isPickedCompleted: p.qty_remaining <= 0,
});

export const PickingScanPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const doId = Number(id);

  // Live DO header (shared cache with the delivery detail page).
  const { data: delivery } = useQuery({
    queryKey: ['delivery-detail', id],
    queryFn: async () => {
      const dto = await documentService.getDetail(doId);
      return mapDocumentToDeliveryOrder(dto, dto.lines);
    },
    enabled: !!id,
  });

  // Real picking list from the backend (GET /deliveries/:id/picking-list).
  const { data: pickingList, isLoading: pickingLoading } = useQuery({
    queryKey: ['picking-list', id],
    queryFn: () => outboundService.getPickingList(doId),
    enabled: !!id,
  });

  const [items, setItems] = useState<PickingItemRow[] | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [scanMode, setScanMode] = useState<'bin' | 'sku'>('bin');
  const [manualScanInput, setManualScanInput] = useState<string>('');
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  // Seed the working rows once the picking list arrives. Deliberately never
  // re-seed afterwards so an in-flight scan flow is not clobbered by a refetch.
  useEffect(() => {
    if (pickingList && items === null) {
      setItems(pickingList.map(toPickingItemRow));
    }
  }, [pickingList, items]);

  const rows = items ?? [];
  const activeItem = rows[activeIndex] || rows[0];

  const confirmPick = useMutation({
    mutationFn: (scans: PickScanPayload[]) => outboundService.confirmPick(doId, scans),
  });

  const playSuccessBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio fallback silent
    }
  };

  const playErrorBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio fallback silent
    }
  };

  const handleProcessBarcodeScan = (scannedCode: string) => {
    setMismatchError(null);
    const cleanCode = scannedCode.trim();

    if (!activeItem) return;

    if (scanMode === 'bin') {
      if (cleanCode === activeItem.targetBinCode) {
        playSuccessBeep();
        setItems((prev) => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[activeIndex] = {
            ...updated[activeIndex],
            scannedBinCode: cleanCode,
            isBinMatched: true,
          };
          return updated;
        });
        setScanMode('sku');
        notification.success({
          message: 'Scan Bin Berhasil',
          description: `Lokasi bin ${cleanCode} sesuai. Silakan scan barcode SKU barang.`,
        });
      } else {
        playErrorBeep();
        setMismatchError(`ERR_SCAN_MISMATCH: Barcode lokasi bin '${cleanCode}' tidak sesuai target '${activeItem.targetBinCode}'`);
      }
    } else if (scanMode === 'sku') {
      if (cleanCode === activeItem.targetSku || cleanCode === activeItem.targetBatchNo) {
        playSuccessBeep();
        setItems((prev) => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[activeIndex] = {
            ...updated[activeIndex],
            scannedSku: cleanCode,
            isSkuMatched: true,
          };
          return updated;
        });
        notification.success({
          message: 'Scan SKU / Batch Berhasil',
          description: `SKU ${cleanCode} terverifikasi. Masukkan Qty ambil dan konfirmasi.`,
        });
      } else {
        playErrorBeep();
        setMismatchError(`ERR_SCAN_MISMATCH: Barcode barang '${cleanCode}' tidak sesuai SKU '${activeItem.targetSku}' atau Batch '${activeItem.targetBatchNo}'`);
      }
    }
  };

  // Hardware USB Scanner integration hook
  useScannerKeyboardWedge({
    onScan: handleProcessBarcodeScan,
    enabled: !cameraModalOpen,
  });

  const handleManualScanSubmit = () => {
    if (!manualScanInput.trim()) return;
    handleProcessBarcodeScan(manualScanInput);
    setManualScanInput('');
  };

  // Confirm a picked line. The scan is sent to the backend (POST
  // /deliveries/:id/pick); the line only advances after the server accepts it.
  const handleConfirmItemPick = () => {
    const item = activeItem;
    if (!item || !items) return;

    const scans: PickScanPayload[] = [
      {
        allocation_id: item.id,
        location_barcode: item.scannedBinCode,
        item_barcode: item.scannedSku,
        qty: item.qtyPicked,
      },
    ];

    confirmPick.mutate(scans, {
      onSuccess: () => {
        setItems((prev) => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[activeIndex] = {
            ...updated[activeIndex],
            isPickedCompleted: true,
          };
          return updated;
        });

        playSuccessBeep();
        notification.success({
          message: `Picking Line #${item.pickSeq} Selesai`,
          description: `${item.itemName} (${item.qtyPicked} ${item.uom}) berhasil di-pick dari ${item.targetBinCode}.`,
        });

        if (activeIndex < items.length - 1) {
          setActiveIndex((prev) => prev + 1);
          setScanMode('bin');
          setMismatchError(null);
        }
      },
      onError: (err) => {
        playErrorBeep();
        const message =
          (err as { message?: string })?.message ??
          'Gagal mengonfirmasi picking. Scan tidak sesuai atau melebihi sisa alokasi.';
        setMismatchError(message);
      },
    });
  };

  const completedCount = rows.filter((i) => i.isPickedCompleted).length;
  const progressPercent = rows.length > 0 ? Math.round((completedCount / rows.length) * 100) : 0;
  const isAllPicked = rows.length > 0 && completedCount === rows.length;

  const columns = [
    {
      title: 'Rute (seq)',
      dataIndex: 'pickSeq',
      key: 'pickSeq',
      width: 90,
      render: (seq: number) => (
        <Badge count={`#${seq}`} style={{ backgroundColor: '#0052cc' }} />
      ),
    },
    {
      title: 'Target Lokasi Bin',
      dataIndex: 'targetBinCode',
      key: 'targetBinCode',
      width: 170,
      render: (bin: string) => (
        <Tag icon={<EnvironmentOutlined />} color="green">{bin}</Tag>
      ),
    },
    {
      title: 'Target SKU & Batch',
      key: 'skuBatch',
      width: 220,
      render: (_: any, record: PickingItemRow) => (
        <div>
          <Text strong style={{ color: '#0052cc', display: 'block' }}>{record.targetSku}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>Batch: {record.targetBatchNo}</Text>
        </div>
      ),
    },
    {
      title: 'SKU / Barang',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Qty Target',
      key: 'qtyTarget',
      width: 110,
      render: (_: any, record: PickingItemRow) => (
        <Text strong>{record.qtyToPick} {record.uom}</Text>
      ),
    },
    {
      title: 'Status Scan',
      key: 'status',
      width: 160,
      render: (_: any, record: PickingItemRow) => {
        if (record.isPickedCompleted) {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Selesai Picked</Tag>;
        }
        if (record.isBinMatched && record.isSkuMatched) {
          return <Tag color="processing">Scan Valid</Tag>;
        }
        if (record.isBinMatched) {
          return <Tag color="warning">Bin Scanned</Tag>;
        }
        return <Tag color="default">Menunggu Scan</Tag>;
      },
    },
  ];

  const isConfirmDisabled =
    !activeItem ||
    !activeItem.isBinMatched ||
    !activeItem.isSkuMatched ||
    activeItem.qtyPicked < 1 ||
    confirmPick.isPending;

  return (
    <div data-testid="picking-scan-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Action Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/outbound/deliveries/${id}`)} />
              <div>
                <Space align="center">
                  <Title level={3} style={{ margin: 0 }}>
                    Mobile Scanner Picking List: {delivery?.doNo ?? 'DO'}
                  </Title>
                  <Tag color="warning">Sedang Picking</Tag>
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Rute Terurut `pick_seq` (Jalur Terpendek Gudang) | Penerima: {delivery?.customerName ?? '-'}
                </Paragraph>
              </div>
            </Space>
          </Col>

          <Col>
            <Button
              type="primary"
              size="large"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              icon={<CheckCircleOutlined />}
              disabled={!isAllPicked}
              onClick={() => {
                notification.success({
                  message: 'Picking Outbound Selesai',
                  description: 'Seluruh barang telah selesai di-pick dan siap menuju tahapan Packing.',
                });
                navigate(`/outbound/deliveries/${id}`);
              }}
              data-testid="btn-complete-picking-flow"
            >
              Selesaikan Picking & Lanjut ke Packing
            </Button>
          </Col>
        </Row>

        {/* Progress Bar */}
        <Card variant="borderless">
          <Row align="middle" gutter={16}>
            <Col flex="auto">
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                Kemajuan Picking Outbound: {completedCount} dari {rows.length} Baris SKU Selesai ({progressPercent}%)
              </Text>
              <Progress percent={progressPercent} status={isAllPicked ? 'success' : 'active'} />
            </Col>
          </Row>
        </Card>

        {/* Shortest Route Guidance Alert */}
        <Alert
          message="Petunjuk Rute Efisien (pick_seq)"
          description="Sistem telah mengurutkan lokasi rak gudang berdasarkan rute lintasan jalan terpendek untuk efisiensi waktu picker."
          type="info"
          showIcon
          icon={<OrderedListOutlined />}
        />

        {/* Mismatch Error Alert */}
        {mismatchError && (
          <Alert
            message="Error Scanning Barcode Mismatch"
            description={mismatchError}
            type="error"
            showIcon
            closable
            onClose={() => setMismatchError(null)}
            data-testid="alert-scan-mismatch"
          />
        )}

        {pickingLoading || items === null ? (
          <Card variant="borderless" style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="Memuat daftar picking dari server..." />
          </Card>
        ) : rows.length === 0 ? (
          <Card variant="borderless">
            <Empty description="Belum ada alokasi picking untuk dokumen ini. Jalankan alokasi stok (FEFO) terlebih dahulu." />
          </Card>
        ) : (
          <>
            {/* Active Picking Target Interactive Card */}
            {activeItem && !activeItem.isPickedCompleted && (
              <Card
                variant="borderless"
                style={{ border: '2px solid #0052cc', background: '#f0f5ff' }}
                title={
                  <Space>
                    <ThunderboltOutlined style={{ color: '#0052cc' }} />
                    <span>Target Picking Aktif - Langkah #{activeItem.pickSeq} dari {rows.length}</span>
                  </Space>
                }
              >
                <Row gutter={[24, 16]}>
                  <Col xs={24} md={8}>
                    <Card type="inner" title="1. Target Bin Lokasi">
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Scan Barcode Rak Bin</Text>
                      <Title level={4} style={{ color: '#52c41a', margin: '4px 0' }}>
                        {activeItem.targetBinCode}
                      </Title>
                      {activeItem.isBinMatched ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>Bin Terverifikasi</Tag>
                      ) : (
                        <Tag color="warning">Menunggu Scan Bin</Tag>
                      )}
                    </Card>
                  </Col>

                  <Col xs={24} md={8}>
                    <Card type="inner" title="2. Target SKU & Batch">
                      <Text strong style={{ display: 'block', color: '#0052cc' }}>{activeItem.targetSku}</Text>
                      <Text style={{ fontSize: 13, display: 'block' }}>{activeItem.itemName}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>Batch Target: {activeItem.targetBatchNo}</Text>
                      <div style={{ marginTop: 6 }}>
                        {activeItem.isSkuMatched ? (
                          <Tag color="success" icon={<CheckCircleOutlined />}>SKU Terverifikasi</Tag>
                        ) : (
                          <Tag color="warning">Menunggu Scan SKU</Tag>
                        )}
                      </div>
                    </Card>
                  </Col>

                  <Col xs={24} md={8}>
                    <Card type="inner" title="3. Input Qty Ambil">
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Jumlah Yang Diambil ({activeItem.uom})</Text>
                      <InputNumber
                        min={1}
                        max={activeItem.qtyToPick}
                        value={activeItem.qtyPicked}
                        onChange={(val) => {
                          if (val !== null) {
                            setItems((prev) => {
                              if (!prev) return prev;
                              const updated = [...prev];
                              updated[activeIndex].qtyPicked = val;
                              return updated;
                            });
                          }
                        }}
                        style={{ width: '100%', margin: '8px 0' }}
                        data-testid="input-qty-picked"
                      />
                      <Button
                        type="primary"
                        block
                        icon={<CheckCircleOutlined />}
                        disabled={isConfirmDisabled}
                        loading={confirmPick.isPending}
                        onClick={handleConfirmItemPick}
                        data-testid="btn-confirm-item-pick"
                      >
                        Konfirmasi Pick Line #{activeItem.pickSeq}
                      </Button>
                    </Card>
                  </Col>
                </Row>

                {/* Hardware & Camera Scan Inputs */}
                <Divider style={{ margin: '16px 0' }} />
                <Row gutter={[16, 16]} align="middle">
                  <Col xs={24} md={16}>
                    <Space style={{ width: '100%' }}>
                      <Input
                        placeholder={
                          scanMode === 'bin'
                            ? `Mode 1: Scan / ketik Barcode Lokasi Bin (${activeItem.targetBinCode})...`
                            : `Mode 2: Scan / ketik Barcode SKU (${activeItem.targetSku})...`
                        }
                        prefix={<BarcodeOutlined style={{ color: '#0052cc' }} />}
                        value={manualScanInput}
                        onChange={(e) => setManualScanInput(e.target.value)}
                        onPressEnter={handleManualScanSubmit}
                        data-testid="input-scan-barcode"
                      />
                      <Button type="primary" onClick={handleManualScanSubmit} data-testid="btn-submit-scan">
                        Simulasi Scan
                      </Button>
                    </Space>
                  </Col>

                  <Col xs={24} md={8}>
                    <Button
                      block
                      icon={<CameraOutlined />}
                      onClick={() => setCameraModalOpen(true)}
                      data-testid="btn-open-camera-scanner"
                    >
                      Buka Kamera PWA Barcode Scanner
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}

            {/* Picking List Table ordered by pick_seq */}
            <Card variant="borderless" title="Daftar Rute Item Picking List (Urut Location pick_seq)">
              <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                pagination={false}
                data-testid="table-picking-list"
              />
            </Card>
          </>
        )}
      </Space>

      {/* PWA Camera Scanner Modal */}
      <CameraScannerModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onScan={(code: string) => {
          handleProcessBarcodeScan(code);
          setCameraModalOpen(false);
        }}
      />
    </div>
  );
};
