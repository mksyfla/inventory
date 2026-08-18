import React, { useEffect } from 'react';
import {
  Card,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Divider,
  DatePicker,
  Table,
  Tag,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  receiptFormSchema,
  ReceiptFormValues,
  MOCK_GRN_LIST,
} from '../../types/inbound';
import { MOCK_ITEMS } from '../../types/item';
import { MOCK_PARTNERS } from '../../types/partner';
import { MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const ReceiptFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id && id !== 'new');

  const existingGrn = isEditMode
    ? MOCK_GRN_LIST.find((r) => r.id === Number(id) || String(r.id) === String(id)) || MOCK_GRN_LIST[0]
    : null;

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
      poReference: '',
      supplierId: 1,
      warehouseId: 1,
      receiptDate: dayjs().format('YYYY-MM-DD'),
      notes: '',
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyExpected: 10,
          qtyReceived: 10,
          qtyRejected: 0,
          isExpiry: true,
          batchNo: 'LOT-2026-001',
          expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
          targetLocationCode: 'JKT01-Z1-R01-B01',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  // Watch items for field array changes
  const watchItems = watch('items');

  useEffect(() => {
    if (existingGrn) {
      reset({
        poReference: existingGrn.poReference,
        supplierId: existingGrn.supplierId,
        warehouseId: existingGrn.warehouseId,
        receiptDate: existingGrn.receiptDate,
        notes: existingGrn.notes || '',
        items: existingGrn.items.map((i) => ({
          itemId: i.itemId,
          sku: i.sku,
          itemName: i.itemName,
          uom: i.uom,
          qtyExpected: i.qtyExpected,
          qtyReceived: i.qtyReceived,
          qtyRejected: i.qtyRejected,
          isExpiry: i.expiryDate ? true : false,
          batchNo: i.batchNo || '',
          expiryDate: i.expiryDate || '',
          targetLocationCode: i.targetLocationCode || '',
        })),
      });
    }
  }, [existingGrn, reset]);

  const handleItemSelect = (index: number, selectedItemId: number) => {
    const foundItem = MOCK_ITEMS.find((i) => i.id === selectedItemId);
    if (foundItem) {
      setValue(`items.${index}.itemId`, foundItem.id);
      setValue(`items.${index}.sku`, foundItem.sku);
      setValue(`items.${index}.itemName`, foundItem.name);
      setValue(`items.${index}.uom`, foundItem.baseUom);
      setValue(`items.${index}.isExpiry`, foundItem.isExpiry);
      if (foundItem.isExpiry) {
        setValue(`items.${index}.batchNo`, `LOT-${foundItem.sku.split('-')[1] || 'NEW'}-01`);
        setValue(`items.${index}.expiryDate`, dayjs().add(1, 'year').format('YYYY-MM-DD'));
      }
    }
  };

  const handleAddRow = () => {
    append({
      itemId: MOCK_ITEMS[0].id,
      sku: MOCK_ITEMS[0].sku,
      itemName: MOCK_ITEMS[0].name,
      uom: MOCK_ITEMS[0].baseUom,
      qtyExpected: 1,
      qtyReceived: 1,
      qtyRejected: 0,
      isExpiry: MOCK_ITEMS[0].isExpiry,
      batchNo: MOCK_ITEMS[0].isExpiry ? 'LOT-NEW-01' : '',
      expiryDate: MOCK_ITEMS[0].isExpiry ? dayjs().add(1, 'year').format('YYYY-MM-DD') : '',
      targetLocationCode: 'JKT01-STG-IN',
    });
  };

  const onSubmit = (values: ReceiptFormValues, submitStatus: 'draft' | 'submitted') => {
    notification.success({
      message: submitStatus === 'submitted' ? 'Dokumen GRN Berhasil Diajukan' : 'Draft GRN Berhasil Disimpan',
      description: `Dokumen penerimaan PO Ref: ${values.poReference} berstatus '${submitStatus}'.`,
    });
    navigate('/inbound/receipts');
  };

  const tableColumns = [
    {
      title: 'Pilih SKU / Barang',
      key: 'sku',
      width: 220,
      render: (_: any, __: any, index: number) => (
        <div>
          <Controller
            name={`items.${index}.itemId`}
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                style={{ width: '100%' }}
                options={MOCK_ITEMS.map((item) => ({
                  value: item.id,
                  label: `${item.sku} - ${item.name}`,
                }))}
                onChange={(val) => {
                  field.onChange(val);
                  handleItemSelect(index, val);
                }}
                data-testid={`select-item-sku-${index}`}
              />
            )}
          />
          {watchItems?.[index]?.isExpiry && (
            <Tag color="warning" style={{ marginTop: 4, fontSize: 10 }}>
              Wajib Expiry & Batch
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Satuan',
      key: 'uom',
      width: 80,
      render: (_: any, __: any, index: number) => (
        <Text strong style={{ color: '#0052cc' }}>
          {watchItems?.[index]?.uom || 'PCS'}
        </Text>
      ),
    },
    {
      title: 'Qty PO (Expected)',
      key: 'qtyExpected',
      width: 120,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.qtyExpected`}
          control={control}
          render={({ field }) => (
            <InputNumber
              {...field}
              min={1}
              style={{ width: '100%' }}
              data-testid={`input-qty-expected-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'Qty Fisik Diterima',
      key: 'qtyReceived',
      width: 120,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.qtyReceived`}
          control={control}
          render={({ field }) => (
            <InputNumber
              {...field}
              min={0}
              style={{ width: '100%' }}
              data-testid={`input-qty-received-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'Qty QC Reject',
      key: 'qtyRejected',
      width: 120,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.qtyRejected`}
          control={control}
          render={({ field }) => (
            <InputNumber
              {...field}
              min={0}
              style={{ width: '100%' }}
              data-testid={`input-qty-rejected-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'No. Batch / Lot',
      key: 'batchNo',
      width: 150,
      render: (_: any, __: any, index: number) => (
        <div>
          <Controller
            name={`items.${index}.batchNo`}
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                value={field.value || ''}
                placeholder={watchItems?.[index]?.isExpiry ? 'Wajib Batch' : 'Opsional Batch'}
                data-testid={`input-batch-no-${index}`}
              />
            )}
          />
          {errors.items?.[index]?.batchNo && (
            <Text type="danger" style={{ fontSize: 10 }}>
              {errors.items[index]?.batchNo?.message}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Tgl Kedaluwarsa',
      key: 'expiryDate',
      width: 150,
      render: (_: any, __: any, index: number) => (
        <div>
          <Controller
            name={`items.${index}.expiryDate`}
            control={control}
            render={({ field }) => (
              <DatePicker
                value={field.value ? dayjs(field.value) : null}
                onChange={(date) => field.onChange(date ? date.format('YYYY-MM-DD') : '')}
                style={{ width: '100%' }}
                placeholder="YYYY-MM-DD"
                data-testid={`datepicker-expiry-${index}`}
              />
            )}
          />
          {errors.items?.[index]?.expiryDate && (
            <Text type="danger" style={{ fontSize: 10 }}>
              {errors.items[index]?.expiryDate?.message}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Target Storage Bin',
      key: 'targetLocationCode',
      width: 150,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.targetLocationCode`}
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              value={field.value || ''}
              placeholder="Contoh: JKT01-STG-IN"
              data-testid={`input-target-bin-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <Button
          type="text"
          danger
          disabled={fields.length <= 1}
          icon={<DeleteOutlined />}
          onClick={() => remove(index)}
          data-testid={`btn-remove-row-${index}`}
        />
      ),
    },
  ];

  return (
    <div data-testid="receipt-form-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inbound/receipts')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {isEditMode ? `Edit Draft Dokumen GRN: ${existingGrn?.documentNo}` : 'Buat Dokumen Penerimaan (GRN) Baru'}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Input data fisik penerimaan dari Pemasok, nomor batch, tanggal kedaluwarsa, dan inspeksi QC.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <form onSubmit={handleSubmit((values) => onSubmit(values, 'draft'))} data-testid="form-receipt">
          <Card variant="borderless" title="1. Informasi Dokumen Inbound Header">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Referensi No. PO <Text type="danger">*</Text>
                </label>
                <Controller
                  name="poReference"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="Contoh: PO-2026-0199"
                      status={errors.poReference ? 'error' : ''}
                      data-testid="input-po-reference"
                    />
                  )}
                />
                {errors.poReference && <Text type="danger" style={{ fontSize: 12 }}>{errors.poReference.message}</Text>}
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Pemasok (Supplier) <Text type="danger">*</Text>
                </label>
                <Controller
                  name="supplierId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      style={{ width: '100%' }}
                      options={MOCK_PARTNERS.filter((p) => p.type === 'supplier').map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                      placeholder="Pilih Pemasok"
                      data-testid="select-supplier"
                    />
                  )}
                />
                {errors.supplierId && <Text type="danger" style={{ fontSize: 12 }}>{errors.supplierId.message}</Text>}
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Gudang Tujuan Penerimaan <Text type="danger">*</Text>
                </label>
                <Controller
                  name="warehouseId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      style={{ width: '100%' }}
                      options={MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))}
                      placeholder="Pilih Gudang Tujuan"
                      data-testid="select-warehouse"
                    />
                  )}
                />
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Tanggal Penerimaan Fisik <Text type="danger">*</Text>
                </label>
                <Controller
                  name="receiptDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value ? dayjs(field.value) : null}
                      onChange={(date) => field.onChange(date ? date.format('YYYY-MM-DD') : '')}
                      style={{ width: '100%' }}
                      data-testid="datepicker-receipt-date"
                    />
                  )}
                />
              </Col>

              <Col xs={24} md={16}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Catatan Tambahan Penerimaan</label>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} value={field.value || ''} placeholder="Catatan kondisi segel truk/kontainer" data-testid="input-notes" />
                  )}
                />
              </Col>
            </Row>
          </Card>

          <Divider />

          <Card
            variant="borderless"
            title="2. Rincian Baris Barang Penerimaan (Dynamic SKU Line Items)"
            extra={
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddRow}
                data-testid="btn-add-item-row"
              >
                Tambah Baris SKU
              </Button>
            }
          >
            {errors.items?.root && (
              <Alert
                message={errors.items.root.message}
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Table
              rowKey="id"
              columns={tableColumns}
              dataSource={fields}
              pagination={false}
              scroll={{ x: 1100 }}
              data-testid="table-form-items"
            />
          </Card>

          <Divider />

          <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
            <Col>
              <Text type="secondary" style={{ fontSize: 13 }}>
                <AlertOutlined /> Pastikan nomor lot/batch dan tanggal expiry telah diverifikasi sebelum mengajukan dokumen.
              </Text>
            </Col>
            <Col>
              <Space>
                <Button onClick={() => navigate('/inbound/receipts')}>Batal</Button>

                <Button
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSubmitting}
                  data-testid="btn-save-draft"
                >
                  Simpan Saja (Draft)
                </Button>

                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={isSubmitting}
                  onClick={handleSubmit((values) => onSubmit(values, 'submitted'))}
                  data-testid="btn-save-submit"
                >
                  Simpan & Ajukan (Submit)
                </Button>
              </Space>
            </Col>
          </Row>
        </form>
      </Space>
    </div>
  );
};
