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
import { adjustmentFormSchema, AdjustmentFormValues } from '../../types/counting';
import { MOCK_ITEMS } from '../../types/item';
import { MOCK_WAREHOUSES, MOCK_LOCATIONS } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const AdjustmentFormPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      warehouseId: 1,
      locationCode: MOCK_LOCATIONS[0].code,
      itemId: MOCK_ITEMS[0].id,
      sku: MOCK_ITEMS[0].sku,
      itemName: MOCK_ITEMS[0].name,
      uom: MOCK_ITEMS[0].baseUom,
      batchNo: 'LOT-SIC-202608-01',
      adjustmentType: 'plus',
      qty: 10,
      reasonCode: 'COUNT_DISCREPANCY',
      notes: 'Penyesuaian hasil temuan stok fisik dilapangan',
    },
  });

  const handleSelectItem = (itemId: number) => {
    const selected = MOCK_ITEMS.find((i) => i.id === itemId);
    if (selected) {
      setValue('itemId', selected.id);
      setValue('sku', selected.sku);
      setValue('itemName', selected.name);
      setValue('uom', selected.baseUom);
    }
  };

  const handleFormSubmit = (_values: AdjustmentFormValues) => {
    notification.success({
      message: 'Penyesuaian Stok Manual (ADJ) Berhasil Diposting (FE-604)',
      description: 'Jurnal pergerakan stok penyesuaian telah resmi dicatat ke kartu stok.',
    });

    navigate('/counting');
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
                        options={MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))}
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
                        options={MOCK_LOCATIONS.map((loc) => ({
                          value: loc.code,
                          label: `${loc.code} - ${loc.name}`,
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
                        options={MOCK_ITEMS.map((item) => ({
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
