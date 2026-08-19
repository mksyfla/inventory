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
  Divider,
  DatePicker,
  Table,
  notification,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { requestFormSchema, RequestFormValues } from '../../types/outbound';
import { itemService } from '../../api/services/items';
import { warehouseService } from '../../api/services/warehouses';
import { partnerService } from '../../api/services/partners';
import { documentService } from '../../api/services/documents';
import { outboundService } from '../../api/services/outbound';
import { mapItemDTO, mapWarehouseDTO, mapDocumentToItemRequest } from '../../api/mappers';

const { Title, Paragraph, Text } = Typography;

export const RequestFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id && id !== 'new');

  // Live item master + warehouse master for the SKU/warehouse selectors.
  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: async () => (await itemService.listItems()).map(mapItemDTO),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await warehouseService.list()).map(mapWarehouseDTO),
  });

  // Edit mode loads the existing draft from the backend document store.
  const { data: existingRequest } = useQuery({
    queryKey: ['request-detail', id],
    queryFn: async () => {
      const dto = await documentService.getDetail(Number(id));
      return mapDocumentToItemRequest(dto, dto.lines);
    },
    enabled: isEditMode,
  });

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      requestingUnit: '',
      warehouseId: 1,
      requiredDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
      priority: 'normal',
      notes: '',
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyRequested: 5,
          notes: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchItems = watch('items');

  useEffect(() => {
    if (existingRequest) {
      reset({
        requestingUnit: existingRequest.requestingUnit,
        warehouseId: existingRequest.warehouseId,
        requiredDate: existingRequest.requiredDate,
        priority: existingRequest.priority,
        notes: existingRequest.notes || '',
        items: existingRequest.items.map((i) => ({
          itemId: i.itemId,
          sku: i.sku,
          itemName: i.itemName,
          uom: i.uom,
          qtyRequested: i.qtyRequested,
          notes: i.notes || '',
        })),
      });
    }
  }, [existingRequest, reset]);

  const handleItemSelect = (index: number, selectedItemId: number) => {
    const foundItem = items.find((i) => i.id === selectedItemId);
    if (foundItem) {
      setValue(`items.${index}.itemId`, foundItem.id);
      setValue(`items.${index}.sku`, foundItem.sku);
      setValue(`items.${index}.itemName`, foundItem.name);
      setValue(`items.${index}.uom`, foundItem.baseUom);
    }
  };

  const handleAddRow = () => {
    const first = items[0];
    append({
      itemId: first?.id ?? 0,
      sku: first?.sku ?? '',
      itemName: first?.name ?? '',
      uom: first?.baseUom ?? 'PCS',
      qtyRequested: 1,
      notes: '',
    });
  };

  const onSubmit = async (values: RequestFormValues, submitStatus: 'draft' | 'submitted') => {
    try {
      // The backend REQ document references the requesting unit as a master
      // partner, so resolve the free-text unit name to its partner id.
      const partners = await partnerService.listPartners();
      const partner = partners.find((p) =>
        p.name.toLowerCase().includes(values.requestingUnit.toLowerCase())
      );
      if (!partner) {
        notification.error({
          message: 'Unit Peminta Tidak Ditemukan',
          description: `Tidak ada partner "${values.requestingUnit}" di master partner. Gunakan nama unit yang terdaftar.`,
        });
        return;
      }
      await outboundService.createRequest({
        warehouse_id: values.warehouseId,
        partner_id: partner.id,
        notes: values.notes || null,
        lines: values.items.map((i) => ({
          item_id: i.itemId,
          qty: i.qtyRequested,
          uom: i.uom,
          notes: i.notes || null,
        })),
      });
      notification.success({
        message: submitStatus === 'submitted' ? 'Permintaan Barang Berhasil Diajukan' : 'Draft Permintaan Berhasil Disimpan',
        description: `Permintaan barang dari ${values.requestingUnit} berstatus '${submitStatus}'.`,
      });
      navigate('/outbound/requests');
    } catch {
      notification.error({
        message: 'Gagal Menyimpan Permintaan',
        description: 'Terjadi kesalahan saat mengirim permintaan ke server.',
      });
    }
  };

  const tableColumns = [
    {
      title: 'Pilih SKU / Barang',
      key: 'sku',
      width: 280,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.itemId`}
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              style={{ width: '100%' }}
              options={items.map((item) => ({
                value: item.id,
                label: `${item.sku} - ${item.name}`,
              }))}
              onChange={(val) => {
                field.onChange(val);
                handleItemSelect(index, val);
              }}
              data-testid={`select-request-sku-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'Satuan',
      key: 'uom',
      width: 90,
      render: (_: any, __: any, index: number) => (
        <Text strong style={{ color: '#0052cc' }}>
          {watchItems?.[index]?.uom || 'PCS'}
        </Text>
      ),
    },
    {
      title: 'Jumlah Diminta (Qty)',
      key: 'qtyRequested',
      width: 140,
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.qtyRequested`}
          control={control}
          render={({ field }) => (
            <InputNumber
              {...field}
              min={1}
              style={{ width: '100%' }}
              data-testid={`input-qty-requested-${index}`}
            />
          )}
        />
      ),
    },
    {
      title: 'Catatan Kebutuhan per Baris SKU',
      key: 'notes',
      render: (_: any, __: any, index: number) => (
        <Controller
          name={`items.${index}.notes`}
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              value={field.value || ''}
              placeholder="Contoh: Spesifikasi kemasan khusus"
              data-testid={`input-item-notes-${index}`}
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
          data-testid={`btn-remove-request-row-${index}`}
        />
      ),
    },
  ];

  return (
    <div data-testid="request-form-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/outbound/requests')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {isEditMode ? `Edit Draft Permintaan: ${existingRequest?.requestNo}` : 'Pengajuan Permintaan Barang Baru'}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Form input daftar kebutuhan barang oleh unit kerja / cabang untuk diproses gudang.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <form onSubmit={handleSubmit((values) => onSubmit(values, 'draft'))} data-testid="form-request">
          <Card variant="borderless" title="1. Informasi Header Permintaan Barang">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Unit / Divisi Peminta <Text type="danger">*</Text>
                </label>
                <Controller
                  name="requestingUnit"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="Contoh: Divisi Cetak Paspor"
                      status={errors.requestingUnit ? 'error' : ''}
                      data-testid="input-requesting-unit"
                    />
                  )}
                />
                {errors.requestingUnit && (
                  <Text type="danger" style={{ fontSize: 12 }}>{errors.requestingUnit.message}</Text>
                )}
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Gudang Asal Barang <Text type="danger">*</Text>
                </label>
                <Controller
                  name="warehouseId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      style={{ width: '100%' }}
                      options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                      placeholder="Pilih Gudang Asal"
                      data-testid="select-request-warehouse"
                    />
                  )}
                />
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Tanggal Dibutuhkan <Text type="danger">*</Text>
                </label>
                <Controller
                  name="requiredDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value ? dayjs(field.value) : null}
                      onChange={(date) => field.onChange(date ? date.format('YYYY-MM-DD') : '')}
                      style={{ width: '100%' }}
                      data-testid="datepicker-required-date"
                    />
                  )}
                />
              </Col>

              <Col xs={24} md={8}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Prioritas Permintaan <Text type="danger">*</Text>
                </label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'normal', label: 'Normal (Jadwal Standar)' },
                        { value: 'urgent', label: 'Urgent (Dibutuhkan Segera)' },
                      ]}
                      data-testid="select-request-priority"
                    />
                  )}
                />
              </Col>

              <Col xs={24} md={16}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Catatan / Alasan Keperluan</label>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Keterangan alokasi proyek atau pesanan produksi"
                      data-testid="input-request-notes"
                    />
                  )}
                />
              </Col>
            </Row>
          </Card>

          <Divider />

          <Card
            variant="borderless"
            title="2. Rincian SKU Barang yang Diminta"
            extra={
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddRow}
                data-testid="btn-add-request-item-row"
              >
                Tambah Baris SKU
              </Button>
            }
          >
            <Table
              rowKey="id"
              columns={tableColumns}
              dataSource={fields}
              pagination={false}
              data-testid="table-request-form-items"
            />
          </Card>

          <Divider />

          <Row justify="end" align="middle" style={{ marginBottom: 24 }}>
            <Space>
              <Button onClick={() => navigate('/outbound/requests')}>Batal</Button>

              <Button
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={isSubmitting}
                data-testid="btn-save-request-draft"
              >
                Simpan Sebagai Draft
              </Button>

              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={isSubmitting}
                onClick={handleSubmit((values) => onSubmit(values, 'submitted'))}
                data-testid="btn-save-request-submit"
              >
                Simpan & Ajukan Permintaan
              </Button>
            </Space>
          </Row>
        </form>
      </Space>
    </div>
  );
};
