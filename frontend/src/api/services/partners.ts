import { get, post, patch } from '../base';
import { PartnerDTO, CreatePartnerRequestDTO, UpdatePartnerRequestDTO } from '../dto';

export const partnerService = {
  listPartners(): Promise<PartnerDTO[]> {
    return get<PartnerDTO[]>('/partners');
  },

  getPartner(id: number): Promise<PartnerDTO> {
    return get<PartnerDTO>(`/partners/${id}`);
  },

  createPartner(payload: CreatePartnerRequestDTO): Promise<PartnerDTO> {
    return post<PartnerDTO>('/partners', payload);
  },

  /** PATCH /partners/{id} — full-form replace of an existing partner. */
  updatePartner(id: number, payload: UpdatePartnerRequestDTO): Promise<PartnerDTO> {
    return patch<PartnerDTO>(`/partners/${id}`, payload);
  },
};
