import React, { useState } from 'react';
import {
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Table,
  Progress,
  Badge,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  ScanOutlined,
  BarcodeOutlined,
  RocketOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { receiptService } from '../../api/services/receipts';
import { itemService } from '../../api/services/items';
import { mapItemDTO } from '../../api/mappers';
import { PutawaySuggestionDTO } from '../../api/dto';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { CameraScannerModal } from '../../components/CameraScannerModal';
import { useScannerKeyboardWedge } from '../../hooks/useScannerKeyboardWedge';
import { playSuccessBeep, playErrorBeep } from '../../utils/audioFeedback';

const { Title, Paragraph, Text } = Typography;

export interface PutawayItemRow {
  id: number;
  line_id: number;
  item_id: number;
  sku: string;
  itemName: string;
  qtyRemaining: number;
  suggestedBinCode: string;
  scannedBinCode: string;
  qtyPutaway: number;
  isBinMatched?: boolean;
  isPutawayCompleted: boolean;
}

export const PutawayPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const receiptId = Number(id);

  const { data: suggestions = [], isLoading } = useQuery<PutawaySuggestionDTO[]>({
    queryKey: ['receipt', receiptId, 'putaway-suggestion'],
    queryFn: () => receiptService.putawaySuggestion(receiptId),
    enabled: Boolean(receiptId),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const dtos = await itemService.listItems();
      return dtos.map(mapItemDTO);
    },
  });

  const [putawayItems, setPutawayItems] = useState<PutawayItemRow[]>([]);

  // Initialize rows from putaway suggestions when both suggestions and items are available.
  React.useEffect(() => {
    if (suggestions.length > 0 && items.length > 0 && putawayItems.length === 0) {
      const rows: PutawayItemRow[] = suggestions.map((s) => {
        const item = items.find((i) => i.id === s.item_id);
        const firstLoc = s.locations?.[0];
        return {
          id: s.line_id,
          line_id: s.line_id,
          item_id: s.item_id,
          sku: item?.sku || `#${s.item_id}`,
          itemName: item?.name || `Item #${s.item_id}`,
          qtyRemaining: s.qty_remaining,
          suggestedBinCode: firstLoc?.code || '',
          scannedBinCode: '',
          qtyPutaway: s.qty_remaining,
          isPutawayCompleted: false,
        };
      });
      setPutawayItems(rows);
    }
  }, [suggestions, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const putawayMutation = useMutationWithToast({
    mutationFn: (payload: { line_id: number; qty: number; location_code: string }) =>
      receiptService.putaway(receiptId, { lines: [payload] }),
    successTitle: 'Putaway Berhasil Diposting',
    successMessage: 'Perpindahan stok dari staging ke bin tujuan telah dicatat.',
    invalidateKeys: [['receipt', receiptId, 'putaway-suggestion']],
  });

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'bin' | 'sku'>('bin');

  const currentActiveRow = putawayItems[activeIndex] || putawayItems[0];

  // Process barcode scan string
  const handleBarcodeScanned = (scannedCode: string) => {
    if (!scannedCode || !currentActiveRow) return;
    const cleanCode = scannedCode.trim().toUpperCase();

    if (scanMode === 'bin') {
      const isMatch = cleanCode === currentActiveRow.suggestedBinCode.toUpperCase();
      if (isMatch) {
        playSuccessBeep();
      } else {
        playErrorBeep();
      }

      setPutawayItems((prev) =>
        prev.map((row, idx) =>
          idx === activeIndex
            ? { ...row, scannedBinCode: cleanCode, isBinMatched: isMatch }
            : row
        )
      );

      setScanMode('sku');
    } else {
      const isMatch = cleanCode === currentActiveRow.sku.toUpperCase();
      if (isMatch) {
        playSuccessBeep();
      } else {
        playErrorBeep();
      }

      setPutawayItems((prev) =>
        prev.map((row, idx) => (idx === activeIndex ? { ...row, isBinMatched: isMatch && row.isBinMatched } : row))
      );
    }
  };

  // Keyboard Wedge USB Scanner Hook Integration
  useScannerKeyboardWedge({
    onScan: (code) => handleBarcodeScanned(code),
    minBarcodeLength: 3,
  });

  const handleConfirmItemPutaway = (index: number) => {
    const item = putawayItems[index];
    if (!item?.scannedBinCode) {
      return;
    }

    putawayMutation.mutate(
      {
        line_id: item.line_id,
        qty: item.qtyPutaway,
        location_code: item.scannedBinCode,
      },
      {
        onSuccess: () => {
          setPutawayItems((prev) =>
            prev.map((row, idx) => (idx === index ? { ...row, isPutawayCompleted: true } : row))
          );
          playSuccessBeep();

          const nextUncompleted = putawayItems.findIndex((row, idx) => idx > index && !row.isPutawayCompleted);
          if (nextUncompleted !== -1) {
            setActiveIndex(nextUncompleted);
            setScanMode('bin');
          }
        },
      }
    );
  };

  const completedCount = putawayItems.filter((i) => i.isPutawayCompleted).length;
  const progressPercent = putawayItems.length > 0 ? Math.round((completedCount / putawayItems.length) * 100) : 0;

  const columns = [
    {
      title: 'Barang SKU',
      dataIndex: 'sku',
      key: 'sku',
      render: (sku: string, record: PutawayItemRow, idx: number) => (
        <div>
          <Text strong style={{ color: '#0052cc' }}>{sku}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{record.itemName}</Text>
          {idx === activeIndex && !record.isPutawayCompleted && (
            <Tag color="processing" style={{ marginTop: 4 }}>Aktif Discan</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Qty Sisa',
      dataIndex: 'qtyRemaining',
      key: 'qtyRemaining',
      width: 110,
      render: (qty: number) => `${qty}`,
    },
    {
      title: 'Saran Bin Sistem',
      dataIndex: 'suggestedBinCode',
      key: 'suggestedBinCode',
      width: 170,
      render: (suggested: string) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#0052cc' }} />
          <Text strong>{suggested || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Aktual Bin Scan',
      key: 'scannedBinCode',
      width: 200,
      render: (_: any, record: PutawayItemRow) =>
        record.scannedBinCode ? (
          <Space direction="vertical" size={2}>
            <Text strong>{record.scannedBinCode}</Text>
            {record.isBinMatched ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>Bin Match</Tag>
            ) : (
              <Tag color="warning" icon={<ExclamationCircleOutlined />}>Override Bin</Tag>
            )}
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Belum Discan</Text>
        ),
    },
    {
      title: 'Status Putaway',
      key: 'status',
      width: 140,
      render: (_: any, record: PutawayItemRow) =>
        record.isPutawayCompleted ? (
          <Badge status="success" text="Telah Putaway" />
        ) : (
          <Badge status="processing" text="Belum Selesai" />
        ),
    },
    {
      title: 'Aksi Scan & Putaway',
      key: 'action',
      width: 170,
      render: (_: any, record: PutawayItemRow, idx: number) => (
        <Space>
          <Button
            size="small"
            type={idx === activeIndex ? 'primary' : 'default'}
            disabled={record.isPutawayCompleted}
            onClick={() => {
              setActiveIndex(idx);
              setScanMode('bin');
            }}
            data-testid={`btn-select-row-${idx}`}
          >
            {idx === activeIndex ? 'Aktif' : 'Pilih'}
          </Button>

          <Button
            size="small"
            type="primary"
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            disabled={record.isPutawayCompleted || !record.scannedBinCode}
            loading={putawayMutation.isPending}
            onClick={() => handleConfirmItemPutaway(idx)}
            data-testid={`btn-confirm-putaway-${idx}`}
          >
            Konfirmasi
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="putaway-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Bar */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/inbound/receipts/${receiptId}`)} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Alur Putaway & Penempatan Rak Bin: GRN #{receiptId}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Scan barcode Bin lokasi tujuan & SKU barang menggunakan Scanner USB / Kamera PWA.
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              onClick={() => setCameraModalOpen(true)}
              data-testid="btn-open-camera-scanner"
            >
              Scan Kamera PWA
            </Button>
          </Col>
        </Row>

        {/* Active Scan Control Box */}
        {currentActiveRow && (
          <Card variant="borderless" style={{ background: '#e6f7ff', border: '1.5px dashed #1890ff' }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  Target Baris Aktif ({activeIndex + 1} dari {putawayItems.length}):
                </Text>
                <Title level={4} style={{ margin: '4px 0', color: '#0052cc' }}>
                  {currentActiveRow.sku} - {currentActiveRow.itemName}
                </Title>
                <Text strong style={{ fontSize: 13 }}>
                  Saran Bin Sistem:{' '}
                  <Tag color="blue" icon={<EnvironmentOutlined />}>
                    {currentActiveRow.suggestedBinCode || '-'}
                  </Tag>
                </Text>
              </Col>

              <Col xs={24} md={12}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong style={{ fontSize: 13 }}>
                    Simulasi Manual Scan ({scanMode === 'bin' ? 'Barcode Bin' : 'Barcode SKU'}):
                  </Text>
                  <Space style={{ width: '100%' }}>
                    <Input
                      placeholder={
                        scanMode === 'bin'
                          ? `Scan / Ketik Kode Bin (misal: ${currentActiveRow.suggestedBinCode})`
                          : `Scan / Ketik Kode SKU (misal: ${currentActiveRow.sku})`
                      }
                      prefix={scanMode === 'bin' ? <ScanOutlined /> : <BarcodeOutlined />}
                      onPressEnter={(e: any) => {
                        handleBarcodeScanned(e.target.value);
                        e.target.value = '';
                      }}
                      data-testid="input-manual-barcode-scan"
                    />
                    <Button
                      type="primary"
                      onClick={() => {
                        const input = document.querySelector('[data-testid="input-manual-barcode-scan"]') as HTMLInputElement;
                        if (input && input.value) {
                          handleBarcodeScanned(input.value);
                          input.value = '';
                        }
                      }}
                      data-testid="btn-submit-manual-scan"
                    >
                      Submit Scan
                    </Button>
                  </Space>
                </Space>
              </Col>
            </Row>
          </Card>
        )}

        {/* Progress Overview Card */}
        <Card variant="borderless">
          <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
            <Col>
              <Text strong style={{ fontSize: 16 }}>
                Kemajuan Alur Putaway ({completedCount} / {putawayItems.length} Item Selesai)
              </Text>
            </Col>
            <Col>
              <Progress percent={progressPercent} style={{ width: 240 }} />
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={putawayItems}
            loading={isLoading}
            pagination={false}
            data-testid="table-putaway-items"
          />

          <Divider />

          <Row justify="end">
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              disabled={putawayItems.length === 0 || completedCount < putawayItems.length}
              onClick={() => navigate(`/inbound/receipts/${receiptId}`)}
              data-testid="btn-complete-all-putaway"
            >
              Selesaikan Putaway & Simpan Stok ke Bin Database
            </Button>
          </Row>
        </Card>
      </Space>

      {/* Camera Scanner Modal for Mobile/PWA */}
      <CameraScannerModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onScan={(scannedCode: string) => {
          handleBarcodeScanned(scannedCode);
          setCameraModalOpen(false);
        }}
      />
    </div>
  );
};
