import React, { useEffect } from 'react';
import {
  Card,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Divider,
  Tabs,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, BarcodeOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { itemSchema, ItemFormValues, MOCK_CATEGORIES } from '../../types/item';
import { useMutationWithToast } from '../../hooks/useMutationWithToast';
import { itemService } from '../../api/services/items';
import { mapItemDTO } from '../../api/mappers';
import { ItemUomTab } from '../../components/master/ItemUomTab';

const { Title, Paragraph, Text } = Typography;

export const ItemFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id && id !== 'new');
  const itemId = isEditMode ? Number(id) : undefined;

  const { data: existingItem } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      const dto = await itemService.getItem(itemId as number);
      return mapItemDTO(dto.item);
    },
    enabled: Boolean(isEditMode && itemId),
  });


  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      sku: '',
      name: '',
      categoryId: 1,
      baseUom: 'PCS',
      minQty: 10,
      maxQty: 100,
      safetyStock: 5,
      leadTimeDays: 7,
      abcClass: 'A',
      isBatch: false,
      isExpiry: false,
      isSerial: false,
    },
  });

  const isExpiryWatch = watch('isExpiry');
  const baseUomWatch = watch('baseUom');

  // Auto-check isBatch if isExpiry is enabled
  useEffect(() => {
    if (isExpiryWatch) {
      setValue('isBatch', true);
    }
  }, [isExpiryWatch, setValue]);

  // Load existing item in Edit mode
  useEffect(() => {
    if (existingItem) {
      reset({
        sku: existingItem.sku,
        name: existingItem.name,
        categoryId: existingItem.categoryId || 1,
        baseUom: existingItem.baseUom,
        minQty: existingItem.minQty,
        maxQty: existingItem.maxQty,
        safetyStock: existingItem.safetyStock,
        leadTimeDays: existingItem.leadTimeDays,
        abcClass: existingItem.abcClass,
        isBatch: existingItem.isBatch,
        isExpiry: existingItem.isExpiry,
        isSerial: existingItem.isSerial,
      });
    }
  }, [existingItem, reset]);

  const saveMutation = useMutationWithToast({
    mutationFn: async (values: ItemFormValues) => {
      const payload = {
        sku: values.sku,
        name: values.name,
        category_id: values.categoryId || null,
        base_uom: values.baseUom,
        is_batch: values.isBatch,
        is_expiry: values.isExpiry,
        is_serial: values.isSerial,
        min_qty: values.minQty,
        max_qty: values.maxQty ?? null,
        safety_stock: values.safetyStock,
        lead_time_days: values.leadTimeDays,
        abc_class: values.abcClass ?? null,
      };
      if (isEditMode && itemId) {
        return itemService.updateItem(itemId, payload);
      }
      return itemService.createItem(payload);
    },
    successTitle: isEditMode ? 'SKU Berhasil Diperbarui' : 'SKU Baru Berhasil Dibuat',
    successMessage: 'Data barang telah disimpan ke database master.',
    invalidateKeys: [['items'], ['item']],
    onSuccess: () => navigate('/master/items'),
  });

  const onSubmit = (values: ItemFormValues) => {
    saveMutation.mutate(values);
  };

  const formTabContent = (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="item-form">
      <Card variant="borderless">
        <Title level={4}>1. Identitas Utama Barang</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Kode SKU <Text type="danger">*</Text>
            </label>
            <Controller
              name="sku"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder="Contoh: SKU-INK-001"
                  disabled={isEditMode}
                  status={errors.sku ? 'error' : ''}
                  data-testid="input-sku"
                />
              )}
            />
            {errors.sku && <Text type="danger" style={{ fontSize: 12 }}>{errors.sku.message}</Text>}
          </Col>

          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Nama Barang <Text type="danger">*</Text>
            </label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder="Masukkan nama barang lengkap"
                  status={errors.name ? 'error' : ''}
                  data-testid="input-name"
                />
              )}
            />
            {errors.name && <Text type="danger" style={{ fontSize: 12 }}>{errors.name.message}</Text>}
          </Col>

          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Kategori Barang <Text type="danger">*</Text>
            </label>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  options={MOCK_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Pilih Kategori"
                  data-testid="select-category"
                />
              )}
            />
            {errors.categoryId && <Text type="danger" style={{ fontSize: 12 }}>{errors.categoryId.message}</Text>}
          </Col>

          <Col xs={24} md={12}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Satuan Dasar (Base UoM) <Text type="danger">*</Text>
            </label>
            <Controller
              name="baseUom"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'PCS', label: 'PCS (Pieces)' },
                    { value: 'BOX', label: 'BOX (Dus)' },
                    { value: 'CAN', label: 'CAN (Kaleng)' },
                    { value: 'ROLL', label: 'ROLL (Gulungan)' },
                    { value: 'KG', label: 'KG (Kilogram)' },
                    { value: 'LITER', label: 'LITER' },
                  ]}
                  placeholder="Pilih Satuan Dasar"
                  data-testid="select-base-uom"
                />
              )}
            />
            {errors.baseUom && <Text type="danger" style={{ fontSize: 12 }}>{errors.baseUom.message}</Text>}
          </Col>
        </Row>

        <Divider />

        <Title level={4}>2. Perencanaan Persediaan & Batas Stok</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Batas Stok Minimum</label>
            <Controller
              name="minQty"
              control={control}
              render={({ field }) => (
                <InputNumber
                  {...field}
                  style={{ width: '100%' }}
                  min={0}
                  placeholder="0"
                  data-testid="input-min-qty"
                />
              )}
            />
            {errors.minQty && <Text type="danger" style={{ fontSize: 12 }}>{errors.minQty.message}</Text>}
          </Col>

          <Col xs={24} sm={12} md={6}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Batas Stok Maksimum</label>
            <Controller
              name="maxQty"
              control={control}
              render={({ field }) => (
                <InputNumber
                  {...field}
                  value={field.value ?? undefined}
                  onChange={(val) => field.onChange(val)}
                  style={{ width: '100%' }}
                  min={0}
                  placeholder="Opsional"
                  status={errors.maxQty ? 'error' : ''}
                  data-testid="input-max-qty"
                />
              )}
            />
            {errors.maxQty && <Text type="danger" style={{ fontSize: 12 }}>{errors.maxQty.message}</Text>}
          </Col>

          <Col xs={24} sm={12} md={6}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Safety Stock</label>
            <Controller
              name="safetyStock"
              control={control}
              render={({ field }) => (
                <InputNumber {...field} style={{ width: '100%' }} min={0} data-testid="input-safety-stock" />
              )}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Lead Time (Hari)</label>
            <Controller
              name="leadTimeDays"
              control={control}
              render={({ field }) => (
                <InputNumber {...field} style={{ width: '100%' }} min={0} data-testid="input-lead-time" />
              )}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Klasifikasi ABC</label>
            <Controller
              name="abcClass"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'A', label: 'Kelas A (Fast Moving)' },
                    { value: 'B', label: 'Kelas B (Medium)' },
                    { value: 'C', label: 'Kelas C (Slow Moving)' },
                  ]}
                  allowClear
                  placeholder="Opsional"
                  data-testid="select-abc-class"
                />
              )}
            />
          </Col>
        </Row>

        <Divider />

        <Title level={4}>3. Atribut Pelacakan & Konfigurasi Transaksi</Title>
        <Alert
          message="Aturan Batasan Database (Database Constraint Rules)"
          description="Jika opsi 'Memiliki Tanggal Kedaluwarsa' diaktifkan, maka opsi 'Pelacakan Nomor Batch' otomatis wajib diaktifkan (chk_expiry_needs_batch)."
          type="warning"
          showIcon
          style={{ marginBottom: 20 }}
        />

        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Card type="inner" title="Pelacakan Batch / Lot">
              <Controller
                name="isBatch"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch
                      checked={field.value}
                      onChange={(val) => field.onChange(val)}
                      data-testid="switch-is-batch"
                    />
                    <span>{field.value ? 'Wajib Input No. Batch' : 'Tidak Memakai Batch'}</span>
                  </Space>
                )}
              />
              {errors.isBatch && (
                <div style={{ marginTop: 8 }}>
                  <Text type="danger" style={{ fontSize: 12 }}>{errors.isBatch.message}</Text>
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card type="inner" title="Pelacakan Tanggal Kedaluwarsa">
              <Controller
                name="isExpiry"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch
                      checked={field.value}
                      onChange={(val) => field.onChange(val)}
                      data-testid="switch-is-expiry"
                    />
                    <span>{field.value ? 'Wajib Input Expiry Date' : 'Tidak Ada Expiry'}</span>
                  </Space>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card type="inner" title="Pelacakan Nomor Seri (Serial Number)">
              <Controller
                name="isSerial"
                control={control}
                render={({ field }) => (
                  <Space>
                    <Switch
                      checked={field.value}
                      onChange={(val) => field.onChange(val)}
                      data-testid="switch-is-serial"
                    />
                    <span>{field.value ? 'Wajib Input Serial Number' : 'Tidak Memakai Serial'}</span>
                  </Space>
                )}
              />
            </Card>
          </Col>
        </Row>

        <Divider />

        <Row justify="end">
          <Space>
            <Button onClick={() => navigate('/master/items')}>Batal</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={isSubmitting}
              data-testid="btn-submit-item-form"
            >
              {isEditMode ? 'Simpan Perubahan SKU' : 'Simpan SKU Baru'}
            </Button>
          </Space>
        </Row>
      </Card>
    </form>
  );

  return (
    <div data-testid="item-form-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Navigation & Title */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/master/items')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {isEditMode ? `Edit Data Barang: ${existingItem?.sku}` : 'Tambah Barang (SKU) Baru'}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Isi informasi master barang, spesifikasi UoM, batas stok, dan atribut pelacakan.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <Tabs
          defaultActiveKey="info"
          items={[
            {
              key: 'info',
              label: (
                <span>
                  <AppstoreOutlined /> Informasi Utama SKU
                </span>
              ),
              children: formTabContent,
            },
            {
              key: 'uom',
              label: (
                <span>
                  <BarcodeOutlined /> Konversi Satuan & Barcode (UoM)
                </span>
              ),
              children: (
                <Card variant="borderless">
                  <ItemUomTab itemId={existingItem?.id} baseUom={baseUomWatch || 'PCS'} />
                </Card>
              ),
            },
          ]}
        />
      </Space>
    </div>
  );
};
