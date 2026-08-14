import { get, post } from '../base';
import { LocationDTO, CreateLocationRequestDTO } from '../dto';

export const locationService = {
  listLocations(warehouseId: number): Promise<LocationDTO[]> {
    return get<LocationDTO[]>('/locations', { params: { warehouse_id: warehouseId } });
  },

  createLocation(payload: CreateLocationRequestDTO): Promise<LocationDTO> {
    return post<LocationDTO>('/locations', payload);
  },
};
