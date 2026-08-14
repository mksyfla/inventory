import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
  Alert,
  Popconfirm,
  Tooltip,
  notification,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BarcodeOutlined, SwapOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ItemUom, itemUomSchema, ItemUomFormValues, MOCK_ITEM_UOMS } from '../../types/uom';

const { Text, Title, Paragraph } = Typography;

export interface ItemUomTabProps {
  itemId?: number;
  baseUom: string;
}

export const ItemUomTab: React.FC<ItemUomTabProps> = ({ itemId = 1, baseUom = 'PCS' }) => {
  const [uomList, setUomList] = useState<ItemUom[]>(() => {
    return MOCK_ITEM_UOMS.filter((u) => u.itemId === itemId);
  });

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingUom, setEditingUom] = useState<ItemUom | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ItemUomFormValues>({
    resolver: zodResolver(itemUomSchema),
    defaultValues: {
      uomName: '',
      conversionFactor: 1,
      barcode: '',
    },
  });

  const handleOpenAddModal = () => {
    setEditingUom(null);
    reset({
      uomName: '',
      conversionFactor: 2,
      barcode: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (uom: ItemUom) => {
    setEditingUom(uom);
    reset({
      uomName: uom.uomName,
      conversionFactor: uom.conversionFactor,
      barcode: uom.barcode || '',
    });
    setModalOpen(true);
  };

  const handleDeleteUom = (id: number) => {
    const target = uomList.find((u) => u.id === id);
    if (target?.isBaseUom) {
      notification.error({
        message: 'Gagal Menghapus Satuan',
        description: 'Satuan dasar (Base UoM) tidak dapat dihapus dari daftar konversi.',
      });
      return;
    }

    setUomList((prev) => prev.filter((u) => u.id !== id));
    notification.success({
      message: 'Satuan Berhasil Dihapus',
      description: `Konversi ${target?.uomName} telah dihapus.`,
    });
  };

  const onSubmit = (values: ItemUomFormValues) => {
    // Check barcode uniqueness across current list
    if (values.barcode) {
      const duplicateBarcode = uomList.find(
        (u) => u.barcode === values.barcode && u.id !== editingUom?.id
      );
      if (duplicateBarcode) {
        setError('barcode', {
          type: 'manual',
          message: `Barcode '${values.barcode}' sudah digunakan oleh satuan ${duplicateBarcode.uomName}. Barcode harus unik!`,
        });
        return;
      }
    }

    // Check UoM Name uniqueness
    const duplicateName = uomList.find(
      (u) => u.uomName.toUpperCase() === values.uomName.toUpperCase() && u.id !== editingUom?.id
    );
    if (duplicateName) {
      setError('uomName', {
        type: 'manual',
        message: `Satuan '${values.uomName}' sudah terdaftar pada SKU ini.`,
      });
      return;
    }

    if (editingUom) {
      // Update existing UoM
      setUomList((prev) =>
        prev.map((u) =>
          u.id === editingUom.id
            ? {
                ...u,
                uomName: values.uomName,
                conversionFactor: values.conversionFactor,
                barcode: values.barcode || undefined,
              }
            : u
        )
      );
      notification.success({ message: 'Konversi Satuan Berhasil Diperbarui' });
    } else {
      // Create new UoM
      const newUom: ItemUom = {
        id: Date.now(),
        itemId,
        uomName: values.uomName,
        conversionFactor: values.conversionFactor,
        barcode: values.barcode || undefined,
        isBaseUom: false,
      };
      setUomList((prev) => [...prev, newUom]);
      notification.success({ message: 'Konversi Satuan Baru Berhasil Ditambahkan' });
    }

    setModalOpen(false);
  };

  const columns = [
    {
      title: 'Nama Satuan (UoM)',
      dataIndex: 'uomName',
      key: 'uomName',
      render: (name: string, record: ItemUom) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isBaseUom && <Tag color="blue">Satuan Dasar</Tag>}
        </Space>
      ),
    },
    {
      title: 'Nisbah Konversi ke Base UoM',
      key: 'conversionFactor',
      render: (_: any, record: ItemUom) => (
        <Space>
          <SwapOutlined style={{ color: '#0052cc' }} />
          <Text>
            1 {record.uomName} = <strong>{record.conversionFactor}</strong> {baseUom}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Barcode Satuan',
      dataIndex: 'barcode',
      key: 'barcode',
      render: (barcode?: string) =>
        barcode ? (
          <Space>
            <BarcodeOutlined style={{ color: '#52c41a' }} />
            <Text code>{barcode}</Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Tidak Ada Barcode</Text>
        ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 120,
      render: (_: any, record: ItemUom) =>
        record.isBaseUom ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Satuan Utama</Text>
        ) : (
          <Space size={8}>
            <Tooltip title="Edit Konversi">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#0052cc' }} />}
                onClick={() => handleOpenEditModal(record)}
                data-testid={`btn-edit-uom-${record.id}`}
              />
            </Tooltip>
            <Popconfirm
              title="Hapus Satuan Alternatif?"
              description={`Yakin ingin menghapus konversi ${record.uomName}?`}
              onConfirm={() => handleDeleteUom(record.id)}
              okText="Ya, Hapus"
              cancelText="Batal"
              data-testid={`popconfirm-delete-uom-${record.id}`}
            >
              <Tooltip title="Hapus Satuan">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  data-testid={`btn-delete-uom-${record.id}`}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div data-testid="item-uom-tab">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          message={`Satuan Dasar Terdaftar: ${baseUom}`}
          description={`Semua rasio konversi satuan alternatif di bawah ini akan dihitung relatif terhadap 1 ${baseUom}. Barcode khusus per satuan digunakan saat scanning penerimaan atau pengeluaran.`}
          type="info"
          showIcon
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              Daftar Satuan Alternatif & Barcode
            </Title>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              Kelola rasio konversi grosir/kemasan (contoh: 1 KARTON = 48 {baseUom}).
            </Paragraph>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAddModal}
            data-testid="btn-add-uom"
          >
            Tambah Satuan Alternatif
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={uomList}
          pagination={false}
          data-testid="table-item-uoms"
        />
      </Space>

      {/* Add / Edit UoM Modal */}
      <Modal
        open={modalOpen}
        title={editingUom ? `Edit Konversi Satuan ${editingUom.uomName}` : 'Tambah Satuan Alternatif Baru'}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        data-testid="modal-uom-form"
      >
        <form onSubmit={handleSubmit(onSubmit)} data-testid="form-uom">
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="middle">
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Satuan (UoM) <Text type="danger">*</Text>
              </label>
              <Controller
                name="uomName"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="Contoh: BOX, KARTON, PACK"
                    style={{ textTransform: 'uppercase' }}
                    disabled={editingUom?.isBaseUom}
                    data-testid="input-uom-name"
                  />
                )}
              />
              {errors.uomName && <Text type="danger" style={{ fontSize: 12 }}>{errors.uomName.message}</Text>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Faktor Konversi (1 [Satuan Baru] = ? {baseUom}) <Text type="danger">*</Text>
              </label>
              <Controller
                name="conversionFactor"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    style={{ width: '100%' }}
                    min={0.0001}
                    step={1}
                    data-testid="input-uom-factor"
                  />
                )}
              />
              {errors.conversionFactor && (
                <Text type="danger" style={{ fontSize: 12 }}>{errors.conversionFactor.message}</Text>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Barcode Khusus Satuan (Opsional)
              </label>
              <Controller
                name="barcode"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    value={field.value || ''}
                    placeholder="Contoh: 8991234567890"
                    prefix={<BarcodeOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                    data-testid="input-uom-barcode"
                  />
                )}
              />
              {errors.barcode && <Text type="danger" style={{ fontSize: 12 }}>{errors.barcode.message}</Text>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setModalOpen(false)}>Batal</Button>
                <Button type="primary" htmlType="submit" data-testid="btn-submit-uom">
                  {editingUom ? 'Simpan Perubahan' : 'Tambah Satuan'}
                </Button>
              </Space>
            </div>
          </Space>
        </form>
      </Modal>
    </div>
  );
};
