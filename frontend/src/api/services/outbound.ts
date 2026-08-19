import { get, post } from '../base';

/** Request line input for POST /requests (matches backend dto.CreateRequestRequest). */
export interface CreateRequestLineInput {
  item_id: number;
  qty: number;
  uom: string;
  notes?: string | null;
}

export interface CreateRequestInput {
  warehouse_id: number;
  partner_id: number;
  notes?: string | null;
  lines: CreateRequestLineInput[];
}

/** Allocation line input for POST /deliveries/:id/allocate. */
export interface AllocateLineInput {
  line_id: number;
  qty: number;
}

export interface AllocationResultDTO {
  line_id: number;
  allocation_id: number;
  balance_id: number;
  location_code: string;
  batch_id: number | null;
  qty_allocated: number;
}

export interface OutboundStatusResponse {
  id: number;
  status: string;
}

/** One allocation row of GET /deliveries/:id/picking-list (PickingListItem). */
export interface PickingListItemDTO {
  allocation_id: number;
  line_id: number;
  item_id: number;
  sku: string;
  base_uom: string;
  location_code: string;
  pick_seq: number | null;
  batch_id: number | null;
  batch_no: string;
  qty_allocated: number;
  qty_picked: number;
  qty_remaining: number;
}

/** One confirmed scan of POST /deliveries/:id/pick (PickScanRequest). */
export interface PickScanPayload {
  allocation_id: number;
  location_barcode: string;
  item_barcode: string;
  qty: number;
}

export const outboundService = {
  createRequest(input: CreateRequestInput): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>('/requests', input);
  },

  submitRequest(id: number): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>(`/requests/${id}/submit`);
  },

  approveRequest(id: number): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>(`/requests/${id}/approve`);
  },

  submitDelivery(id: number): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>(`/deliveries/${id}/submit`);
  },

  approveDelivery(id: number): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>(`/deliveries/${id}/approve`);
  },

  allocateDelivery(id: number, lines: AllocateLineInput[]): Promise<AllocationResultDTO[]> {
    return post<AllocationResultDTO[]>(`/deliveries/${id}/allocate`, { lines });
  },

  /** Picking list ordered by pick_seq (FR-4.3). Requires do.pick. */
  getPickingList(id: number): Promise<PickingListItemDTO[]> {
    return get<PickingListItemDTO[]>(`/deliveries/${id}/picking-list`);
  },

  /** Confirm picking via barcode scan (FR-4.4). Requires do.pick. */
  confirmPick(id: number, scans: PickScanPayload[]): Promise<OutboundStatusResponse> {
    return post<OutboundStatusResponse>(`/deliveries/${id}/pick`, { scans });
  },
};
