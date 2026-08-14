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
  notification,
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
import { GoodsReceiptNote, MOCK_GRN_LIST, ReceiptItemLine } from '../../types/inbound';
import { CameraScannerModal } from '../../components/CameraScannerModal';
import { useScannerKeyboardWedge } from '../../hooks/useScannerKeyboardWedge';
import { playSuccessBeep, playErrorBeep } from '../../utils/audioFeedback';

const { Title, Paragraph, Text } = Typography;

export interface PutawayItemRow extends ReceiptItemLine {
  suggestedBinCode: string;
  scannedBinCode: string;
  scannedSku: string;
  qtyPutaway: number;
  isBinMatched?: boolean;
  isSkuMatched?: boolean;
  isPutawayCompleted: boolean;
}

export const PutawayPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Find GRN document
  const existingGrn = MOCK_GRN_LIST.find((g) => g.id === Number(id)) || MOCK_GRN_LIST[0];
  const [grn] = useState<GoodsReceiptNote>(existingGrn);

  // Initialize Putaway rows with System Suggested Bin locations
  const [putawayItems, setPutawayItems] = useState<PutawayItemRow[]>(() =>
    grn.items.map((item, index) => ({
      ...item,
      suggestedBinCode: item.targetLocationCode || `JKT01-Z1-R01-B0${index + 1}`,
      scannedBinCode: '',
      scannedSku: '',
      qtyPutaway: item.qtyReceived,
      isBinMatched: undefined,
      isSkuMatched: undefined,
      isPutawayCompleted: false,
    }))
  );

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'bin' | 'sku'>('bin');

  const currentActiveRow = putawayItems[activeIndex] || putawayItems[0];

  // Process barcode scan string
  const handleBarcodeScanned = (scannedCode: string) => {
    if (!scannedCode) return;
    const cleanCode = scannedCode.trim().toUpperCase();

    if (scanMode === 'bin') {
      // Scan Bin Location
      const isMatch = cleanCode === currentActiveRow.suggestedBinCode.toUpperCase();
      if (isMatch) {
        playSuccessBeep();
        notification.success({
          message: 'Scan Barcode Bin Berhasil (Match)',
          description: `Lokasi bin ${cleanCode} sesuai dengan saran sistem.`,
        });
      } else {
        playErrorBeep();
        notification.warning({
          message: 'Lokasi Bin Berbeda dari Saran Sistem (Override)',
          description: `Scan: ${cleanCode} vs Saran: ${currentActiveRow.suggestedBinCode}. Stok akan ditempatkan di lokasi override ini.`,
        });
      }

      setPutawayItems((prev) =>
        prev.map((row, idx) =>
          idx === activeIndex
            ? { ...row, scannedBinCode: cleanCode, isBinMatched: isMatch }
            : row
        )
      );

      // Auto switch scan mode to SKU
      setScanMode('sku');
    } else {
      // Scan SKU Barang
      const isMatch = cleanCode === currentActiveRow.sku.toUpperCase();
      if (isMatch) {
        playSuccessBeep();
        notification.success({
          message: 'Scan Barcode SKU Berhasil (Match)',
          description: `Barang ${cleanCode} terverifikasi.`,
        });
      } else {
        playErrorBeep();
        notification.error({
          message: 'Scan Barcode SKU Tidak Cocok',
          description: `Barcode ${cleanCode} tidak sesuai dengan SKU target ${currentActiveRow.sku}.`,
        });
      }

      setPutawayItems((prev) =>
        prev.map((row, idx) =>
          idx === activeIndex
            ? { ...row, scannedSku: cleanCode, isSkuMatched: isMatch }
            : row
        )
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
    if (!item.scannedBinCode) {
      notification.error({ message: 'Wajib melakukan scan barcode Bin tujuan terlebih dahulu' });
      return;
    }

    setPutawayItems((prev) =>
      prev.map((row, idx) =>
        idx === index ? { ...row, isPutawayCompleted: true } : row
      )
    );

    playSuccessBeep();
    notification.success({
      message: `Barang ${item.sku} Berhasil Ditempatkan di ${item.scannedBinCode}`,
    });

    // Move to next uncompleted row
    const nextUncompleted = putawayItems.findIndex((row, idx) => idx > index && !row.isPutawayCompleted);
    if (nextUncompleted !== -1) {
      setActiveIndex(nextUncompleted);
      setScanMode('bin');
    }
  };

  const handleCompleteAllPutaway = () => {
    notification.success({
      message: 'Seluruh Alur Putaway Berhasil Selesai',
      description: `Stok barang dari dokumen ${grn.documentNo} resmi dibukukan ke lokasi bin gudang.`,
    });
    navigate(`/inbound/receipts/${grn.id}`);
  };

  const completedCount = putawayItems.filter((i) => i.isPutawayCompleted).length;
  const progressPercent = Math.round((completedCount / putawayItems.length) * 100);

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
      title: 'Qty Diterima',
      dataIndex: 'qtyReceived',
      key: 'qtyReceived',
      width: 110,
      render: (qty: number, record: PutawayItemRow) => `${qty} ${record.uom}`,
    },
    {
      title: 'Saran Bin Sistem',
      dataIndex: 'suggestedBinCode',
      key: 'suggestedBinCode',
      width: 170,
      render: (suggested: string) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#0052cc' }} />
          <Text strong>{suggested}</Text>
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
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/inbound/receipts/${grn.id}`)} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Alur Putaway & Penempatan Rak Bin: {grn.documentNo}
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
                  {currentActiveRow.suggestedBinCode}
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
            pagination={false}
            data-testid="table-putaway-items"
          />

          <Divider />

          <Row justify="end">
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              disabled={completedCount < putawayItems.length}
              onClick={handleCompleteAllPutaway}
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
