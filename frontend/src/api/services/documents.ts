import { get } from '../base';
import { DocumentDetailDTO, DocumentSummaryDTO } from '../dto';

export interface DocumentListParams {
  doc_type?: string;
  status?: string;
  warehouse_id?: number;
  limit?: number;
  offset?: number;
}

export const documentService = {
  list(params: DocumentListParams = {}): Promise<DocumentSummaryDTO[]> {
    const query = new URLSearchParams();
    if (params.doc_type) query.set('doc_type', params.doc_type);
    if (params.status) query.set('status', params.status);
    if (params.warehouse_id && params.warehouse_id > 0) {
      query.set('warehouse_id', String(params.warehouse_id));
    }
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return get<DocumentSummaryDTO[]>(`/documents${qs ? `?${qs}` : ''}`);
  },

  getDetail(id: number): Promise<DocumentDetailDTO> {
    return get<DocumentDetailDTO>(`/documents/${id}`);
  },
};
