import { post } from '../base';
import { TransferDocumentResponseDTO, TransferStatusResponseDTO } from '../dto';

/** One item row of a new transfer (POST /transfers). */
export interface TransferLineInput {
  item_id: number;
  qty: number;
  uom?: string;
  notes?: string;
}

export interface CreateTransferInput {
  warehouse_id: number;
  dest_warehouse_id: number;
  idempotency_key?: string;
  notes?: string;
  lines: TransferLineInput[];
}

/** One line receipt at the destination warehouse (POST /transfers/{id}/receive). */
export interface ReceiveLineInput {
  line_id: number;
  qty_received: number;
  location_id: number;
  batch_id?: number;
  notes?: string;
}

export const transferService = {
  createTransfer(input: CreateTransferInput): Promise<TransferDocumentResponseDTO> {
    return post<TransferDocumentResponseDTO>('/transfers', input);
  },

  submitTransfer(id: number): Promise<TransferStatusResponseDTO> {
    return post<TransferStatusResponseDTO>(`/transfers/${id}/submit`);
  },

  approveTransfer(id: number): Promise<TransferStatusResponseDTO> {
    return post<TransferStatusResponseDTO>(`/transfers/${id}/approve`);
  },

  sendTransfer(id: number): Promise<TransferStatusResponseDTO> {
    return post<TransferStatusResponseDTO>(`/transfers/${id}/send`);
  },

  receiveTransfer(id: number, lines: ReceiveLineInput[]): Promise<TransferStatusResponseDTO> {
    return post<TransferStatusResponseDTO>(`/transfers/${id}/receive`, { lines });
  },
};
