import React, { useState } from 'react';
import {
  Modal,
  Upload,
  Button,
  Progress,
  Table,
  Space,
  Typography,
  Alert,
  Steps,
  Tag,
  Divider,
  notification,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export interface ImportRowError {
  rowNo: number;
  sku: string;
  field?: string;
  errorReason: string;
}

export interface ItemImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ItemImportModal: React.FC<ItemImportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Result summary
  const [importResult, setImportResult] = useState<{
    jobId: string;
    totalRows: number;
    successCount: number;
    failedCount: number;
    errors: ImportRowError[];
  } | null>(null);

  const handleDownloadTemplate = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'SKU,NamaBarang,KategoriID,BaseUoM,MinQty,MaxQty,SafetyStock,LeadTimeDays,KelasABC,IsBatch,IsExpiry,IsSerial\n' +
      'SKU-SAMPLE-01,Tinta Cetak Hitam 1KG,2,CAN,10,100,5,7,A,true,true,false\n' +
      'SKU-SAMPLE-02,Kertas Sekuriti Roll 90GSM,3,ROLL,5,50,2,14,A,true,false,true';

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'Template_Impor_Master_Barang_SIMBAR.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notification.info({
      message: 'Template Berhasil Diunduh',
      description: 'Gunakan berkas CSV template ini untuk pengisian master barang massal.',
    });
  };

  const handleFileBeforeUpload = (file: File) => {
    const isSpreadsheet =
      file.name.endsWith('.csv') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls');

    if (!isSpreadsheet) {
      notification.error({
        message: 'Format Berkas Tidak Sesuai',
        description: 'Hanya berkas format .csv atau .xlsx yang diperbolehkan.',
      });
      return false;
    }

    setUploadFile(file);
    return false; // Prevent automatic upload
  };

  const handleStartImport = async () => {
    if (!uploadFile) return;

    setCurrentStep(1);
    setProcessing(true);
    setProgressPercent(10);

    // Simulate Async Import Job Progress (job_id: JOB-IMP-99)
    await new Promise((r) => setTimeout(r, 400));
    setProgressPercent(45);

    await new Promise((r) => setTimeout(r, 500));
    setProgressPercent(85);

    await new Promise((r) => setTimeout(r, 400));
    setProgressPercent(100);

    // Mock Result with Row Errors (AC: "Jika ada kesalahan data ganda/format, UI menunjukkan baris mana yang gagal")
    const mockErrors: ImportRowError[] = [
      {
        rowNo: 4,
        sku: 'SKU-INK-001',
        field: 'sku',
        errorReason: 'Kode SKU sudah terdaftar di database master barang (Duplikat).',
      },
      {
        rowNo: 7,
        sku: 'SKU-FAIL-07',
        field: 'maxQty',
        errorReason: 'Batas Stok Maksimum (maxQty=5) lebih kecil dari Stok Minimum (minQty=10).',
      },
    ];

    setImportResult({
      jobId: `JOB-IMP-${Date.now()}`,
      totalRows: 48,
      successCount: 46,
      failedCount: 2,
      errors: mockErrors,
    });

    setProcessing(false);
    setCurrentStep(2);

    if (onSuccess) {
      onSuccess();
    }
  };

  const handleResetModal = () => {
    setCurrentStep(0);
    setUploadFile(null);
    setProcessing(false);
    setProgressPercent(0);
    setImportResult(null);
  };

  const errorColumns = [
    {
      title: 'Baris Ke',
      dataIndex: 'rowNo',
      key: 'rowNo',
      width: 90,
      render: (row: number) => <Tag color="volcano">Baris {row}</Tag>,
    },
    {
      title: 'Kode SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 140,
      render: (sku: string) => <Text code>{sku}</Text>,
    },
    {
      title: 'Alasan Gagal / Laporan Error Log',
      dataIndex: 'errorReason',
      key: 'errorReason',
      render: (reason: string) => <Text type="danger">{reason}</Text>,
    },
  ];

  return (
    <Modal
      open={open}
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#0052cc' }} />
          <span>Impor Massal Master Data Barang (CSV / Excel)</span>
        </Space>
      }
      onCancel={() => {
        handleResetModal();
        onClose();
      }}
      footer={
        currentStep === 2 ? [
          <Button key="close" type="primary" onClick={() => { handleResetModal(); onClose(); }}>
            Selesai
          </Button>,
        ] : null
      }
      destroyOnHidden
      width={640}
      data-testid="modal-item-import"
    >
      <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
        <Steps
          current={currentStep}
          items={[
            { title: 'Unggah Berkas' },
            { title: 'Proses Impor' },
            { title: 'Laporan Hasil' },
          ]}
        />

        {/* STEP 0: Upload File & Template Download */}
        {currentStep === 0 && (
          <>
            <Alert
              message="Format Berkas Template Impor"
              description="Unduh template berkas spreadsheet resmi untuk memastikan nama kolom dan tipe data sesuai dengan skema database SIMBAR."
              type="info"
              showIcon
              action={
                <Button
                  size="small"
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadTemplate}
                  data-testid="btn-download-template"
                >
                  Unduh Template CSV
                </Button>
              }
            />

            <Upload.Dragger
              name="file"
              multiple={false}
              beforeUpload={handleFileBeforeUpload}
              fileList={uploadFile ? [uploadFile as any] : []}
              onRemove={() => setUploadFile(null)}
              accept=".csv,.xlsx,.xls"
              data-testid="upload-dragger-area"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#0052cc', fontSize: 48 }} />
              </p>
              <p className="ant-upload-text">Klik atau seret berkas CSV / Excel ke area ini</p>
              <p className="ant-upload-hint">Format yang didukung: .csv, .xlsx, .xls (Maksimal 10 MB per berkas)</p>
            </Upload.Dragger>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button
                type="primary"
                disabled={!uploadFile}
                onClick={handleStartImport}
                data-testid="btn-process-import"
              >
                Mulai Impor Data
              </Button>
            </div>
          </>
        )}

        {/* STEP 1: Processing Progress */}
        {currentStep === 1 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Title level={4}>Memproses Pengolahan Data Barang...</Title>
            <Paragraph type="secondary">
              Sedang memvalidasi skema, mengecek duplikasi SKU, dan mengunggah record ke database master.
            </Paragraph>
            <Progress percent={progressPercent} status={processing ? 'active' : 'normal'} style={{ maxWidth: 400 }} />
          </div>
        )}

        {/* STEP 2: Result & Error Log Report Table */}
        {currentStep === 2 && importResult && (
          <>
            <Alert
              message={`Proses Impor Selesai (Job ID: ${importResult.jobId})`}
              description={
                <span>
                  Total <strong>{importResult.totalRows}</strong> baris diproses:{' '}
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    {importResult.successCount} Berhasil
                  </Tag>{' '}
                  <Tag color="error" icon={<CloseCircleOutlined />}>
                    {importResult.failedCount} Gagal
                  </Tag>
                </span>
              }
              type={importResult.failedCount > 0 ? 'warning' : 'success'}
              showIcon
            />

            {importResult.failedCount > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Title level={5} type="danger">
                  Daftar Laporan Baris yang Gagal Diimpor:
                </Title>
                <Table
                  rowKey="rowNo"
                  columns={errorColumns}
                  dataSource={importResult.errors}
                  pagination={false}
                  size="small"
                  data-testid="table-import-errors"
                />
              </>
            )}
          </>
        )}
      </Space>
    </Modal>
  );
};
