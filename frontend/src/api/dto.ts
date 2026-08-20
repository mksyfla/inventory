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

// ── Categories ─────────────────────────────────────────────────────────

export interface CategoryDTO {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
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

/** Body for PATCH /partners/{id} — full-form replace, includes is_active. */
export interface UpdatePartnerRequestDTO {
  code: string;
  partner_type: PartnerType;
  name: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  is_active: boolean;
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

// ── GRN attachments / lampiran ─────────────────────────────────────────

export type AttachmentCategory =
  | 'delivery_note'
  | 'qc_inspection'
  | 'truck_photo'
  | 'other';

/** Mirrors AttachmentResponse (GET/POST /receipts/{id}/attachments). */
export interface AttachmentDTO {
  id: number;
  document_id: number;
  category: AttachmentCategory;
  file_name: string;
  file_size_bytes: number;
  file_url: string;
  uploaded_by: number;
  created_at: string;
}

/** Body for POST /receipts/{id}/attachments (metadata row; binary uploaded separately). */
export interface AddAttachmentRequestDTO {
  category: AttachmentCategory;
  file_name: string;
  file_size_bytes?: number;
  file_url: string;
}

// ── Stock ─────────────────────────────────────────────────────────────

// StockMovementDTO mirrors the GET /stock/ledger rows (movement joined with
// item / location / batch / user). The older cursor endpoint /stock/movements
// returns a narrower shape (no joined fields), but it is unused by the UI.
export interface StockMovementDTO {
  id: number;
  moved_at: string;
  item_id: number;
  sku: string;
  item_name: string;
  base_uom: string;
  location_id: number | null;
  location_code: string;
  batch_id: number | null;
  batch_no: string;
  status: string;
  movement_type: string;
  qty: number;
  qty_after: number;
  doc_no: string;
  created_by: number;
  operator_name: string;
}

// ── Shared read / query endpoints (Fase 10.4) ─────────────────────────

export type DocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface DocumentSummaryDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: DocumentStatus;
  warehouse_id: number;
  dest_warehouse_id: number | null;
  partner_id: number | null;
  reason_code: string;
  notes: string;
  created_at: string;
  created_by: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  completed_at: string | null;
  manager_approved_by: number | null;
  manager_approved_at: string | null;
  warehouse_code: string;
  warehouse_name: string;
  dest_warehouse_code: string;
  dest_warehouse_name: string;
  partner_code: string;
  partner_name: string;
  ref_doc_no: string;
  line_count: number;
}

export interface DocumentLineDTO {
  id: number;
  document_id: number;
  line_no: number;
  item_id: number;
  sku: string;
  item_name: string;
  uom: string;
  conv_factor: number;
  qty_request: number;
  qty_processed: number;
  batch_id: number | null;
  location_id: number | null;
  status: string;
  notes: string;
}

export interface WarehouseRefDTO {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface PartnerRefDTO {
  id: number;
  code: string;
  partner_type: string;
  name: string;
  is_active: boolean;
}

export interface DocumentDetailDTO extends DocumentSummaryDTO {
  source_warehouse?: WarehouseRefDTO;
  dest_warehouse?: WarehouseRefDTO;
  partner?: PartnerRefDTO;
  lines: DocumentLineDTO[];
}

export interface StockBalanceDTO {
  balance_id: number;
  item_id: number;
  sku: string;
  item_name: string;
  base_uom: string;
  category_name: string;
  warehouse_id: number;
  warehouse_name: string;
  location_id: number;
  location_code: string;
  zone: string;
  rack: string;
  level: string;
  batch_id: number | null;
  batch_no: string;
  expiry_date: string | null;
  status: string;
  qty_onhand: number;
  qty_reserved: number;
  updated_at: string;
}

export interface BatchTraceDTO {
  batch_id: number;
  batch_no: string;
  item_id: number;
  sku: string;
  item_name: string;
  base_uom: string;
  mfg_date: string | null;
  expiry_date: string | null;
  balance_id: number | null;
  location_id: number | null;
  location_code: string;
  status: string;
  qty_onhand: number;
  qty_reserved: number;
  grn_no: string;
  grn_date: string | null;
  supplier_name: string;
}

export interface WarehouseDTO {
  id: number;
  code: string;
  name: string;
  address: string;
  is_active: boolean;
}

export interface UserSummaryDTO {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  roles: string[];
  warehouses: string[];
  warehouse_ids: number[];
}

export interface RoleSummaryDTO {
  id: number;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface PermissionDTO {
  id: number;
  code: string;
}

/** Payload for POST /users (password required on create). */
export interface CreateUserPayload {
  username: string;
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  is_active: boolean;
  roles: string[];
  warehouse_ids: number[];
}

/** Payload for PATCH /users/:id (password optional). */
export interface UpdateUserPayload {
  full_name: string;
  email: string;
  phone?: string;
  password?: string;
  is_active: boolean;
  roles: string[];
  warehouse_ids: number[];
}

/** Payload for POST/PATCH /roles. */
export interface RolePayload {
  code: string;
  name: string;
  description?: string;
  permissions: string[];
}

/** Payload for PUT /settings (flat JSON object). */
export type SettingsPayload = Record<string, unknown>;

export interface AuditLogDTO {
  id: number;
  occurred_at: string;
  user_id: number | null;
  actor_username: string;
  action: string;
  entity: string;
  entity_id: number | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string;
  request_id: string;
}

export interface FsnReportDTO {
  id: number;
  sku: string;
  item_name: string;
  category_name: string;
  base_uom: string;
  last_movement_date: string;
  fsn_category: 'fast_moving' | 'slow_moving' | 'dead_stock';
  turnover_ratio: number;
  current_qty: number;
  total_valuation: number;
}

export interface ValuationReportDTO {
  id: number;
  sku: string;
  item_name: string;
  category_name: string;
  uom: string;
  unit_price: number;
  ending_qty: number;
  ending_value: number;
  inbound_qty: number;
  inbound_value: number;
  outbound_qty: number;
  outbound_value: number;
}

export interface SpaceUtilizationDTO {
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  location_id: number;
  location_code: string;
  zone_name: string;
  loc_type: string;
  capacity_volume_m3: number;
  used_volume_m3: number;
}

export interface DashboardSummaryDTO {
  grn_today: number;
  do_today: number;
  req_open: number;
  do_open: number;
  below_min_items: number;
  total_valuation: number;
}

// ── Transfers (Fase 8.1 / FR-5.x) ─────────────────────────────────────

export interface TransferLineSummaryDTO {
  id: number;
  line_no: number;
  item_id: number;
  uom: string;
  qty_request: number;
  qty_processed: number;
}

export interface TransferDocumentResponseDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: string;
  warehouse_id: number;
  dest_warehouse_id: number | null;
  notes: string | null;
  created_by: number;
  lines: TransferLineSummaryDTO[];
}

export interface TransferReceiptSummaryDTO {
  id: number;
  line_id: number;
  qty_sent: number;
  qty_received: number;
  variance: number;
  received_by: number;
}

export interface TransferStatusResponseDTO {
  id: number;
  status: string;
  receipts?: TransferReceiptSummaryDTO[];
  discrepancy?: boolean;
}

// ── Counting / Stock Opname (Fase 8.2-8.4 / FR-6.x) ───────────────────

// CountLineSummaryDTO mirrors CountLineSummary — qty_system is intentionally
// absent (Blind Count FR-6.1): the create response never carries it.
export interface CountLineSummaryDTO {
  id: number;
  item_id: number;
  location_id: number;
  batch_id: number | null;
  qty_counted: number | null;
  variance: number | null;
  reason_code: string | null;
}

export interface CountDocumentResponseDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: string;
  warehouse_id: number;
  notes: string | null;
  created_by: number;
  lines: CountLineSummaryDTO[];
}

// CountLineDetailDTO mirrors CountLineDetail. qty_system is null/absent when
// the field screen requests ?blind=1 (Blind Count FR-6.1).
export interface CountLineDetailDTO {
  id: number;
  item_id: number;
  sku: string;
  item_name: string;
  uom: string;
  location_id: number;
  location_code: string;
  batch_id: number | null;
  batch_no: string;
  expiry_date: string | null;
  qty_system: number | null;
  qty_counted: number | null;
  variance: number | null;
  reason_code: string;
  counted_by: number | null;
  counted_at: string | null;
}

export interface CountDocumentDetailDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: string;
  warehouse_id: number;
  notes: string;
  created_at: string;
  created_by: number;
  warehouse_code: string;
  warehouse_name: string;
  lines: CountLineDetailDTO[];
}

export interface PostCountResponseDTO {
  id: number;
  status: string;
  total_variance: number;
  total_variance_value: number;
  needs_manager_approval: boolean;
  posted_adjustment_lines: number;
}

// AdjustmentDocumentResponseDTO mirrors AdjustmentDocumentResponse — a manual
// ADJ (FR-6.5) that is posted immediately and closed as `completed`.
export interface AdjustmentDocumentResponseDTO {
  id: number;
  public_id: string;
  doc_no: string;
  doc_type: string;
  doc_date: string;
  status: string;
  warehouse_id: number;
  reason_code: string;
  notes: string;
  created_by: number;
}
