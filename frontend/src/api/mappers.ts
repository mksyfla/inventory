import { ItemDTO, ItemUoMDTO, LocationDTO, PartnerDTO, ReceiptDocumentDTO } from './dto';
import { Item } from '../types/item';
import { ItemUom } from '../types/uom';
import { Partner } from '../types/partner';
import { LocationNode, LocationType } from '../types/location';
import { GoodsReceiptNote, ReceiptItemLine } from '../types/inbound';

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
