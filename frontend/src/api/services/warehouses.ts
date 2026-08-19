import { get } from '../base';
import { WarehouseDTO } from '../dto';

export const warehouseService = {
  list(): Promise<WarehouseDTO[]> {
    return get<WarehouseDTO[]>('/warehouses');
  },
};
