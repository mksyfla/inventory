import { get, post } from '../base';
import {
  CountDocumentResponseDTO,
  CountDocumentDetailDTO,
  CountLineSummaryDTO,
  PostCountResponseDTO,
  AdjustmentDocumentResponseDTO,
} from '../dto';

/** Payload for POST /counts (FR-6.1). zone/item_ids narrow the snapshot scope. */
export interface CreateCountInput {
  warehouse_id: number;
  zone?: string;
  item_ids?: number[];
  idempotency_key?: string;
  notes?: string;
}

/** One field reading for POST /counts/{id}/lines (FR-6.2). */
export interface InputCountLineInput {
  count_line_id: number;
  qty_counted: number;
  reason_code?: string;
}

/** One stock-movement row for POST /adjustments (FR-6.5). qty is signed. */
export interface AdjustmentLineInput {
  item_id: number;
  location_id: number;
  qty: number;
  batch_id?: number;
  status?: 'available' | 'damaged' | 'quarantine';
  reason_code?: string;
}

/** Payload for POST /adjustments — direct manual adjustment (FR-6.5). */
export interface CreateAdjustmentInput {
  warehouse_id: number;
  reason_code: string;
  notes: string;
  idempotency_key?: string;
  lines: AdjustmentLineInput[];
}

export const countService = {
  createCount(input: CreateCountInput): Promise<CountDocumentResponseDTO> {
    return post<CountDocumentResponseDTO>('/counts', input);
  },

  /**
   * GET /counts/{id}. The field-screen (blind count) variant passes blind=true
   * so the backend omits qty_system from the payload (FR-6.1) — the counting
   * device must never receive the system quantity.
   */
  getCountDetail(id: number, blind = false): Promise<CountDocumentDetailDTO> {
    return get<CountDocumentDetailDTO>(`/counts/${id}${blind ? '?blind=1' : ''}`);
  },

  inputCountLines(id: number, lines: InputCountLineInput[]): Promise<CountLineSummaryDTO[]> {
    return post<CountLineSummaryDTO[]>(`/counts/${id}/lines`, { lines });
  },

  postCount(id: number, managerApproverId?: number): Promise<PostCountResponseDTO> {
    return post<PostCountResponseDTO>(
      `/counts/${id}/post`,
      managerApproverId ? { manager_approver_id: managerApproverId } : {}
    );
  },

  /** POST /adjustments — direct manual adjustment outside a stock-opname session. */
  createAdjustment(input: CreateAdjustmentInput): Promise<AdjustmentDocumentResponseDTO> {
    return post<AdjustmentDocumentResponseDTO>('/adjustments', input);
  },
};
