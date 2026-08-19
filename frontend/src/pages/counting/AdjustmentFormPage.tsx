import React from 'react';
import {
  Card,
  Input,
  InputNumber,
  Select,
  Radio,
  Button,
  Space,
  Typography,
  Row,
  Col,
  notification,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adjustmentFormSchema, AdjustmentFormValues } from '../../types/counting';
import { warehouseService, itemService, locationService, countService } from '../../api/services';

const { Title, Paragraph, Text } = Typography;

export const AdjustmentFormPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehouseService.list,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: itemService.listItems,
  });

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      warehouseId: 1,
      locationCode: 'JKT01-Z1-R01-B01',
      itemId: 1,
      sku: 'SKU-PITA-001',
      itemName: 'Pita Cukai Hasil Tembakau 2026',
      uom: 'RIM',
      batchNo: 'LOT-SIC-202608-01',
      adjustmentType: 'plus',
      qty: 10,
      reasonCode: 'COUNT_DISCREPANCY',
      notes: 'Penyesuaian hasil temuan stok fisik dilapangan',
    },
  });

  const watchWarehouseId = watch('warehouseId');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', watchWarehouseId],
    queryFn: () => locationService.listLocations(watchWarehouseId),
    enabled: !!watchWarehouseId,
  });

  const handleSelectItem = (itemId: number) => {
    const selected = items.find((i) => i.id === itemId);
    if (selected) {
      setValue('itemId', selected.id);
      setValue('sku', selected.sku);
      setValue('itemName', selected.name);
      setValue('uom', selected.base_uom);
    }
  };

  const handleFormSubmit = async (values: AdjustmentFormValues) => {
    const locationId = locations.find((l) => l.code === values.locationCode)?.id ?? 0;

    try {
      const created = await countService.createAdjustment({
        warehouse_id: values.warehouseId,
        reason_code: values.reasonCode,
        notes: values.notes,
        lines: [
          {
            item_id: values.itemId,
            location_id: locationId,
            qty: values.adjustmentType === 'plus' ? values.qty : -values.qty,
            status: 'available',
          },
        ],
      });

      notification.success({
        message: 'Penyesuaian Stok Manual (ADJ) Berhasil Diposting (FE-604)',
        description: `Dokumen ${created.doc_no} telah dicatat ke kartu stok / ledger.`,
      });

      navigate('/counting');
    } catch {
      notification.error({
        message: 'Gagal Posting Penyesuaian Stok',
        description: 'Pastikan backend tersedia dan coba lagi.',
      });
    }
  };

  return (
    <div data-testid="adjustment-form-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/counting')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Form Penyesuaian Stok Manual (Manual Adjustment - FE-604)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Penyesuaian posisi stok fisik di luar sesi opname berkala.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="adjustment-form">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card variant="borderless" title="1. Lokasi & Identitas Barang">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Pilih Gudang <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="warehouseId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        data-testid="select-adj-warehouse"
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Pilih Lokasi Bin <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="locationCode"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        data-testid="select-adj-bin"
                        options={locations.map((loc) => ({
                          value: loc.code,
                          label: `${loc.code} - ${loc.loc_type}`,
                        }))}
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Pilih SKU Barang <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="itemId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        onChange={(val) => handleSelectItem(val)}
                        data-testid="select-adj-sku"
                        options={items.map((item) => ({
                          value: item.id,
                          label: `[${item.sku}] ${item.name}`,
                        }))}
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Batch / Lot No <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="batchNo"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="Masukkan Batch No" data-testid="input-adj-batch" />
                    )}
                  />
                </Col>
              </Row>
            </Card>

            <Card variant="borderless" title="2. Kuantitas & Justifikasi Alasan Penyesuaian">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Jenis Penyesuaian <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="adjustmentType"
                    control={control}
                    render={({ field }) => (
                      <Radio.Group {...field} buttonStyle="solid" data-testid="radio-adj-type">
                        <Radio.Button value="plus">Tambah Stok (+)</Radio.Button>
                        <Radio.Button value="minus">Kurang Stok (-)</Radio.Button>
                      </Radio.Group>
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Jumlah Qty Penyesuaian <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="qty"
                    control={control}
                    render={({ field }) => (
                      <InputNumber
                        {...field}
                        min={1}
                        style={{ width: '100%' }}
                        data-testid="input-adj-qty"
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Kode Alasan Wajib <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="reasonCode"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        data-testid="select-adj-reason"
                        options={[
                          { value: 'COUNT_DISCREPANCY', label: 'Selisih Hitung Fisik' },
                          { value: 'DAMAGED_ITEM', label: 'Barang Rusak (Damaged)' },
                          { value: 'EXPIRED_ITEM', label: 'Kedaluwarsa (Expired)' },
                          { value: 'LOST_ITEM', label: 'Barang Hilang / Kurang' },
                          { value: 'SYSTEM_CORRECTION', label: 'Koreksi Data Sistem' },
                        ]}
                      />
                    )}
                  />
                </Col>

                <Col xs={24}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Catatan / Justifikasi Penyesuaian <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <Input.TextArea
                        {...field}
                        rows={3}
                        placeholder="Masukkan penjelasan alasan penyesuaian..."
                        status={errors.notes ? 'error' : ''}
                        data-testid="input-adj-notes"
                      />
                    )}
                  />
                  {errors.notes && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {errors.notes.message}
                    </Text>
                  )}
                </Col>
              </Row>
            </Card>

            <Row justify="end">
              <Space>
                <Button onClick={() => navigate('/counting')}>Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSubmitting}
                  data-testid="btn-submit-adjustment"
                >
                  Posting Penyesuaian Stok (ADJ)
                </Button>
              </Space>
            </Row>
          </Space>
        </form>
      </Space>
    </div>
  );
};
