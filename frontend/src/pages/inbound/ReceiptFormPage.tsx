import React, { useEffect } from "react";
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
} from "antd";
import {
    ArrowLeftOutlined,
    SaveOutlined,
    SendOutlined,
    PlusOutlined,
    DeleteOutlined,
    AlertOutlined,
} from "@ant-design/icons";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { receiptFormSchema, ReceiptFormValues } from "../../types/inbound";
import { useMutationWithToast } from "../../hooks/useMutationWithToast";
import { itemService } from "../../api/services/items";
import { warehouseService } from "../../api/services/warehouses";
import { partnerService } from "../../api/services/partners";
import { receiptService } from "../../api/services/receipts";
import { mapItemDTO, mapWarehouseDTO } from "../../api/mappers";

const { Title, Paragraph, Text } = Typography;

export const ReceiptFormPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditMode = Boolean(id && id !== "new");

    const { data: warehouses = [] } = useQuery({
        queryKey: ["warehouses"],
        queryFn: async () => {
            const dtos = await warehouseService.list();
            return dtos.map(mapWarehouseDTO);
        },
    });

    const { data: items = [] } = useQuery({
        queryKey: ["items"],
        queryFn: async () => {
            const dtos = await itemService.listItems();
            return dtos.map(mapItemDTO);
        },
    });

    const { data: partners = [] } = useQuery({
        queryKey: ["partners"],
        queryFn: async () => {
            const dtos = await partnerService.listPartners();
            return dtos.filter((d) => d.partner_type === "supplier");
        },
    });

    const {
        control,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ReceiptFormValues>({
        resolver: zodResolver(receiptFormSchema),
        defaultValues: {
            poReference: "",
            supplierId: undefined,
            warehouseId: undefined as unknown as number,
            receiptDate: dayjs().format("YYYY-MM-DD"),
            notes: "",
            items: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "items",
    });

    // Watch items for field array changes
    const watchItems = watch("items");

    // Auto-select first supplier once partners load
    useEffect(() => {
        if (partners.length > 0 && !watch("supplierId")) {
            setValue("supplierId", partners[0].id);
        }
    }, [partners]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-select the first real warehouse (real DB id from GET /warehouses)
    // once they load, so POST /receipts never sends a fabricated warehouse id.
    useEffect(() => {
        if (warehouses.length > 0 && !watch("warehouseId")) {
            setValue("warehouseId", warehouses[0].id);
        }
    }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (items.length > 0 && fields.length === 0) {
            append({
                itemId: items[0].id,
                sku: items[0].sku,
                itemName: items[0].name,
                uom: items[0].baseUom,
                qtyExpected: 1,
                qtyReceived: 1,
                qtyRejected: 0,
                isExpiry: items[0].isExpiry,
                batchNo: items[0].isExpiry ? "LOT-NEW-01" : "",
                expiryDate: items[0].isExpiry ? dayjs().add(1, "year").format("YYYY-MM-DD") : "",
                targetLocationCode: "",
            });
        }
    }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleItemSelect = (index: number, selectedItemId: number) => {
        const foundItem = items.find((i) => i.id === selectedItemId);
        if (foundItem) {
            setValue(`items.${index}.itemId`, foundItem.id);
            setValue(`items.${index}.sku`, foundItem.sku);
            setValue(`items.${index}.itemName`, foundItem.name);
            setValue(`items.${index}.uom`, foundItem.baseUom);
            setValue(`items.${index}.isExpiry`, foundItem.isExpiry);
            if (foundItem.isExpiry) {
                setValue(
                    `items.${index}.batchNo`,
                    `LOT-${foundItem.sku.split("-")[1] || "NEW"}-01`,
                );
                setValue(`items.${index}.expiryDate`, dayjs().add(1, "year").format("YYYY-MM-DD"));
            }
        }
    };

    const handleAddRow = () => {
        if (items.length === 0) return;
        const first = items[0];
        append({
            itemId: first.id,
            sku: first.sku,
            itemName: first.name,
            uom: first.baseUom,
            qtyExpected: 1,
            qtyReceived: 1,
            qtyRejected: 0,
            isExpiry: first.isExpiry,
            batchNo: first.isExpiry ? "LOT-NEW-01" : "",
            expiryDate: first.isExpiry ? dayjs().add(1, "year").format("YYYY-MM-DD") : "",
            targetLocationCode: "",
        });
    };

    const createMutation = useMutationWithToast({
        mutationFn: async (values: ReceiptFormValues) => {
            const receipt = await receiptService.createReceipt({
                warehouse_id: values.warehouseId,
                partner_id: values.supplierId || null,
                notes: values.poReference
                    ? `PO Ref: ${values.poReference}${values.notes ? ` | ${values.notes}` : ""}`
                    : values.notes || undefined,
                lines: values.items.map((line) => ({
                    item_id: line.itemId,
                    qty: line.qtyReceived || line.qtyExpected,
                    uom: line.uom || undefined,
                    batch_no: line.batchNo || undefined,
                    expiry_date: line.expiryDate || null,
                    status: line.qtyRejected > 0 ? "damaged" : "available",
                    notes: undefined,
                })),
            });
            return receipt;
        },
        successTitle: "Draft GRN Berhasil Disimpan",
        successMessage: "Dokumen penerimaan telah dibuat di backend.",
        invalidateKeys: [["receipts"]],
    });

    const submitMutation = useMutationWithToast({
        mutationFn: async (values: ReceiptFormValues) => {
            const receipt = await receiptService.createReceipt({
                warehouse_id: values.warehouseId,
                partner_id: values.supplierId || null,
                notes: values.poReference
                    ? `PO Ref: ${values.poReference}${values.notes ? ` | ${values.notes}` : ""}`
                    : values.notes || undefined,
                lines: values.items.map((line) => ({
                    item_id: line.itemId,
                    qty: line.qtyReceived || line.qtyExpected,
                    uom: line.uom || undefined,
                    batch_no: line.batchNo || undefined,
                    expiry_date: line.expiryDate || null,
                    status: line.qtyRejected > 0 ? "damaged" : "available",
                    notes: undefined,
                })),
            });
            await receiptService.submitReceipt(receipt.id);
            return receipt;
        },
        successTitle: "Dokumen GRN Berhasil Diajukan",
        successMessage: "Dokumen penerimaan telah dibuat dan diajukan untuk persetujuan.",
        invalidateKeys: [["receipts"]],
    });

    const onSubmit = (values: ReceiptFormValues, submitStatus: "draft" | "submitted") => {
        const mut = submitStatus === "submitted" ? submitMutation : createMutation;
        mut.mutate(values, {
            onSuccess: (receipt) => navigate(`/inbound/receipts/${receipt.id}`),
        });
    };

    const tableColumns = [
        {
            title: "Pilih SKU / Barang",
            key: "sku",
            width: 220,
            render: (_: any, __: any, index: number) => (
                <div>
                    <Controller
                        name={`items.${index}.itemId`}
                        control={control}
                        render={({ field }) => (
                            <Select
                                {...field}
                                style={{ width: "100%" }}
                                options={items.map((item) => ({
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
            title: "Satuan",
            key: "uom",
            width: 80,
            render: (_: any, __: any, index: number) => (
                <Text strong style={{ color: "#0052cc" }}>
                    {watchItems?.[index]?.uom || "PCS"}
                </Text>
            ),
        },
        {
            title: "Qty PO (Expected)",
            key: "qtyExpected",
            width: 120,
            render: (_: any, __: any, index: number) => (
                <Controller
                    name={`items.${index}.qtyExpected`}
                    control={control}
                    render={({ field }) => (
                        <InputNumber
                            {...field}
                            min={1}
                            style={{ width: "100%" }}
                            data-testid={`input-qty-expected-${index}`}
                        />
                    )}
                />
            ),
        },
        {
            title: "Qty Fisik Diterima",
            key: "qtyReceived",
            width: 120,
            render: (_: any, __: any, index: number) => (
                <Controller
                    name={`items.${index}.qtyReceived`}
                    control={control}
                    render={({ field }) => (
                        <InputNumber
                            {...field}
                            min={0}
                            style={{ width: "100%" }}
                            data-testid={`input-qty-received-${index}`}
                        />
                    )}
                />
            ),
        },
        {
            title: "Qty QC Reject",
            key: "qtyRejected",
            width: 120,
            render: (_: any, __: any, index: number) => (
                <Controller
                    name={`items.${index}.qtyRejected`}
                    control={control}
                    render={({ field }) => (
                        <InputNumber
                            {...field}
                            min={0}
                            style={{ width: "100%" }}
                            data-testid={`input-qty-rejected-${index}`}
                        />
                    )}
                />
            ),
        },
        {
            title: "No. Batch / Lot",
            key: "batchNo",
            width: 150,
            render: (_: any, __: any, index: number) => (
                <div>
                    <Controller
                        name={`items.${index}.batchNo`}
                        control={control}
                        render={({ field }) => (
                            <Input
                                {...field}
                                value={field.value || ""}
                                placeholder={
                                    watchItems?.[index]?.isExpiry ? "Wajib Batch" : "Opsional Batch"
                                }
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
            title: "Tgl Kedaluwarsa",
            key: "expiryDate",
            width: 150,
            render: (_: any, __: any, index: number) => (
                <div>
                    <Controller
                        name={`items.${index}.expiryDate`}
                        control={control}
                        render={({ field }) => (
                            <DatePicker
                                value={field.value ? dayjs(field.value) : null}
                                onChange={(date) =>
                                    field.onChange(date ? date.format("YYYY-MM-DD") : "")
                                }
                                style={{ width: "100%" }}
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
            title: "Target Storage Bin",
            key: "targetLocationCode",
            width: 150,
            render: (_: any, __: any, index: number) => (
                <Controller
                    name={`items.${index}.targetLocationCode`}
                    control={control}
                    render={({ field }) => (
                        <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Contoh: JKT01-STG-IN"
                            data-testid={`input-target-bin-${index}`}
                        />
                    )}
                />
            ),
        },
        {
            title: "Aksi",
            key: "action",
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
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <Row justify="space-between" align="middle">
                    <Col>
                        <Space align="center">
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate("/inbound/receipts")}
                            />
                            <div>
                                <Title level={3} style={{ margin: 0 }}>
                                    {isEditMode
                                        ? `Edit Draft Dokumen GRN: #${id}`
                                        : "Buat Dokumen Penerimaan (GRN) Baru"}
                                </Title>
                                <Paragraph type="secondary" style={{ margin: 0 }}>
                                    Input data fisik penerimaan dari Pemasok, nomor batch, tanggal
                                    kedaluwarsa, dan inspeksi QC.
                                </Paragraph>
                            </div>
                        </Space>
                    </Col>
                </Row>

                <form
                    onSubmit={handleSubmit((values) => onSubmit(values, "draft"))}
                    data-testid="form-receipt"
                >
                    <Card variant="borderless" title="1. Informasi Dokumen Inbound Header">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <label
                                    style={{ display: "block", marginBottom: 6, fontWeight: 500 }}
                                >
                                    Referensi No. PO <Text type="danger">*</Text>
                                </label>
                                <Controller
                                    name="poReference"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            {...field}
                                            placeholder="Contoh: PO-2026-0199"
                                            status={errors.poReference ? "error" : ""}
                                            data-testid="input-po-reference"
                                        />
                                    )}
                                />
                                {errors.poReference && (
                                    <Text type="danger" style={{ fontSize: 12 }}>
                                        {errors.poReference.message}
                                    </Text>
                                )}
                            </Col>

                            <Col xs={24} md={8}>
                                <label
                                    style={{ display: "block", marginBottom: 6, fontWeight: 500 }}
                                >
                                    Pemasok (Supplier) <Text type="danger">*</Text>
                                </label>
                                <Controller
                                    name="supplierId"
                                    control={control}
                                    render={({ field }) => (
                                        <Select
                                            {...field}
                                            style={{ width: "100%" }}
                                            options={partners.map((s) => ({
                                                value: s.id,
                                                label: s.name,
                                            }))}
                                            placeholder="Pilih Pemasok"
                                            data-testid="select-supplier"
                                        />
                                    )}
                                />
                                {errors.supplierId && (
                                    <Text type="danger" style={{ fontSize: 12 }}>
                                        {errors.supplierId.message}
                                    </Text>
                                )}
                            </Col>

                            <Col xs={24} md={8}>
                                <label
                                    style={{ display: "block", marginBottom: 6, fontWeight: 500 }}
                                >
                                    Gudang Tujuan Penerimaan <Text type="danger">*</Text>
                                </label>
                                <Controller
                                    name="warehouseId"
                                    control={control}
                                    render={({ field }) => (
                                        <Select
                                            {...field}
                                            style={{ width: "100%" }}
                                            options={warehouses.map((w) => ({
                                                value: w.id,
                                                label: `${w.code} - ${w.name}`,
                                            }))}
                                            placeholder="Pilih Gudang Tujuan"
                                            data-testid="select-warehouse"
                                        />
                                    )}
                                />
                            </Col>

                            <Col xs={24} md={8}>
                                <label
                                    style={{ display: "block", marginBottom: 6, fontWeight: 500 }}
                                >
                                    Tanggal Penerimaan Fisik <Text type="danger">*</Text>
                                </label>
                                <Controller
                                    name="receiptDate"
                                    control={control}
                                    render={({ field }) => (
                                        <DatePicker
                                            value={field.value ? dayjs(field.value) : null}
                                            onChange={(date) =>
                                                field.onChange(
                                                    date ? date.format("YYYY-MM-DD") : "",
                                                )
                                            }
                                            style={{ width: "100%" }}
                                            data-testid="datepicker-receipt-date"
                                        />
                                    )}
                                />
                            </Col>

                            <Col xs={24} md={16}>
                                <label
                                    style={{ display: "block", marginBottom: 6, fontWeight: 500 }}
                                >
                                    Catatan Tambahan Penerimaan
                                </label>
                                <Controller
                                    name="notes"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            {...field}
                                            value={field.value || ""}
                                            placeholder="Catatan kondisi segel truk/kontainer"
                                            data-testid="input-notes"
                                        />
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
                                <AlertOutlined /> Pastikan nomor lot/batch dan tanggal expiry telah
                                diverifikasi sebelum mengajukan dokumen.
                            </Text>
                        </Col>
                        <Col>
                            <Space>
                                <Button onClick={() => navigate("/inbound/receipts")}>Batal</Button>

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
                                    onClick={handleSubmit((values) =>
                                        onSubmit(values, "submitted"),
                                    )}
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
