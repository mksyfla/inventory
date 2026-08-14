// DTO types mirroring backend/api/openapi.yaml schemas (snake_case JSON).

export interface TokenPairDTO {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

export interface RegisterResponseDTO {
  id: number;
  username: string;
  full_name: string;
}

// ── Items ─────────────────────────────────────────────────────────────

export interface ItemDTO {
  id: number;
  public_id: string;
  sku: string;
  name: string;
  category_id: number | null;
  base_uom: string;
  is_batch: boolean;
  is_expiry: boolean;
  is_serial: boolean;
  min_qty: number;
  max_qty: number | null;
  safety_stock: number;
  lead_time_days: number;
  abc_class: 'A' | 'B' | 'C' | null;
  is_active: boolean;
}

export interface ItemDetailDTO extends ItemDTO {
  created_at: string;
  created_by: number;
}

export interface ItemUoMDTO {
  id: number;
  item_id: number;
  uom: string;
  conv_factor: number;
  barcode: string | null;
}

export interface ItemUoMInputDTO {
  uom: string;
  conv_factor: number;
  barcode?: string | null;
}

export interface CreateItemRequestDTO {
  sku: string;
  name: string;
  category_id?: number | null;
  base_uom: string;
  is_batch?: boolean;
  is_expiry?: boolean;
  is_serial?: boolean;
  min_qty?: number;
  max_qty?: number | null;
  safety_stock?: number;
  lead_time_days?: number;
  abc_class?: 'A' | 'B' | 'C' | null;
  uoms?: ItemUoMInputDTO[];
}

export interface UpdateItemRequestDTO {
  name: string;
  category_id?: number | null;
  base_uom: string;
  is_batch?: boolean;
  is_expiry?: boolean;
  is_serial?: boolean;
  min_qty?: number;
  max_qty?: number | null;
  safety_stock?: number;
  lead_time_days?: number;
  abc_class?: 'A' | 'B' | 'C' | null;
  is_active?: boolean;
}

export interface ItemDetailResponseDTO {
  item: ItemDetailDTO;
  uoms: ItemUoMDTO[];
}

export interface ImportJobResponseDTO {
  job_id: string;
  status: string;
}

// ── Locations ─────────────────────────────────────────────────────────

export type LocationType =
  | 'staging'
  | 'pick'
  | 'bulk'
  | 'quarantine'
  | 'damaged'
  | 'transit';

export interface LocationDTO {
  id: number;
  warehouse_id: number;
  code: string;
  zone: string | null;
  rack: string | null;
  level: string | null;
  loc_type: LocationType;
  pick_seq: number | null;
  capacity: number | null;
  is_active: boolean;
}

export interface CreateLocationRequestDTO {
  warehouse_id: number;
  code: string;
  zone?: string | null;
  rack?: string | null;
  level?: string | null;
  loc_type: LocationType;
  pick_seq?: number | null;
  capacity?: number | null;
}

// ── Partners ──────────────────────────────────────────────────────────

export type PartnerType = 'supplier' | 'customer' | 'internal_unit';

export interface PartnerDTO {
  id: number;
  code: string;
  partner_type: PartnerType;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_active: boolean;
}

export interface CreatePartnerRequestDTO {
  code: string;
  partner_type: PartnerType;
  name: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
}

// ── Receipts / GRN (Fase 6) ───────────────────────────────────────────

export interface ReceiptLineRequestDTO {
  item_id: number;
  qty: number;
  uom?: string;
  batch_no?: string;
  expiry_date?: string | null;
  status?: 'available' | 'quarantine' | 'damaged';
  notes?: string;
}

export interface CreateReceiptRequestDTO {
  warehouse_id: number;
  partner_id?: number | null;
  idempotency_key?: string;
  notes?: string;
  lines: ReceiptLineRequestDTO[];
}

export interface ReceiptDocumentDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  warehouse_id: number;
  partner_id?: number | null;
  notes?: string | null;
  created_by: number;
  lines: ReceiptLineSummaryDTO[];
}

export interface ReceiptLineSummaryDTO {
  id: number;
  line_no: number;
  item_id: number;
  uom: string;
  qty_request: number;
  qty_processed: number;
  batch_id: number | null;
  location_id: number | null;
  status: string;
}

export interface ReceiptStatusDTO {
  id: number;
  status: string;
}

export interface PutawayScanRequestDTO {
  line_id: number;
  qty: number;
  location_code: string;
}

export interface PutawayRequestDTO {
  lines: PutawayScanRequestDTO[];
}

export interface PutawaySuggestionDTO {
  line_id: number;
  item_id: number;
  qty_remaining: number;
  locations: SuggestedLocationDTO[];
}

export interface SuggestedLocationDTO {
  location_id: number;
  code: string;
  zone: string;
  rack: string;
  level: string;
  loc_type: string;
  free_qty: number;
}

// ── Stock ─────────────────────────────────────────────────────────────

export interface StockMovementDTO {
  id: number;
  moved_at: string;
  item_id: number;
  location_id: number;
  batch_id: number | null;
  status: string;
  movement_type: string;
  qty: number;
  qty_after: number;
  doc_no: string;
}
