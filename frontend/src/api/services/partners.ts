import { get, post } from '../base';
import { PartnerDTO, CreatePartnerRequestDTO } from '../dto';

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
};
