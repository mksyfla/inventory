import { get, post, del } from '../base';
import {
  AddAttachmentRequestDTO,
  AttachmentDTO,
  CreateReceiptRequestDTO,
  ReceiptDocumentDTO,
  ReceiptStatusDTO,
  PutawayRequestDTO,
  PutawaySuggestionDTO,
} from '../dto';

export const receiptService = {
  createReceipt(payload: CreateReceiptRequestDTO): Promise<ReceiptDocumentDTO> {
    return post<ReceiptDocumentDTO>('/receipts', payload);
  },

  submitReceipt(id: number): Promise<ReceiptStatusDTO> {
    return post<ReceiptStatusDTO>(`/receipts/${id}/submit`);
  },

  approveReceipt(id: number): Promise<ReceiptStatusDTO> {
    return post<ReceiptStatusDTO>(`/receipts/${id}/approve`);
  },

  putawaySuggestion(id: number): Promise<PutawaySuggestionDTO[]> {
    return get<PutawaySuggestionDTO[]>(`/receipts/${id}/putaway-suggestion`);
  },

  putaway(id: number, payload: PutawayRequestDTO): Promise<ReceiptStatusDTO> {
    return post<ReceiptStatusDTO>(`/receipts/${id}/putaway`, payload);
  },

  // ── GRN lampiran (metadata rows) ─────────────────────────────────────

  listAttachments(id: number): Promise<AttachmentDTO[]> {
    return get<AttachmentDTO[]>(`/receipts/${id}/attachments`);
  },

  createAttachment(id: number, payload: AddAttachmentRequestDTO): Promise<AttachmentDTO> {
    return post<AttachmentDTO>(`/receipts/${id}/attachments`, payload);
  },

  deleteAttachment(id: number, attachmentId: number): Promise<{ deleted: boolean }> {
    return del<{ deleted: boolean }>(`/receipts/${id}/attachments/${attachmentId}`);
  },
};
