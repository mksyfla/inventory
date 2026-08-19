import {
  ItemDTO,
  ItemUoMDTO,
  LocationDTO,
  PartnerDTO,
  ReceiptDocumentDTO,
  StockBalanceDTO,
  BatchTraceDTO,
  StockMovementDTO,
  WarehouseDTO,
  UserSummaryDTO,
  RoleSummaryDTO,
  AuditLogDTO,
  FsnReportDTO,
  ValuationReportDTO,
  SpaceUtilizationDTO,
  DocumentSummaryDTO,
  DocumentDetailDTO,
  DocumentLineDTO,
  CountLineDetailDTO,
  CountDocumentDetailDTO,
} from './dto';
import { Item } from '../types/item';
import { ItemUom } from '../types/uom';
import { Partner } from '../types/partner';
import { LocationNode, LocationType, Warehouse } from '../types/location';
import { GoodsReceiptNote, ReceiptItemLine } from '../types/inbound';
import {
  AuditLog,
  AuditAction,
  StockBalance,
  StockStatus,
  BatchTrace,
  StockMovement,
  MovementType,
} from '../types/stock';
import { UserAccount, RoleItem } from '../types/admin';
import {
  FsnItem,
  InventoryValuationItem,
  WarehouseSpaceReport,
  ZoneSpaceUtilization,
} from '../types/report';
import {
  ItemRequest,
  ItemRequestLine,
  DeliveryOrder,
  DeliveryItemLine,
  RequestStatus,
  DeliveryStatus,
} from '../types/outbound';
import {
  CountSession,
  CountSessionLine,
  CountScope,
  CountSessionStatus,
  AdjustmentReasonCode,
} from '../types/counting';
import { StockTransfer, StockTransferLine, TransferStatus } from '../types/transfer';

// ── Item ───────────────────────────────────────────────────────────────

export function mapItemDTO(dto: ItemDTO): Item {
  return {
    id: dto.id,
    publicId: dto.public_id,
    sku: dto.sku,
    name: dto.name,
    categoryId: dto.category_id ?? 0,
    baseUom: dto.base_uom,
    minQty: dto.min_qty,
    maxQty: dto.max_qty ?? undefined,
    safetyStock: dto.safety_stock,
    leadTimeDays: dto.lead_time_days,
    abcClass: dto.abc_class ?? undefined,
    isBatch: dto.is_batch,
    isExpiry: dto.is_expiry,
    isSerial: dto.is_serial,
    isActive: dto.is_active,
    createdAt: '',
  };
}

export function mapItemUoMDTO(dto: ItemUoMDTO): ItemUom {
  return {
    id: dto.id,
    itemId: dto.item_id,
    uomName: dto.uom,
    conversionFactor: dto.conv_factor,
    barcode: dto.barcode ?? undefined,
    isBaseUom: dto.conv_factor === 1,
  };
}

// ── Location ───────────────────────────────────────────────────────────

const LOC_TYPE_MAP: Record<string, LocationType> = {
  staging: 'staging_inbound',
  pick: 'bin',
  bulk: 'bin',
  quarantine: 'quarantine',
  damaged: 'damaged',
  transit: 'staging_outbound',
};

export function mapLocationDTO(dto: LocationDTO): LocationNode {
  return {
    id: dto.id,
    warehouseId: dto.warehouse_id,
    code: dto.code,
    name: dto.code,
    type: LOC_TYPE_MAP[dto.loc_type] || 'bin',
    isActive: dto.is_active,
    isLocked: false,
  };
}

// ── Partner ────────────────────────────────────────────────────────────

export function mapPartnerDTO(dto: PartnerDTO): Partner {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    type: dto.partner_type,
    address: dto.address ?? undefined,
    contactPerson: dto.contact_name ?? undefined,
    phone: dto.contact_phone ?? undefined,
    isActive: dto.is_active,
  };
}

// ── Receipt / GRN ──────────────────────────────────────────────────────

export function mapReceiptDocumentDTO(dto: ReceiptDocumentDTO): GoodsReceiptNote {
  return {
    id: dto.id,
    documentNo: dto.doc_no,
    poReference: dto.notes || '',
    supplierId: dto.partner_id ?? 0,
    supplierName: dto.partner_id ? `Partner #${dto.partner_id}` : '-',
    warehouseId: dto.warehouse_id,
    warehouseName: `Warehouse #${dto.warehouse_id}`,
    receiptDate: dto.doc_date,
    status: dto.status,
    notes: dto.notes ?? undefined,
    createdByName: `User #${dto.created_by}`,
    createdAt: dto.doc_date,
    items: dto.lines.map((line): ReceiptItemLine => ({
      id: line.id,
      itemId: line.item_id,
      sku: `#${line.item_id}`,
      itemName: `Item #${line.item_id}`,
      uom: line.uom,
      qtyExpected: line.qty_request,
      qtyReceived: line.qty_processed,
      qtyRejected: 0,
    })),
  };
}

/**
 * Maps a generic document row (GET /documents, doc_type=GRN) to a
 * GoodsReceiptNote. Richer than mapReceiptDocumentDTO because the document
 * endpoint joins supplier/warehouse names and line SKUs.
 */
export function mapDocumentToGoodsReceiptNote(
  dto: DocumentSummaryDTO | DocumentDetailDTO,
  lines: DocumentLineDTO[] = []
): GoodsReceiptNote {
  return {
    id: dto.id,
    documentNo: dto.doc_no,
    poReference: dto.ref_doc_no || dto.notes || '',
    supplierId: dto.partner_id ?? 0,
    supplierName: docPartnerName(dto),
    warehouseId: dto.warehouse_id,
    warehouseName: docWarehouseName(dto),
    receiptDate: dto.doc_date,
    status: dto.status as GoodsReceiptNote['status'],
    notes: dto.notes ?? undefined,
    createdByName: String(dto.created_by),
    createdAt: dto.created_at,
    lineCount: dto.line_count,
    items: lines.map(mapGRNLine),
  };
}

function mapGRNLine(line: DocumentLineDTO): ReceiptItemLine {
  return {
    id: line.id,
    itemId: line.item_id,
    sku: line.sku,
    itemName: line.item_name,
    uom: line.uom,
    qtyExpected: line.qty_request,
    qtyReceived: line.qty_processed,
    qtyRejected: 0,
  };
}

// ── Stock balances ─────────────────────────────────────────────────────

export function mapStockBalanceDTO(dto: StockBalanceDTO): StockBalance {
  return {
    id: dto.balance_id,
    sku: dto.sku,
    itemName: dto.item_name,
    categoryName: dto.category_name,
    warehouseId: dto.warehouse_id,
    warehouseName: dto.warehouse_name,
    locationCode: dto.location_code,
    batchNo: dto.batch_no,
    expiryDate: dto.expiry_date ?? undefined,
    status: dto.status as StockStatus,
    qtyOnHand: dto.qty_onhand,
    qtyReserved: dto.qty_reserved,
    qtyAvailable: dto.qty_onhand - dto.qty_reserved,
    uom: dto.base_uom,
  };
}

// ── Batch trace ────────────────────────────────────────────────────────

export function mapBatchTraceDTO(dto: BatchTraceDTO): BatchTrace {
  return {
    batchNo: dto.batch_no,
    sku: dto.sku,
    itemName: dto.item_name,
    supplierName: dto.supplier_name || '-',
    grnNo: dto.grn_no || '-',
    receiptDate: dto.grn_date ? dto.grn_date.slice(0, 10) : '-',
    totalQtyReceived: dto.qty_onhand + dto.qty_reserved,
    uom: dto.base_uom,
    deliveries: [],
  };
}

// ── Stock ledger ───────────────────────────────────────────────────────

export function mapStockMovementDTO(dto: StockMovementDTO): StockMovement {
  const movementType = ((raw: string): MovementType => {
    switch (raw) {
      case 'receipt':
      case 'issue':
      case 'transfer_out':
      case 'transfer_in':
      case 'putaway':
      case 'internal_move':
      case 'return_in':
      case 'return_out':
      case 'opening':
        return raw as MovementType;
      default:
        // 'adjustment' (and any future type) resolves by qty sign.
        return dto.qty >= 0 ? 'adjustment_plus' : 'adjustment_minus';
    }
  })(dto.movement_type);

  const qty = dto.qty || 0;
  return {
    id: dto.id,
    movedAt: dto.moved_at,
    itemId: dto.item_id,
    sku: dto.sku,
    itemName: dto.item_name,
    movementType,
    docNo: dto.doc_no || '',
    locationCode: dto.location_code || '',
    batchNo: dto.batch_no || '',
    qtyIn: qty > 0 ? qty : 0,
    qtyOut: qty < 0 ? -qty : 0,
    qtyAfter: dto.qty_after,
    uom: dto.base_uom,
    operatorName: dto.operator_name || '—',
  };
}

// ── Warehouse ──────────────────────────────────────────────────────────

export function mapWarehouseDTO(dto: WarehouseDTO): Warehouse {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    address: dto.address ?? undefined,
    isActive: dto.is_active,
  };
}

// ── Admin (users / roles / audit) ──────────────────────────────────────

export function mapUserSummaryDTO(dto: UserSummaryDTO): UserAccount {
  return {
    id: dto.id,
    username: dto.username,
    fullName: dto.full_name,
    email: dto.email,
    phone: dto.phone ?? undefined,
    roles: dto.roles,
    assignedWarehouseIds: dto.warehouse_ids ?? [],
    assignedWarehouseNames: dto.warehouses,
    isActive: dto.is_active,
    lastLoginAt: dto.last_login_at ?? undefined,
  };
}

export function mapRoleSummaryDTO(dto: RoleSummaryDTO): RoleItem {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    description: dto.description ?? undefined,
    permissions: dto.permissions,
    isSystem: dto.code === 'sysadmin',
  };
}

export function mapAuditLogDTO(dto: AuditLogDTO): AuditLog {
  const asRecord = (v: unknown): Record<string, unknown> | undefined =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
  return {
    id: dto.id,
    timestamp: dto.occurred_at,
    userName: dto.actor_username,
    action: dto.action.toUpperCase() as AuditAction,
    entityName: dto.entity,
    entityId: dto.entity_id != null ? String(dto.entity_id) : '',
    ipAddress: dto.ip_address,
    requestId: dto.request_id,
    oldValue: asRecord(dto.old_value),
    newValue: asRecord(dto.new_value),
  };
}

// ── Reports ────────────────────────────────────────────────────────────

export function mapFsnReportDTO(dto: FsnReportDTO): FsnItem {
  const turnoverRatio = dto.turnover_ratio || 0;
  return {
    id: dto.id,
    sku: dto.sku,
    itemName: dto.item_name,
    categoryName: dto.category_name,
    fsnCategory: dto.fsn_category,
    turnoverRatio,
    daysOfInventory: turnoverRatio > 0 ? Math.round(365 / turnoverRatio) : 365,
    lastMovementDate: dto.last_movement_date.slice(0, 10),
    currentQty: dto.current_qty,
    uom: dto.base_uom,
    totalValuation: dto.total_valuation,
  };
}

export function mapValuationReportDTO(dto: ValuationReportDTO): InventoryValuationItem {
  return {
    id: dto.id,
    sku: dto.sku,
    itemName: dto.item_name,
    categoryName: dto.category_name,
    uom: dto.uom,
    unitPrice: dto.unit_price,
    beginningQty: dto.ending_qty - dto.inbound_qty + dto.outbound_qty,
    beginningValue: dto.ending_value - dto.inbound_value + dto.outbound_value,
    inboundQty: dto.inbound_qty,
    inboundValue: dto.inbound_value,
    outboundQty: dto.outbound_qty,
    outboundValue: dto.outbound_value,
    endingQty: dto.ending_qty,
    endingValue: dto.ending_value,
  };
}

export function mapSpaceUtilizationDTO(dtos: SpaceUtilizationDTO[]): WarehouseSpaceReport[] {
  const byWarehouse = new Map<number, SpaceUtilizationDTO[]>();
  for (const dto of dtos) {
    const list = byWarehouse.get(dto.warehouse_id) ?? [];
    list.push(dto);
    byWarehouse.set(dto.warehouse_id, list);
  }
  const reports: WarehouseSpaceReport[] = [];
  for (const [warehouseId, locations] of byWarehouse) {
    const first = locations[0];
    const zones = new Map<string, ZoneSpaceUtilization>();
    for (const loc of locations) {
      const current = zones.get(loc.zone_name) ?? {
        zoneName: loc.zone_name,
        capacityVolumeM3: 0,
        usedVolumeM3: 0,
        occupancyPct: 0,
      };
      current.capacityVolumeM3 += loc.capacity_volume_m3;
      current.usedVolumeM3 += loc.used_volume_m3;
      zones.set(loc.zone_name, current);
    }
    const zoneList = Array.from(zones.values()).map((z) => ({
      ...z,
      occupancyPct: z.capacityVolumeM3 > 0 ? Math.round((z.usedVolumeM3 / z.capacityVolumeM3) * 1000) / 10 : 0,
    }));
    const totalVolume = zoneList.reduce((acc, z) => acc + z.capacityVolumeM3, 0);
    const usedVolume = zoneList.reduce((acc, z) => acc + z.usedVolumeM3, 0);
    reports.push({
      warehouseId,
      warehouseName: first.warehouse_name,
      totalVolumeM3: totalVolume,
      usedVolumeM3: usedVolume,
      volumeOccupancyPct: totalVolume > 0 ? Math.round((usedVolume / totalVolume) * 1000) / 10 : 0,
      totalWeightKg: 0,
      usedWeightKg: 0,
      weightOccupancyPct: 0,
      zones: zoneList,
    });
  }
  return reports;
}

// ── Documents → outbound (requests / deliveries) ───────────────────────────

// Backend DocumentStatus (draft/submitted/approved/in_progress/completed/
// cancelled) is wider than the UI RequestStatus union, so we normalize.
export function normalizeRequestStatus(status: string): RequestStatus {
  switch (status) {
    case 'draft':
    case 'submitted':
    case 'approved':
    case 'rejected':
    case 'cancelled':
      return status;
    case 'in_progress':
      return 'approved';
    case 'completed':
    case 'fulfilled':
      return 'fulfilled';
    default:
      return 'draft';
  }
}

export function normalizeDeliveryStatus(status: string): DeliveryStatus {
  switch (status) {
    case 'draft':
    case 'allocated':
    case 'picking_in_progress':
    case 'picked':
    case 'packed':
    case 'shipped':
    case 'partially_delivered':
    case 'delivered':
    case 'cancelled':
      return status;
    case 'submitted':
    case 'approved':
      return 'allocated';
    case 'in_progress':
      return 'shipped';
    case 'completed':
      return 'delivered';
    default:
      return 'draft';
  }
}

function mapRequestLine(line: DocumentLineDTO): ItemRequestLine {
  return {
    id: line.id,
    itemId: line.item_id,
    sku: line.sku,
    itemName: line.item_name,
    uom: line.uom,
    qtyRequested: line.qty_request,
    qtyApproved: line.qty_processed,
    notes: line.notes || undefined,
  };
}

function mapDeliveryLine(line: DocumentLineDTO): DeliveryItemLine {
  const ordered = line.qty_request;
  const processed = line.qty_processed;
  return {
    id: line.id,
    itemId: line.item_id,
    sku: line.sku,
    itemName: line.item_name,
    uom: line.uom,
    qtyOrdered: ordered,
    qtyAllocated: processed,
    qtyPicked: processed,
    qtyPacked: 0,
    qtyDelivered: 0,
    qtyOutstanding: Math.max(0, ordered - processed),
    allocations: [],
  };
}

function docPartnerName(dto: DocumentSummaryDTO | DocumentDetailDTO): string {
  const ref = 'partner' in dto ? dto.partner : undefined;
  return dto.partner_name || ref?.name || (dto.partner_id ? `Partner #${dto.partner_id}` : '-');
}

function docWarehouseName(dto: DocumentSummaryDTO | DocumentDetailDTO): string {
  const ref = 'source_warehouse' in dto ? dto.source_warehouse : undefined;
  return dto.warehouse_name || ref?.name || (dto.warehouse_id ? `Gudang #${dto.warehouse_id}` : '-');
}

export function mapDocumentToItemRequest(
  dto: DocumentSummaryDTO | DocumentDetailDTO,
  lines: DocumentLineDTO[] = []
): ItemRequest {
  return {
    id: dto.id,
    requestNo: dto.doc_no,
    requestingUnit: docPartnerName(dto),
    warehouseId: dto.warehouse_id,
    warehouseName: docWarehouseName(dto),
    requiredDate: dto.doc_date,
    // Priority is not persisted in the generic document model; reason_code
    // carries override/urgency codes when present.
    priority: dto.reason_code === 'urgent' ? 'urgent' : 'normal',
    status: normalizeRequestStatus(dto.status),
    notes: dto.notes || undefined,
    createdByName: String(dto.created_by),
    createdAt: dto.created_at,
    lineCount: dto.line_count,
    items: lines.map(mapRequestLine),
  };
}

export function mapDocumentToDeliveryOrder(
  dto: DocumentSummaryDTO | DocumentDetailDTO,
  lines: DocumentLineDTO[] = []
): DeliveryOrder {
  return {
    id: dto.id,
    doNo: dto.doc_no,
    requestNo: dto.ref_doc_no || undefined,
    customerName: docPartnerName(dto),
    destinationAddress: '',
    warehouseId: dto.warehouse_id,
    warehouseName: docWarehouseName(dto),
    status: normalizeDeliveryStatus(dto.status),
    deliveryDate: dto.doc_date,
    createdByName: String(dto.created_by),
    createdAt: dto.created_at,
    items: lines.map(mapDeliveryLine),
  };
}

// ── Documents → counting (stock opname) ────────────────────────────────

// Backend count status flow (draft → submitted → approved → in_progress →
// completed) is mapped onto the wider UI CountSessionStatus union.
export function normalizeCountStatus(status: string): CountSessionStatus {
  switch (status) {
    case 'draft':
      return 'open';
    case 'submitted':
    case 'approved':
      return 'review';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'posted';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'open';
  }
}

function countScope(): { scope: CountScope; detail?: string } {
  // The generic document model does not persist the scope enum; the list and
  // detail views default to a full-warehouse label and surface doc.notes as
  // the scope detail.
  return { scope: 'full', detail: 'Seluruh Gudang & Bin' };
}

export function mapCountLineDetailDTO(dto: CountLineDetailDTO, countId: number): CountSessionLine {
  const qtyCounted = dto.qty_counted ?? undefined;
  const qtySystem = dto.qty_system ?? 0;
  return {
    id: dto.id,
    countId,
    itemId: dto.item_id,
    sku: dto.sku,
    itemName: dto.item_name,
    uom: dto.uom,
    binCode: dto.location_code || '-',
    batchNo: dto.batch_no || '-',
    qtySystem,
    qtyCounted,
    qtyVariance: dto.variance ?? (qtyCounted !== undefined ? qtyCounted - qtySystem : undefined),
    reasonCode: dto.reason_code ? (dto.reason_code as AdjustmentReasonCode) : undefined,
  };
}

export function mapCountDetailToSession(dto: CountDocumentDetailDTO): CountSession {
  const { scope, detail } = countScope();
  return {
    id: dto.id,
    countNo: dto.doc_no,
    title: dto.notes || dto.doc_no,
    warehouseId: dto.warehouse_id,
    warehouseName: dto.warehouse_name || `Gudang #${dto.warehouse_id}`,
    scope,
    targetScopeDetail: dto.notes || detail,
    status: normalizeCountStatus(dto.status),
    iraScore: 100,
    items: dto.lines.map((l) => mapCountLineDetailDTO(l, dto.id)),
    createdBy: String(dto.created_by),
    createdAt: dto.created_at,
  };
}

export function mapCountSummaryToSession(dto: DocumentSummaryDTO): CountSession {
  const { scope, detail } = countScope();
  return {
    id: dto.id,
    countNo: dto.doc_no,
    title: dto.notes || dto.doc_no,
    warehouseId: dto.warehouse_id,
    warehouseName: dto.warehouse_name || `Gudang #${dto.warehouse_id}`,
    scope,
    targetScopeDetail: dto.notes || detail,
    status: normalizeCountStatus(dto.status),
    createdBy: String(dto.created_by),
    createdAt: dto.created_at,
    items: [],
  };
}

// ── Documents → transfers (mutasi antar gudang) ────────────────────────

// Backend TRF status flow (draft → submitted → approved → in_progress →
// completed) maps onto the UI TransferStatus union. completed maps to
// received; a partial receipt is derived from per-line variance in detail.
export function normalizeTransferStatus(status: string): TransferStatus {
  switch (status) {
    case 'draft':
    case 'submitted':
    case 'approved':
      return 'draft';
    case 'in_progress':
      return 'in_transit';
    case 'completed':
      return 'received';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

function mapTransferLine(line: DocumentLineDTO, transferId: number): StockTransferLine {
  const received = line.qty_processed;
  const hasReceived = received > 0;
  return {
    id: line.id,
    transferId,
    itemId: line.item_id,
    sku: line.sku,
    itemName: line.item_name,
    uom: line.uom,
    // Document lines do not carry batch_no (only batch_id); the TRF line model
    // keeps a display placeholder until batch metadata is surfaced.
    batchNo: '-',
    qtySent: line.qty_request,
    qtyReceived: hasReceived ? received : undefined,
    qtyVariance: hasReceived ? Math.max(0, line.qty_request - received) : undefined,
  };
}

export function mapDocumentToTransfer(
  dto: DocumentSummaryDTO | DocumentDetailDTO,
  lines: DocumentLineDTO[] = []
): StockTransfer {
  const destId = dto.dest_warehouse_id ?? 0;
  return {
    id: dto.id,
    transferNo: dto.doc_no,
    transferDate: dto.doc_date,
    originWarehouseId: dto.warehouse_id,
    originWarehouseName: docWarehouseName(dto),
    destinationWarehouseId: destId,
    destinationWarehouseName:
      dto.dest_warehouse_name || (destId ? `Gudang #${destId}` : '-'),
    status: normalizeTransferStatus(dto.status),
    notes: dto.notes || undefined,
    createdBy: String(dto.created_by),
    createdAt: dto.created_at,
    items: lines.map((l) => mapTransferLine(l, dto.id)),
  };
}
