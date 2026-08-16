import { get, post } from '../base';
import {
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
};
