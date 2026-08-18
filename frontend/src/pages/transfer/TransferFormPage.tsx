import React from 'react';
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
  DatePicker,
  notification,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { transferFormSchema, TransferFormValues } from '../../types/transfer';
import { MOCK_ITEMS } from '../../types/item';
import { MOCK_WAREHOUSES } from '../../types/location';

const { Title, Paragraph, Text } = Typography;

export const TransferFormPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      originWarehouseId: 1,
      destinationWarehouseId: 2,
      transferDate: dayjs().format('YYYY-MM-DD'),
      driverName: 'Sujono (Kurir Peruri)',
      vehiclePlateNo: 'B 9842 PQA',
      notes: 'Pengiriman persediaan barang antar gudang cabang',
      items: [
        {
          itemId: MOCK_ITEMS[0].id,
          sku: MOCK_ITEMS[0].sku,
          itemName: MOCK_ITEMS[0].name,
          uom: MOCK_ITEMS[0].baseUom,
          batchNo: 'LOT-SIC-202608-01',
          expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
          qtySent: 50,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchOriginId = watch('originWarehouseId');

  const handleSelectItem = (index: number, itemId: number) => {
    const selected = MOCK_ITEMS.find((i) => i.id === itemId);
    if (selected) {
      setValue(`items.${index}.itemId`, selected.id);
      setValue(`items.${index}.sku`, selected.sku);
      setValue(`items.${index}.itemName`, selected.name);
      setValue(`items.${index}.uom`, selected.baseUom);
    }
  };

  const handleFormSubmit = (_values: TransferFormValues) => {
    notification.success({
      message: 'Pengiriman Mutasi Berhasil Diposting',
      description: 'Stok pada gudang asal telah berkurang dan berpindah ke status In-Transit.',
    });

    navigate('/transfer');
  };

  return (
    <div data-testid="transfer-form-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transfer')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Form Pengiriman Mutasi Antar Gudang (Transfer Out)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Pengeluaran barang dari gudang asal menuju gudang tujuan (Status In-Transit).
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <form onSubmit={handleSubmit(handleFormSubmit)} data-testid="transfer-form">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {errors.destinationWarehouseId && (
              <Alert
                message="Error Validasi Gudang"
                description={errors.destinationWarehouseId.message}
                type="error"
                showIcon
                data-testid="alert-warehouse-error"
              />
            )}

            <Card variant="borderless" title="1. Informasi Gudang & Armada Pengiriman">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Gudang Asal (Origin) <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="originWarehouseId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        data-testid="select-origin-warehouse"
                        options={MOCK_WAREHOUSES.map((w) => ({
                          value: w.id,
                          label: `${w.code} - ${w.name}`,
                        }))}
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={12}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Gudang Tujuan (Destination) <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="destinationWarehouseId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        data-testid="select-destination-warehouse"
                        status={errors.destinationWarehouseId ? 'error' : ''}
                        options={MOCK_WAREHOUSES.map((w) => ({
                          value: w.id,
                          label: `${w.code} - ${w.name}`,
                          disabled: w.id === watchOriginId,
                        }))}
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Tanggal Kirim <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="transferDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        style={{ width: '100%' }}
                        value={field.value ? dayjs(field.value) : null}
                        onChange={(date) => field.onChange(date ? date.format('YYYY-MM-DD') : '')}
                        data-testid="datepicker-transfer-date"
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Nama Driver / Pengemudi</label>
                  <Controller
                    name="driverName"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="Nama driver" data-testid="input-driver-name" />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Plat Nomor Kendaraan</label>
                  <Controller
                    name="vehiclePlateNo"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="Plat nomor" data-testid="input-vehicle-plate" />
                    )}
                  />
                </Col>

                <Col xs={24}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Catatan Pengiriman</label>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <Input.TextArea {...field} rows={2} placeholder="Catatan khusus mutasi barang" data-testid="input-notes" />
                    )}
                  />
                </Col>
              </Row>
            </Card>

            <Card
              variant="borderless"
              title="2. Rincian Barang Dimutasi"
              extra={
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    append({
                      itemId: MOCK_ITEMS[0].id,
                      sku: MOCK_ITEMS[0].sku,
                      itemName: MOCK_ITEMS[0].name,
                      uom: MOCK_ITEMS[0].baseUom,
                      batchNo: 'LOT-2026-001',
                      expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
                      qtySent: 10,
                    })
                  }
                  data-testid="btn-add-item-line"
                >
                  Tambah Baris Barang
                </Button>
              }
            >
              {fields.map((fieldItem, index) => (
                <Card
                  key={fieldItem.id}
                  type="inner"
                  style={{ marginBottom: 16 }}
                  title={`Baris #${index + 1}`}
                  extra={
                    fields.length > 1 && (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(index)}
                        data-testid={`btn-remove-item-${index}`}
                      >
                        Hapus
                      </Button>
                    )
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Pilih SKU Barang</label>
                      <Controller
                        name={`items.${index}.itemId`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            style={{ width: '100%' }}
                            onChange={(val) => handleSelectItem(index, val)}
                            data-testid={`select-item-sku-${index}`}
                            options={MOCK_ITEMS.map((item) => ({
                              value: item.id,
                              label: `${item.sku} - ${item.name}`,
                            }))}
                          />
                        )}
                      />
                    </Col>

                    <Col xs={24} md={6}>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Batch / Lot No</label>
                      <Controller
                        name={`items.${index}.batchNo`}
                        control={control}
                        render={({ field }) => (
                          <Input {...field} placeholder="Batch No" data-testid={`input-batch-${index}`} />
                        )}
                      />
                    </Col>

                    <Col xs={24} md={5}>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Jumlah Dikirim</label>
                      <Controller
                        name={`items.${index}.qtySent`}
                        control={control}
                        render={({ field }) => (
                          <InputNumber
                            {...field}
                            min={1}
                            style={{ width: '100%' }}
                            data-testid={`input-qty-sent-${index}`}
                          />
                        )}
                      />
                    </Col>

                    <Col xs={24} md={5}>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Satuan</label>
                      <Controller
                        name={`items.${index}.uom`}
                        control={control}
                        render={({ field }) => <Input {...field} disabled data-testid={`input-uom-${index}`} />}
                      />
                    </Col>
                  </Row>
                </Card>
              ))}
            </Card>

            <Row justify="end">
              <Space>
                <Button onClick={() => navigate('/transfer')}>Batal</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSubmitting}
                  data-testid="btn-submit-transfer"
                >
                  Kirim Barang Mutasi (Transfer Out)
                </Button>
              </Space>
            </Row>
          </Space>
        </form>
      </Space>
    </div>
  );
};
